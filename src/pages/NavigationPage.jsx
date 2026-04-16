import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import MapView, { Polyline, Marker } from "react-native-maps";

import DirectionArrow from "../components/DirectionArrow";
import campusData from "../data/campusData.json";
import { findRoom } from "../utils/findRoom";
import { findWaypointByQrData, getWaypointById, getBuildingEntrances } from "../utils/qrWaypointLookup";
import { buildStageNavigation } from "../utils/pathfinding";
import { calculateBearingDegrees } from "../utils/location";
import { advanceRouteIfNeeded } from "../utils/routeSteps";
import { fetchOrsRoute } from "../utils/orsRouting";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  green: "#18794E",
  light: "#F5F7FA",
  border: "#DCE5F0",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
  nextBg: "rgba(255,255,255,0.96)",
  nextBorder: "#C9D9FF",
  arrivalBg: "rgba(238,248,241,0.97)",
  arrivalBorder: "#B7DEC1",
  cardBg: "rgba(255,255,255,0.985)",
  overlayDarkStrong: "rgba(0,0,0,0.34)",
  modalBackdrop: "rgba(0,0,0,0.40)",
  scanBadgeBg: "rgba(255,255,255,0.96)",
  scanBadgeBorder: "#CFE0FF",
  helpBlue: "#EAF1FF",
  helpBlueBorder: "#C9D9FF",
  helpFieldBg: "#F8FAFD",
  errorBg: "#FFF1F1",
  errorBorder: "#F3C7C7",
  errorText: "#B42318",
  mapBg: "#EAF2FF",
  mapBorder: "#C9D9FF",
  mapAccent: "#2E6BDB",
};

const HELP_MODE = {
  OUTSIDE: "outside",
  CORRECT: "correct",
  WRONG: "wrong",
  UNKNOWN: "unknown",
};

const VIEW_MODE = {
  OUTDOOR: "outdoor",
  INDOOR: "indoor",
};

// How close (meters) to an entrance waypoint before we
// show the "Scan entrance QR" prompt instead of continuing to navigate.
const ENTRANCE_REACHED_THRESHOLD_METERS = 20;
const DEBUG_NAV = true;

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function SectionTitle({ icon, text }) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <Text style={s.sectionTitleText}>{text}</Text>
    </View>
  );
}

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters) || !Number.isFinite(meters)) {
    return { metersText: "-- m", feetText: "-- ft" };
  }

  const m = Number(meters);
  const ft = m * 3.28084;

  return {
    metersText: `${m.toFixed(1)} m`,
    feetText: `${ft.toFixed(0)} ft`,
  };
}

function getArrowDirectionFromText(stepText = "") {
  const t = String(stepText).toLowerCase();
  if (t.includes("left")) return "left";
  if (t.includes("right")) return "right";
  if (t.includes("back")) return "back";
  return "straight";
}

function getStepIcon(stepText = "") {
  const t = String(stepText).toLowerCase();
  if (t.includes("elevator")) return "🛗";
  if (t.includes("stairs")) return "🪜";
  if (t.includes("entrance")) return "🚪";
  if (t.includes("arrived") || t.includes("destination")) return "✅";
  return "➡️";
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

function guessBuildingFromGps(userGps) {
  if (!userGps) {
    return {
      building: null,
      confidence: "unknown",
      distance: Infinity,
    };
  }

  const candidates = (campusData.buildings || [])
    .map((building) => {
      const distance = haversineMeters(
        Number(userGps.latitude),
        Number(userGps.longitude),
        Number(building.latitude),
        Number(building.longitude)
      );

      return { building, distance };
    })
    .sort((a, b) => a.distance - b.distance);

  const best = candidates[0] || null;
  const second = candidates[1] || null;

  if (!best) {
    return {
      building: null,
      confidence: "unknown",
      distance: Infinity,
    };
  }

  const strong =
    best.distance <= 45 && (!second || second.distance - best.distance >= 15);

  return {
    building: best.building,
    confidence: strong ? "high" : "low",
    distance: best.distance,
  };
}

function getOutdoorTargetBuilding({
  stageMode,
  destinationBuilding,
  gpsBuildingGuess,
}) {
  if (stageMode === "exit_current_building") {
    return destinationBuilding || gpsBuildingGuess.building || null;
  }
  return destinationBuilding || null;
}

export default function NavigationPage({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { destination } = route.params || {};
  const destinationRoom = destination?.room || null;
  const destinationBuilding = destination?.building || null;

  const linkedStartWaypoint = useMemo(() => {
    const params = route.params || {};
    const startWaypointId =
      params.startWaypointId || params.waypoint_id || params.waypointId || "";
    const startQrId = params.startQrId || params.qr_id || params.qrCode || "";

    if (!startWaypointId && !startQrId) return null;

    return (
      (campusData.waypoints || []).find((waypoint) => {
        return (
          waypoint.id === startWaypointId || waypoint.qr_code === startQrId
        );
      }) || null
    );
  }, [route.params]);

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [deviceHeading, setDeviceHeading] = useState(0);

  const [currentWaypointLabel, setCurrentWaypointLabel] = useState("Waiting for scan");
  const [currentBuildingId, setCurrentBuildingId] = useState("");
  const [currentWaypointId, setCurrentWaypointId] = useState("");
  const [lastScannedText, setLastScannedText] = useState("");

  const [steps, setSteps] = useState([]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [arrived, setArrived] = useState(false);
  const [scanFlashVisible, setScanFlashVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [transportMode, setTransportMode] = useState("arrow");

  const [pathIds, setPathIds] = useState([]);
  const [routeDistance, setRouteDistance] = useState(Infinity);
  const [nextWaypoint, setNextWaypoint] = useState(null);
  const [stageMode, setStageMode] = useState("idle");
  const [stageMessage, setStageMessage] = useState("");

  const [gpsPermissionGranted, setGpsPermissionGranted] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [userGps, setUserGps] = useState(null);

  const [helpVisible, setHelpVisible] = useState(false);
  const [helpMode, setHelpMode] = useState(HELP_MODE.UNKNOWN);
  const [helpBuildingId, setHelpBuildingId] = useState("");
  const [helpRoomNumber, setHelpRoomNumber] = useState("");
  const [helpError, setHelpError] = useState("");

  const [outdoorScannerVisible, setOutdoorScannerVisible] = useState(false);
  const [forceIndoorAfterScan, setForceIndoorAfterScan] = useState(false);

  const [visionSource, setVisionSource] = useState(null); // "qr" | "vision" | null

  // ─── ORS outdoor route state ──────────────────────────────────────────────
  const [orsCoords, setOrsCoords] = useState([]); // [{latitude, longitude}]
  const [orsSteps, setOrsSteps] = useState([]);   // [{instruction, distance}]
  const [orsMeters, setOrsMeters] = useState(null);
  const [orsLoading, setOrsLoading] = useState(false);
  const [orsError, setOrsError] = useState(null);

  // ─── Transition gate state ────────────────────────────────────────────────
  // "entrance" — user has reached destination building entrance, needs to scan
  // "exit"     — user is at wrong-building exit, needs to scan to go outdoor
  // null       — no pending transition
  const [pendingTransitionType, setPendingTransitionType] = useState(null);
  const [debugEvents, setDebugEvents] = useState([]);
  const [debugVisible, setDebugVisible] = useState(true);
  const [indoorCameraMounted, setIndoorCameraMounted] = useState(false);
  const [indoorBootReady, setIndoorBootReady] = useState(false);

  const cameraRef = useRef(null);
  const indoorCameraTimerRef = useRef(null);
  const indoorBootTimerRef = useRef(null);
  const orsAbortRef = useRef(null);

  const nextStepFade = useRef(new Animated.Value(1)).current;
  const nextStepScale = useRef(new Animated.Value(1)).current;
  const arrivalPulse = useRef(new Animated.Value(1)).current;
  const scanBadgeAnim = useRef(new Animated.Value(0)).current;
  const scanCooldownRef = useRef(false);

  const pushDebug = useCallback((message, details) => {
    const time = new Date().toLocaleTimeString();
    const detailText =
      details == null
        ? ""
        : typeof details === "string"
        ? ` — ${details}`
        : ` — ${JSON.stringify(details)}`;
    const line = `${time} • ${message}${detailText}`;
    console.log("[NavDebug]", line);
    setDebugEvents((current) => [line, ...current].slice(0, 40));
  }, []);

  const destinationTitle = useMemo(() => {
    if (!destinationRoom) return "Choose a Destination";
    return `${destinationBuilding?.name || destinationRoom.building} ${destinationRoom.room_number}`;
  }, [destinationRoom, destinationBuilding]);

  const currentWaypointObj = useMemo(() => {
    return currentWaypointId ? getWaypointById(currentWaypointId) : null;
  }, [currentWaypointId]);

  const currentStep = useMemo(() => {
    if (!Array.isArray(steps) || steps.length === 0) return null;
    return steps[Math.min(activeStepIndex, steps.length - 1)] || null;
  }, [steps, activeStepIndex]);

  const fallbackArrowDirection = useMemo(() => {
    return getArrowDirectionFromText(currentStep?.text || stageMessage || "");
  }, [currentStep, stageMessage]);

  const targetBearing = useMemo(() => {
    if (
      !userGps ||
      !nextWaypoint ||
      nextWaypoint.latitude == null ||
      nextWaypoint.longitude == null
    ) {
      return null;
    }

    return calculateBearingDegrees(
      Number(userGps.latitude),
      Number(userGps.longitude),
      Number(nextWaypoint.latitude),
      Number(nextWaypoint.longitude)
    );
  }, [userGps, nextWaypoint]);

  const formattedDistance = useMemo(() => {
    // Prefer ORS total when outdoors and ORS route is available
    if (orsMeters !== null && viewMode === VIEW_MODE.OUTDOOR) {
      return formatDistance(orsMeters);
    }
    return formatDistance(routeDistance);
  }, [routeDistance, orsMeters]);

  const gpsBuildingGuess = useMemo(() => {
    return guessBuildingFromGps(userGps);
  }, [userGps]);

  const buildingOptions = useMemo(() => {
    return [...(campusData.buildings || [])].sort((a, b) =>
      String(a.name).localeCompare(String(b.name))
    );
  }, []);

  const viewMode = useMemo(() => {
    if (forceIndoorAfterScan) return VIEW_MODE.INDOOR;

    const currentWp = currentWaypointId ? getWaypointById(currentWaypointId) : null;
    const destinationBuildingId =
      destinationBuilding?.id || destinationRoom?.building || "";

    const indoorModes = [
      "indoor_destination",
      "indoor_find_anchor",
      "vertical_transfer",
    ];

    if (indoorModes.includes(stageMode)) {
      return VIEW_MODE.INDOOR;
    }

    if (currentWp) {
      const wpType = String(currentWp.type || "").toLowerCase();
      const isIndoorType =
        wpType !== "outdoor" &&
        wpType !== "external" &&
        wpType !== "parking";

      if (isIndoorType) {
        return VIEW_MODE.INDOOR;
      }

      if (
        destinationBuildingId &&
        normalize(currentWp.building) === normalize(destinationBuildingId)
      ) {
        return VIEW_MODE.INDOOR;
      }
    }

    return VIEW_MODE.OUTDOOR;
  }, [
    forceIndoorAfterScan,
    stageMode,
    currentWaypointId,
    destinationBuilding,
    destinationRoom,
  ]);

  const outdoorTargetBuilding = useMemo(() => {
    return getOutdoorTargetBuilding({
      stageMode,
      destinationBuilding,
      gpsBuildingGuess,
    });
  }, [stageMode, destinationBuilding, gpsBuildingGuess]);

  // ─── Entrance waypoints for destination building ───────────────────────────
  const destinationEntranceWaypoints = useMemo(() => {
    const buildingId = destinationBuilding?.id || destinationRoom?.building || "";
    if (!buildingId) return [];
    return getBuildingEntrances(buildingId);
  }, [destinationBuilding, destinationRoom]);

  // ─── Exit (entrance) waypoints for the current wrong building ─────────────
  const currentBuildingEntranceWaypoints = useMemo(() => {
    if (!currentBuildingId) return [];
    return getBuildingEntrances(currentBuildingId);
  }, [currentBuildingId]);

  // ─── Best GPS target for ORS: nearest entrance waypoint of dest building ──
  const orsDestinationGps = useMemo(() => {
    if (!userGps || destinationEntranceWaypoints.length === 0) {
      // Fall back to building centroid
      if (outdoorTargetBuilding?.latitude && outdoorTargetBuilding?.longitude) {
        return {
          latitude: Number(outdoorTargetBuilding.latitude),
          longitude: Number(outdoorTargetBuilding.longitude),
        };
      }
      return null;
    }

    // Pick nearest entrance to user
    let nearest = null;
    let nearestDist = Infinity;
    for (const wp of destinationEntranceWaypoints) {
      if (wp.latitude == null || wp.longitude == null) continue;
      const d = haversineMeters(
        userGps.latitude,
        userGps.longitude,
        Number(wp.latitude),
        Number(wp.longitude)
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = wp;
      }
    }
    if (!nearest) return null;
    return { latitude: Number(nearest.latitude), longitude: Number(nearest.longitude) };
  }, [userGps, destinationEntranceWaypoints, outdoorTargetBuilding]);



  // ─── Apply linked start waypoint from deep-link / QR ──────────────────────
  useEffect(() => {
    if (!linkedStartWaypoint) return;

    setCurrentWaypointLabel(linkedStartWaypoint.label || linkedStartWaypoint.id);
    setCurrentBuildingId(linkedStartWaypoint.building || "");
    setCurrentWaypointId(linkedStartWaypoint.id || "");
    setLastScannedText(linkedStartWaypoint.qr_code || linkedStartWaypoint.id);
    setVisionSource("qr");
  }, [linkedStartWaypoint]);

  // ─── Apply visual-locate result returned from separate screen ──────────────
  useEffect(() => {
    const result = route.params?.visualLocateResult;
    if (!result?.waypointId) return;

    const matchedWaypoint = (campusData.waypoints || []).find(
      (waypoint) => waypoint.id === result.waypointId
    );

    if (!matchedWaypoint) return;

    pushDebug("visual locate applied", matchedWaypoint.id || matchedWaypoint.label || "unknown");
    setCurrentWaypointLabel(matchedWaypoint.label || matchedWaypoint.id);
    setCurrentBuildingId(matchedWaypoint.building || "");
    setCurrentWaypointId(matchedWaypoint.id || "");
    setForceIndoorAfterScan(true);
    setVisionSource("vision");
    showScanBadge(matchedWaypoint.label || matchedWaypoint.id);

    if (navigation?.setParams) {
      navigation.setParams({ visualLocateResult: undefined });
    }
  }, [route.params?.visualLocateResult, navigation, pushDebug]);

  // ─── GPS building fallback ─────────────────────────────────────────────────
  useEffect(() => {
    if (currentBuildingId) return;
    if (gpsBuildingGuess.building && gpsBuildingGuess.confidence === "high") {
      setCurrentBuildingId(gpsBuildingGuess.building.id);
    }
  }, [gpsBuildingGuess, currentBuildingId]);

  // ─── Step card animation ───────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR) return;

    nextStepFade.setValue(0.55);
    nextStepScale.setValue(0.97);

    Animated.parallel([
      Animated.timing(nextStepFade, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(nextStepScale, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [activeStepIndex, arrived, nextStepFade, nextStepScale, viewMode]);

  // ─── Arrival pulse ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!arrived) {
      arrivalPulse.stopAnimation();
      arrivalPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrivalPulse, {
          toValue: 1.02,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(arrivalPulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [arrived, arrivalPulse]);

  // ─── Location (GPS only) ──────────────────────────────────────────────────
  useEffect(() => {
    let locationSubscription = null;

    async function setupLocation() {
      try {
        setGpsLoading(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
        pushDebug("gps permission", status);
        if (status !== "granted") {
          setGpsPermissionGranted(false);
          setGpsLoading(false);
          return;
        }

        setGpsPermissionGranted(true);

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setUserGps({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
        pushDebug("gps initial fix", {
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 3,
          },
          (loc) => {
            setUserGps({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        );
      } catch (error) {
        pushDebug("gps setup failed", error?.message || "unknown error");
        console.log("Location setup failed:", error);
      } finally {
        setGpsLoading(false);
      }
    }

    setupLocation();

    return () => {
      if (locationSubscription?.remove) locationSubscription.remove();
    };
  }, [pushDebug]);

  // ─── Indoor boot gate ──────────────────────────────────────────────────────
  useEffect(() => {
    if (indoorBootTimerRef.current) {
      clearTimeout(indoorBootTimerRef.current);
      indoorBootTimerRef.current = null;
    }

    if (viewMode !== VIEW_MODE.INDOOR) {
      setIndoorBootReady(false);
      setIndoorCameraMounted(false);
      setCameraEnabled(true);
      return;
    }

    pushDebug("indoor boot", "shell");
    setIndoorBootReady(false);
    setIndoorCameraMounted(false);
    setCameraEnabled(false);

    indoorBootTimerRef.current = setTimeout(() => {
      setIndoorBootReady(true);
      pushDebug("indoor boot", "ready");
    }, 1000);

    return () => {
      if (indoorBootTimerRef.current) {
        clearTimeout(indoorBootTimerRef.current);
        indoorBootTimerRef.current = null;
      }
      setIndoorBootReady(false);
      setIndoorCameraMounted(false);
    };
  }, [viewMode, pushDebug]);

  // ─── Heading (indoor only) ─────────────────────────────────────────────────
  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR || !indoorBootReady) return;

    let headingSubscription = null;
    let cancelled = false;

    async function setupHeading() {
      try {
        pushDebug("heading watcher", "starting (indoor only)");

        headingSubscription = await Location.watchHeadingAsync((heading) => {
          if (cancelled) return;

          if (typeof heading?.trueHeading === "number" && heading.trueHeading >= 0) {
            setDeviceHeading(heading.trueHeading);
          } else if (typeof heading?.magHeading === "number") {
            setDeviceHeading(heading.magHeading);
          }
        });
      } catch (error) {
        pushDebug("heading setup failed", error?.message || "unknown error");
        console.log("Heading setup failed:", error);
      }
    }

    setupHeading();

    return () => {
      cancelled = true;
      pushDebug("heading watcher", "stopped");
      if (headingSubscription?.remove) headingSubscription.remove();
    };
  }, [viewMode, indoorBootReady, pushDebug]);

  // ─── Indoor camera mount (after boot) ──────────────────────────────────────
  useEffect(() => {
    if (indoorCameraTimerRef.current) {
      clearTimeout(indoorCameraTimerRef.current);
      indoorCameraTimerRef.current = null;
    }

    if (viewMode !== VIEW_MODE.INDOOR || !indoorBootReady) {
      setIndoorCameraMounted(false);
      return;
    }

    pushDebug("indoor camera", "mount scheduled");

    indoorCameraTimerRef.current = setTimeout(() => {
      setCameraEnabled(true);
      setIndoorCameraMounted(true);
      pushDebug("indoor camera", "mounted");
    }, 450);

    return () => {
      if (indoorCameraTimerRef.current) {
        clearTimeout(indoorCameraTimerRef.current);
        indoorCameraTimerRef.current = null;
      }
      setIndoorCameraMounted(false);
      pushDebug("indoor camera", "unmounted");
    };
  }, [viewMode, indoorBootReady, pushDebug]);

  // ─── Indoor pathfinding ────────────────────────────────────────────────────
  useEffect(() => {
    const nav = buildStageNavigation({
      currentWaypointId,
      currentBuildingId,
      destinationBuildingId: destinationBuilding?.id || destinationRoom?.building || "",
      destinationRoomNumber: destinationRoom?.room_number || "",
      userGps,
      accessibleOnly: true,
    });

    setSteps(Array.isArray(nav.steps) ? nav.steps : []);
    setPathIds(Array.isArray(nav.path) ? nav.path : []);
    setNextWaypoint(nav.nextWaypoint || null);
    setRouteDistance(nav.distance ?? Infinity);
    setTransportMode(nav.transportMode || "arrow");
    setStageMode(nav.mode || "idle");
    setStageMessage(nav.message || "");
    setArrived(Boolean(nav.arrived));

    if (Array.isArray(nav.steps) && nav.steps.length > 0) {
      const idx = nav.steps.findIndex((step) => step.waypointId === nav.nextWaypoint?.id);
      setActiveStepIndex(idx >= 0 ? idx : nav.arrived ? nav.steps.length - 1 : 0);
    } else {
      setActiveStepIndex(0);
    }
  }, [
    currentWaypointId,
    currentBuildingId,
    destinationBuilding,
    destinationRoom,
    userGps,
  ]);

  // ─── Indoor route advancement ──────────────────────────────────────────────
  useEffect(() => {
    if (!userGps || !currentWaypointId || pathIds.length === 0 || arrived) return;

    const advanced = advanceRouteIfNeeded({
      currentWaypointId,
      currentPosition: userGps,
      pathIds,
      thresholdMeters: 8,
    });

    if (advanced.advanced && advanced.currentWaypointId !== currentWaypointId) {
      const next = getWaypointById(advanced.currentWaypointId);
      setCurrentWaypointId(advanced.currentWaypointId);
      if (next?.building) setCurrentBuildingId(next.building);
      if (next?.label) setCurrentWaypointLabel(next.label);
    }
  }, [userGps, currentWaypointId, pathIds, arrived]);

  // ─── ORS outdoor route fetch ───────────────────────────────────────────────
  // Fires whenever we are in outdoor mode and both user GPS + ORS destination are available.
  // Re-fetches every time userGps changes by >15 m (handled by debounce ref below).
  const lastOrsFetchRef = useRef(null);
  useEffect(() => {
    if (viewMode !== VIEW_MODE.OUTDOOR) return;
    if (!userGps || !orsDestinationGps) return;
    pushDebug("ors fetch candidate", { userGps, orsDestinationGps });

    // Debounce: don't re-fetch if user hasn't moved >15 m since last fetch
    if (lastOrsFetchRef.current) {
      const moved = haversineMeters(
        lastOrsFetchRef.current.latitude,
        lastOrsFetchRef.current.longitude,
        userGps.latitude,
        userGps.longitude
      );
      if (moved < 15) return;
    }

    lastOrsFetchRef.current = userGps;

    // Cancel previous in-flight fetch
    if (orsAbortRef.current) {
      orsAbortRef.current.cancelled = true;
    }
    const handle = { cancelled: false };
    orsAbortRef.current = handle;

    setOrsLoading(true);
    setOrsError(null);

    fetchOrsRoute(userGps, orsDestinationGps)
      .then((result) => {
        if (handle.cancelled) return;
        pushDebug("ors fetch success", { points: result.coordinates?.length || 0, steps: result.steps?.length || 0, meters: result.totalMeters ?? null });
        setOrsCoords(result.coordinates);
        setOrsSteps(result.steps);
        setOrsMeters(result.totalMeters);
        setOrsLoading(false);
      })
      .catch((err) => {
        if (handle.cancelled) return;
        pushDebug("ors fetch failed", err?.message || "unknown error");
        console.warn("[ORS] Route fetch failed:", err.message);
        setOrsError("Route unavailable");
        setOrsLoading(false);
      });
  }, [viewMode, userGps, orsDestinationGps]);

  // ─── Entrance proximity detection ─────────────────────────────────────────
  // Case A/B: outdoor → approaching destination building entrance
  useEffect(() => {
    if (viewMode !== VIEW_MODE.OUTDOOR) {
      // Clear entrance-reached if we go indoor
      if (pendingTransitionType === "entrance") setPendingTransitionType(null);
      return;
    }
    if (!userGps || destinationEntranceWaypoints.length === 0) return;

    const nearAny = destinationEntranceWaypoints.some((wp) => {
      if (wp.latitude == null || wp.longitude == null) return false;
      return (
        haversineMeters(
          userGps.latitude,
          userGps.longitude,
          Number(wp.latitude),
          Number(wp.longitude)
        ) <= ENTRANCE_REACHED_THRESHOLD_METERS
      );
    });

    setPendingTransitionType(nearAny ? "entrance" : null);
  }, [viewMode, userGps, destinationEntranceWaypoints]);

  // ─── Exit proximity detection (wrong building) ────────────────────────────
  // Case C: indoor in wrong building → approaching an exit entrance waypoint
  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR) {
      if (pendingTransitionType === "exit") setPendingTransitionType(null);
      return;
    }

    const destinationBuildingId =
      destinationBuilding?.id || destinationRoom?.building || "";

    // Only show exit prompt when user is in the WRONG building
    const inCorrectBuilding =
      !destinationBuildingId ||
      normalize(currentBuildingId) === normalize(destinationBuildingId);

    if (inCorrectBuilding) {
      if (pendingTransitionType === "exit") setPendingTransitionType(null);
      return;
    }

    if (!userGps || currentBuildingEntranceWaypoints.length === 0) return;

    const nearExit = currentBuildingEntranceWaypoints.some((wp) => {
      if (wp.latitude == null || wp.longitude == null) return false;
      return (
        haversineMeters(
          userGps.latitude,
          userGps.longitude,
          Number(wp.latitude),
          Number(wp.longitude)
        ) <= ENTRANCE_REACHED_THRESHOLD_METERS
      );
    });

    setPendingTransitionType(nearExit ? "exit" : null);
  }, [
    viewMode,
    userGps,
    currentBuildingId,
    destinationBuilding,
    destinationRoom,
    currentBuildingEntranceWaypoints,
  ]);

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function showScanBadge(label) {
    setScanFlashVisible(true);
    scanBadgeAnim.setValue(0);

    Animated.timing(scanBadgeAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setTimeout(() => {
        Animated.timing(scanBadgeAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setScanFlashVisible(false));
      }, 1400);
    });

    if (label) setLastScannedText(label);
  }

  // ─── Indoor QR scan ────────────────────────────────────────────────────────
  function handleScan({ data }) {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);

    const qrText = String(data || "").trim();
    if (!qrText) return;
    pushDebug("indoor qr scan", qrText);

    const scannedWaypoint = findWaypointByQrData(qrText);
    setLastScannedText(qrText);

    if (scannedWaypoint) {
      pushDebug("indoor qr matched", scannedWaypoint.id || scannedWaypoint.label || "unknown");
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId(scannedWaypoint.building || "");
      setCurrentWaypointId(scannedWaypoint.id || "");
      setForceIndoorAfterScan(true);
      setVisionSource("qr");
      showScanBadge(scannedWaypoint.label || scannedWaypoint.id);
    } else {
      pushDebug("indoor qr unmatched", qrText);
      setCurrentWaypointLabel(`Scanned: ${qrText}`);
      setVisionSource(null);
      showScanBadge(qrText);
    }
  }

  // ─── Outdoor QR scan (entrance or exit) ───────────────────────────────────
  // Used for both Case A (entrance → indoor) and Case C (exit → outdoor continuation).
  function handleOutdoorQrScan({ data }) {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;

    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);

    const qrText = String(data || "").trim();
    if (!qrText) return;

    const transitionType = pendingTransitionType || "none";
    pushDebug("outdoor qr scan", { qrText, transition: transitionType });

    const scannedWaypoint = findWaypointByQrData(qrText);
    setLastScannedText(qrText);

    if (!scannedWaypoint) {
      pushDebug("outdoor qr unmatched", qrText);
      showScanBadge(qrText);
      return;
    }

    pushDebug("outdoor qr matched", scannedWaypoint.id || scannedWaypoint.label || "unknown");
    setCameraEnabled(false);
    setIndoorCameraMounted(false);
    setIndoorBootReady(false);
    setVisionSource("qr");
    setDetailsVisible(false);
    setHelpVisible(false);
    showScanBadge(scannedWaypoint.label || scannedWaypoint.id);

    // Close outdoor scanner first so Android can release that camera.
    setOutdoorScannerVisible(false);
    setPendingTransitionType(null);

    setTimeout(() => {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId(scannedWaypoint.building || "");
      setCurrentWaypointId(scannedWaypoint.id || "");

      if (transitionType === "entrance") {
        setForceIndoorAfterScan(true);
        setOrsCoords([]);
        setOrsSteps([]);
        setOrsMeters(null);
        lastOrsFetchRef.current = null;
      } else if (transitionType === "exit") {
        setForceIndoorAfterScan(false);
        setCurrentWaypointId("");
        lastOrsFetchRef.current = null;
      } else {
        setForceIndoorAfterScan(true);
      }

      pushDebug("outdoor->indoor transition", "completed");
    }, 700);
  }


  function openOutdoorScanner() {
    pushDebug("open outdoor scanner", pendingTransitionType || "manual");
    setOutdoorScannerVisible(true);
  }

  function handleReset() {
    pushDebug("reset navigation");
    setForceIndoorAfterScan(false);
    setPendingTransitionType(null);
    setOrsCoords([]);
    setOrsSteps([]);
    setOrsMeters(null);
    lastOrsFetchRef.current = null;

    if (linkedStartWaypoint) {
      setCurrentWaypointLabel(linkedStartWaypoint.label || linkedStartWaypoint.id);
      setCurrentBuildingId(linkedStartWaypoint.building || "");
      setCurrentWaypointId(linkedStartWaypoint.id || "");
      setLastScannedText(linkedStartWaypoint.qr_code || linkedStartWaypoint.id);
    } else {
      setCurrentWaypointLabel("Waiting for scan");
      setCurrentWaypointId("");
      setLastScannedText("");
      if (gpsBuildingGuess.building && gpsBuildingGuess.confidence === "high") {
        setCurrentBuildingId(gpsBuildingGuess.building.id);
      } else {
        setCurrentBuildingId("");
      }
    }

    setDetailsVisible(false);
    setVisionSource(linkedStartWaypoint ? "qr" : null);
  }

  function detectHelpMode() {
    if (!destinationBuilding) return HELP_MODE.UNKNOWN;
    if (!userGps) return HELP_MODE.UNKNOWN;

    const guess = gpsBuildingGuess;
    const CAMPUS_THRESHOLD = 180;

    if (!guess.building) return HELP_MODE.UNKNOWN;
    if (guess.distance > CAMPUS_THRESHOLD) return HELP_MODE.OUTSIDE;
    if (guess.confidence === "low") return HELP_MODE.UNKNOWN;
    if (normalize(guess.building.id) === normalize(destinationBuilding.id)) {
      return HELP_MODE.CORRECT;
    }
    return HELP_MODE.WRONG;
  }

  function openHelpModal() {
    const mode = detectHelpMode();
    setHelpMode(mode);
    setHelpError("");
    setHelpRoomNumber("");

    if (mode === HELP_MODE.CORRECT) {
      setHelpBuildingId(
        currentBuildingId ||
          gpsBuildingGuess.building?.id ||
          destinationBuilding?.id ||
          ""
      );
    } else if (mode === HELP_MODE.WRONG) {
      setHelpBuildingId(gpsBuildingGuess.building?.id || "");
    } else if (mode === HELP_MODE.UNKNOWN) {
      setHelpBuildingId(
        currentBuildingId ||
          gpsBuildingGuess.building?.id ||
          destinationBuilding?.id ||
          ""
      );
    } else {
      setHelpBuildingId(destinationBuilding?.id || "");
    }

    setHelpVisible(true);
  }

  function handleUseRoomLocation() {
    const buildingId = String(helpBuildingId || "").trim();
    const roomNumber = String(helpRoomNumber || "").trim().toUpperCase();

    if (!buildingId) {
      setHelpError("Choose a building first.");
      return;
    }

    if (!roomNumber) {
      setHelpError("Enter a nearby room number.");
      return;
    }

    const result = findRoom(buildingId, roomNumber);

    if (!result?.waypoint) {
      setHelpError(
        `We couldn't find room ${roomNumber} in this building. Check the number or choose another building.`
      );
      return;
    }

    setCurrentBuildingId(buildingId);
    setCurrentWaypointId(result.waypoint.id);
    setCurrentWaypointLabel(result.waypoint.label || `Room ${roomNumber}`);
    setForceIndoorAfterScan(true);
    setHelpError("");
    showScanBadge(`Estimated from room ${roomNumber}`);
    setHelpVisible(false);
  }

  function handleGoToCorrectBuilding() {
    setHelpVisible(false);
    setHelpError("");
    setForceIndoorAfterScan(false);
    setCurrentWaypointId("");
    setCurrentWaypointLabel("Heading to destination building");
    setCurrentBuildingId(gpsBuildingGuess.building?.id || currentBuildingId || "");
    setPendingTransitionType(null);
    lastOrsFetchRef.current = null; // force ORS re-fetch
    showScanBadge(`Route set to ${destinationBuilding?.name || "destination building"}`);
  }

  // ─── Render helpers ────────────────────────────────────────────────────────
  function renderHelpError() {
    if (!helpError) return null;

    return (
      <View style={s.errorCard}>
        <Text style={s.errorText}>{helpError}</Text>
      </View>
    );
  }

  function renderOutsideHelp() {
    return (
      <>
        <Text style={s.helpTitle}>You're outside campus</Text>
        <Text style={s.helpSubtitle}>
          We'll guide you to {destinationBuilding?.name || "the destination building"} first.
        </Text>

        <View style={s.helpInfoCard}>
          <Text style={s.helpInfoTitle}>Destination</Text>
          <Text style={s.helpInfoBody}>{destinationTitle}</Text>
        </View>

        {renderHelpError()}

        <View style={s.helpBottomRow}>
          <Pressable
            style={s.helpSecondaryBtn}
            onPress={() => setHelpVisible(false)}
          >
            <Text style={s.helpSecondaryBtnText}>Close</Text>
          </Pressable>

          <Pressable style={s.helpPrimaryBtn} onPress={handleGoToCorrectBuilding}>
            <Text style={s.helpPrimaryBtnText}>Go to Building</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderCorrectHelp() {
    return (
      <>
        <Text style={s.helpTitle}>
          You're near {destinationBuilding?.name || "the correct building"}
        </Text>
        <Text style={s.helpSubtitle}>
          Enter a room number you can see nearby. The app will use that room's waypoint
          as your indoor location.
        </Text>

        <View style={s.helpInfoCard}>
          <Text style={s.helpInfoTitle}>Detected building</Text>
          <Text style={s.helpInfoBody}>
            {destinationBuilding?.name || helpBuildingId || "Unknown building"}
          </Text>
        </View>

        <SectionTitle icon="🚪" text="Nearby room number" />
        <TextInput
          style={s.helpInput}
          value={helpRoomNumber}
          onChangeText={(value) => {
            setHelpRoomNumber(value);
            if (helpError) setHelpError("");
          }}
          placeholder="Example: 218 or 115A"
          autoCapitalize="characters"
          placeholderTextColor="#7A8797"
        />

        {renderHelpError()}

        <View style={s.helpBottomRow}>
          <Pressable
            style={s.helpSecondaryBtn}
            onPress={() => setHelpVisible(false)}
          >
            <Text style={s.helpSecondaryBtnText}>Close</Text>
          </Pressable>

          <Pressable style={s.helpPrimaryBtn} onPress={handleUseRoomLocation}>
            <Text style={s.helpPrimaryBtnText}>Use This Room</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderWrongHelp() {
    return (
      <>
        <Text style={s.helpTitle}>
          You're near {gpsBuildingGuess.building?.name || "another building"}
        </Text>
        <Text style={s.helpSubtitle}>
          Your destination is in {destinationBuilding?.name || "a different building"}.
          We'll guide you there first.
        </Text>

        <View style={s.helpInfoCard}>
          <Text style={s.helpInfoTitle}>Current guess</Text>
          <Text style={s.helpInfoBody}>
            {gpsBuildingGuess.building?.name || "Unknown"}
            {"\n"}
            Destination: {destinationBuilding?.name || "Unknown"}
          </Text>
        </View>

        {renderHelpError()}

        <View style={s.helpBottomRow}>
          <Pressable
            style={s.helpSecondaryBtn}
            onPress={() => {
              setHelpMode(HELP_MODE.UNKNOWN);
              setHelpBuildingId(destinationBuilding?.id || helpBuildingId || "");
              setHelpError("");
            }}
          >
            <Text style={s.helpSecondaryBtnText}>Choose Building</Text>
          </Pressable>

          <Pressable style={s.helpPrimaryBtn} onPress={handleGoToCorrectBuilding}>
            <Text style={s.helpPrimaryBtnText}>Go to Correct Building</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderUnknownHelp() {
    return (
      <>
        <Text style={s.helpTitle}>We couldn't confirm your building</Text>
        <Text style={s.helpSubtitle}>
          Choose your building, then enter a nearby room number so we can continue navigation.
        </Text>

        <SectionTitle icon="🏢" text="Choose building" />
        <View style={s.buildingList}>
          {buildingOptions.map((building) => {
            const selected = helpBuildingId === building.id;
            return (
              <Pressable
                key={building.id}
                style={[s.buildingCard, selected && s.buildingCardSelected]}
                onPress={() => {
                  setHelpBuildingId(building.id);
                  if (helpError) setHelpError("");
                }}
              >
                <Text style={[s.buildingCardTitle, selected && s.buildingCardTitleSelected]}>
                  {building.name}
                </Text>
                <Text style={s.buildingCardSub}>{building.id}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionTitle icon="🚪" text="Nearby room number" />
        <TextInput
          style={s.helpInput}
          value={helpRoomNumber}
          onChangeText={(value) => {
            setHelpRoomNumber(value);
            if (helpError) setHelpError("");
          }}
          placeholder="Example: 218 or 115A"
          autoCapitalize="characters"
          placeholderTextColor="#7A8797"
        />

        {renderHelpError()}

        <View style={s.helpBottomRow}>
          <Pressable
            style={s.helpSecondaryBtn}
            onPress={() => setHelpVisible(false)}
          >
            <Text style={s.helpSecondaryBtnText}>Close</Text>
          </Pressable>

          <Pressable style={s.helpPrimaryBtn} onPress={handleUseRoomLocation}>
            <Text style={s.helpPrimaryBtnText}>Use This Location</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderHelpContent() {
    switch (helpMode) {
      case HELP_MODE.OUTSIDE:
        return renderOutsideHelp();
      case HELP_MODE.CORRECT:
        return renderCorrectHelp();
      case HELP_MODE.WRONG:
        return renderWrongHelp();
      case HELP_MODE.UNKNOWN:
      default:
        return renderUnknownHelp();
    }
  }

  // ─── Outdoor bottom card: context-sensitive CTA ────────────────────────────
  function renderOutdoorBottomCard() {
    if (pendingTransitionType === "entrance") {
      // Case A: User has reached the destination building entrance
      return (
        <View style={[s.outdoorBottomCard, s.transitionCard]}>
          <Text style={s.transitionCardEyebrow}>ENTRANCE REACHED</Text>
          <Text style={s.transitionCardTitle}>
            You're at {outdoorTargetBuilding?.name || "the destination building"}
          </Text>
          <Text style={s.transitionCardSub}>
            Scan the QR code at the entrance to switch to indoor navigation.
          </Text>

          <Pressable style={s.transitionScanBtn} onPress={openOutdoorScanner}>
            <Text style={s.transitionScanBtnText}>
              📷  I'm at the entrance — Scan QR to continue
            </Text>
          </Pressable>

          <Pressable style={s.transitionSecondaryBtn} onPress={handleReset}>
            <Text style={s.transitionSecondaryBtnText}>Reset</Text>
          </Pressable>
        </View>
      );
    }

    // Normal outdoor guidance card
    return (
      <View style={s.outdoorBottomCard}>
        <Text style={s.outdoorBottomTitle}>
          {stageMode === "exit_current_building"
            ? "Leave the current building and head toward the destination building."
            : stageMode === "outdoor_guidance"
            ? "Follow the outdoor route to the correct building."
            : "Use outdoor guidance until you reach the correct entrance."}
        </Text>

        {orsError ? (
          <Text style={s.orsErrorText}>⚠ {orsError} — using GPS arrow guidance</Text>
        ) : null}

        {orsSteps.length > 0 && !orsError ? (
          <View style={s.orsStepsList}>
            {orsSteps.slice(0, 3).map((step, index) => (
              <Text key={index} style={s.orsStepText} numberOfLines={2}>
                {index === 0 ? "➡ " : "  "}{step.instruction}
              </Text>
            ))}
            {orsSteps.length > 3 ? (
              <Text style={s.orsStepsMore}>+{orsSteps.length - 3} more steps</Text>
            ) : null}
          </View>
        ) : (
          <Text style={s.outdoorBottomText}>
            Use Scan QR when you reach an entrance or indoor anchor so the app can switch into indoor navigation.
          </Text>
        )}

        <View style={s.outdoorBottomButtons}>
          <Pressable style={s.outdoorSecondaryBtn} onPress={handleReset}>
            <Text style={s.outdoorSecondaryBtnText}>Reset</Text>
          </Pressable>

          <Pressable style={s.outdoorScanBtn} onPress={openOutdoorScanner}>
            <Text style={s.outdoorScanBtnText}>Scan QR</Text>
          </Pressable>

          <Pressable
            style={s.outdoorPrimaryBtn}
            onPress={() => setDetailsVisible(true)}
          >
            <Text style={s.outdoorPrimaryBtnText}>Details</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  useEffect(() => {
    pushDebug("mounted", {
      hasDestination: Boolean(destinationRoom),
      destinationBuildingId: destinationBuilding?.id || destinationRoom?.building || "",
    });
    return () => pushDebug("unmounted");
  }, []);

  useEffect(() => {
    pushDebug("viewMode", viewMode);
  }, [viewMode, pushDebug]);

  useEffect(() => {
    pushDebug("stageMode", stageMode || "idle");
  }, [stageMode, pushDebug]);

  useEffect(() => {
    pushDebug("waypoint", currentWaypointId || "none");
  }, [currentWaypointId, pushDebug]);

  useEffect(() => {
    pushDebug(
      "gps",
      userGps ? `${userGps.latitude.toFixed(5)}, ${userGps.longitude.toFixed(5)}` : "none"
    );
  }, [userGps, pushDebug]);

  useEffect(() => {
    pushDebug("ors", {
      loading: orsLoading,
      error: orsError || "",
      points: Array.isArray(orsCoords) ? orsCoords.length : 0,
      meters: orsMeters,
    });
  }, [orsLoading, orsError, orsCoords, orsMeters, pushDebug]);

  function renderDebugPanel() {
    if (!DEBUG_NAV || !debugVisible) return null;

    return (
      <View style={s.debugPanel} pointerEvents="box-none">
        <View style={s.debugCard}>
          <View style={s.debugHeaderRow}>
            <Text style={s.debugTitle}>Nav debug</Text>
            <Pressable onPress={() => setDebugVisible(false)}>
              <Text style={s.debugHideText}>Hide</Text>
            </Pressable>
          </View>
          <Text style={s.debugSummary}>
            {`view=${viewMode} • stage=${stageMode || "idle"} • wp=${currentWaypointId || "none"} • ors=${orsLoading ? "loading" : orsError || "ok"}`}
          </Text>
          <ScrollView style={s.debugLogScroll} nestedScrollEnabled>
            {debugEvents.map((line, index) => (
              <Text key={`${index}-${line}`} style={s.debugLogLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ─── Outdoor view ──────────────────────────────────────────────────────────
  function renderOutdoorView() {
    // Build initial region for MapView
    const mapRegion = userGps
      ? {
          latitude: userGps.latitude,
          longitude: userGps.longitude,
          latitudeDelta: 0.004,
          longitudeDelta: 0.004,
        }
      : orsDestinationGps
      ? {
          latitude: orsDestinationGps.latitude,
          longitude: orsDestinationGps.longitude,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        }
      : null;

    return (
      <SafeAreaView style={s.outdoorSafe} edges={["top"]}>
        <ScrollView
          style={s.outdoorScroll}
          contentContainerStyle={[
            s.outdoorScrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          <View style={s.outdoorHeader}>
            <Pressable style={s.outdoorBackBtn} onPress={() => navigation.goBack()}>
              <Text style={s.outdoorBackText}>← Back</Text>
            </Pressable>

            <View style={s.outdoorHeaderCard}>
              <Text style={s.outdoorEyebrow}>OUTDOOR NAVIGATION</Text>
              <Text style={s.outdoorTitle} numberOfLines={1}>
                {destinationTitle}
              </Text>
              <Text style={s.outdoorSub}>
                {stageMessage || "Follow the outdoor route to the destination building."}
              </Text>
            </View>
          </View>

          {/* ── Real map with ORS polyline ── */}
          <View style={s.mapCard}>
            {mapRegion ? (
              <MapView
                key={outdoorTargetBuilding?.id || destinationTitle}
                style={s.mapView}
                initialRegion={mapRegion}
                showsUserLocation
                showsMyLocationButton={false}
                rotateEnabled={false}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
              >
                {orsCoords.length > 1 ? (
                  <Polyline
                    coordinates={orsCoords}
                    strokeColor={PSU.mapAccent}
                    strokeWidth={4}
                  />
                ) : null}

                {orsDestinationGps ? (
                  <Marker
                    coordinate={orsDestinationGps}
                    title={outdoorTargetBuilding?.name || "Destination"}
                    pinColor={PSU.blue}
                  />
                ) : null}
              </MapView>
            ) : (
              <View style={s.mapPlaceholder}>
                <Text style={s.mapPlaceholderText}>
                  {gpsLoading ? "Acquiring GPS…" : "GPS unavailable"}
                </Text>
              </View>
            )}

            {orsLoading ? (
              <View style={s.mapLoadingOverlay}>
                <ActivityIndicator color={PSU.blue} />
                <Text style={s.mapLoadingText}>Getting route…</Text>
              </View>
            ) : null}

            <View style={s.mapInfoRow}>
              <View style={s.mapInfoPill}>
                <Text style={s.mapInfoPillText}>{formattedDistance.feetText}</Text>
              </View>
              <View style={s.mapInfoPill}>
                <Text style={s.mapInfoPillText}>{formattedDistance.metersText}</Text>
              </View>
              <View style={s.mapInfoPill}>
                <Text style={s.mapInfoPillText}>
                  {gpsBuildingGuess.building?.name || "GPS locating"}
                </Text>
              </View>
            </View>
          </View>

          {renderOutdoorBottomCard()}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Indoor view ───────────────────────────────────────────────────────────
  function renderIndoorView() {
    if (!indoorBootReady) {
      return (
        <View style={s.cameraLayer}>
          <SafeAreaView style={s.overlaySafe}>
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#000",
                paddingHorizontal: 24,
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 22,
                  fontWeight: "900",
                  textAlign: "center",
                }}
              >
                Preparing indoor navigation…
              </Text>

              <Text
                style={{
                  color: "#D1D5DB",
                  fontSize: 14,
                  marginTop: 10,
                  textAlign: "center",
                }}
              >
                Releasing scanner camera and loading indoor UI
              </Text>
            </View>
          </SafeAreaView>
        </View>
      );
    }

    return (
      <View style={s.cameraLayer}>
        {cameraEnabled && indoorCameraMounted ? (
          <CameraView
            ref={cameraRef}
            style={s.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={[s.camera, s.cameraPaused]}>
            <Text style={s.cameraPausedText}>
              {indoorCameraMounted ? "Camera paused" : "Preparing camera..."}
            </Text>
          </View>
        )}

        <View style={s.topGradient} />
        <View style={s.bottomGradient} />

        <SafeAreaView style={s.overlaySafe} pointerEvents="box-none">
          <View style={s.topHeader}>
            <Pressable style={s.backChip} onPress={() => navigation.goBack()}>
              <Text style={s.backChipText}>← Back</Text>
            </Pressable>

            <View style={s.destinationPill}>
              <Text style={s.destinationPillEyebrow}>INDOOR NAVIGATION</Text>
              <Text style={s.destinationPillTitle} numberOfLines={1}>
                {destinationTitle}
              </Text>
              <Text style={s.destinationPillSub} numberOfLines={1}>
                {destinationRoom?.room_name ||
                  "Open from a QR code or choose a room to start."}
              </Text>
            </View>

            <Pressable style={s.helpChip} onPress={openHelpModal}>
              <Text style={s.helpChipText}>Help</Text>
            </Pressable>
          </View>

          <View style={s.arrowCenterWrap}>
            <DirectionArrow
              direction={fallbackArrowDirection}
              arrived={arrived}
              heading={deviceHeading}
              targetBearing={targetBearing}
              mode={transportMode}
            />
          </View>


          {scanFlashVisible ? (
            <Animated.View
              style={[
                s.scanFeedback,
                {
                  opacity: scanBadgeAnim,
                  transform: [
                    {
                      translateY: scanBadgeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Text style={s.scanFeedbackTitle}>{visionSource === "vision" ? "📷 Location Recognized" : "✅ Location Updated"}</Text>
              <Text style={s.scanFeedbackText} numberOfLines={1}>
                {lastScannedText}
              </Text>
            </Animated.View>
          ) : null}

          <View style={s.middleInstructionWrap}>
            <Animated.View
              style={[
                s.nextStepCard,
                arrived && s.arrivalCard,
                {
                  opacity: nextStepFade,
                  transform: [
                    { scale: nextStepScale },
                    { scale: arrived ? arrivalPulse : 1 },
                  ],
                },
              ]}
            >
              <Text style={[s.nextStepEyebrow, arrived && s.arrivalEyebrow]}>
                {arrived ? "Arrived" : "Next Step"}
              </Text>

              <Text style={[s.nextStepTitle, arrived && s.arrivalTitle]}>
                {currentStep?.text ||
                  stageMessage ||
                  "No QR nearby? Tap User Help."}
              </Text>

              <View style={s.metaRow}>
                <View style={s.metaPill}>
                  <Text style={s.metaPillText}>{formattedDistance.feetText}</Text>
                </View>

                <View style={s.metaPill}>
                  <Text style={s.metaPillText}>{formattedDistance.metersText}</Text>
                </View>

                <View style={s.metaPill}>
                  <Text style={s.metaPillText}>
                    {currentWaypointObj?.floor ? `Floor ${currentWaypointObj.floor}` : "Floor ?"}
                  </Text>
                </View>
              </View>

              {stageMode === "indoor_find_anchor" && !currentStep?.text ? (
                <Text style={s.stageText}>
                  If there is no QR code nearby, tap Help and follow the recovery steps.
                </Text>
              ) : null}
            </Animated.View>
          </View>

          <View style={s.bottomPanel}>
            <View style={s.bottomPanelTopRow}>
              <View style={s.currentLocationPill}>
                <Text style={s.currentLocationEyebrow}>Current Location</Text>
                <Text style={s.currentLocationText} numberOfLines={1}>
                  {currentWaypointLabel || "Waiting for scan"}
                </Text>
                <Text style={s.currentLocationSub} numberOfLines={1}>
                  {currentBuildingId || (gpsBuildingGuess.building?.id ?? "building unknown")}
                </Text>
              </View>

              <Pressable
                style={s.bottomIconBtn}
                onPress={() => setCameraEnabled((value) => !value)}
              >
                <Text style={s.bottomIconBtnText}>
                  {cameraEnabled ? "Pause" : "Resume"}
                </Text>
              </Pressable>

              <Pressable
                style={s.bottomIconBtn}
                onPress={() =>
                  navigation.navigate("VisualLocateScreen", {
                    returnScreen: route.name || "NavigationPage",
                    destination,
                  })
                }
              >
                <Text style={s.bottomIconBtnText}>Locate</Text>
              </Pressable>
            </View>

            {/* ── Exit QR prompt (wrong building) ── */}
            {pendingTransitionType === "exit" ? (
              <View style={s.exitPromptRow}>
                <Pressable style={s.exitPromptBtn} onPress={openOutdoorScanner}>
                  <Text style={s.exitPromptBtnText}>
                    🚪  I exited the building — Scan exit QR to continue outside
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.bottomActionRow}>
                <Pressable style={s.secondaryBottomBtn} onPress={handleReset}>
                  <Text style={s.secondaryBottomBtnText}>Reset</Text>
                </Pressable>

                <Pressable
                  style={s.primaryBottomBtn}
                  onPress={() =>
                    navigation.navigate("VisualLocateScreen", {
                      returnScreen: route.name || "NavigationPage",
                      destination,
                    })
                  }
                >
                  <Text style={s.primaryBottomBtnText}>Locate Me Visually</Text>
                </Pressable>

                <Pressable style={s.secondaryBottomBtn} onPress={() => setDetailsVisible(true)}>
                  <Text style={s.secondaryBottomBtnText}>Details</Text>
                </Pressable>
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─── Permission gates ──────────────────────────────────────────────────────
  if (!permission) {
    return (
      <SafeAreaView style={s.permissionSafe}>
        <View style={s.permissionCenter}>
          <Text style={s.permissionTitle}>Loading camera permission.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.permissionSafe}>
        <View style={s.permissionCenter}>
          <Text style={s.permissionTitle}>Camera permission is required</Text>
          <Text style={s.permissionText}>
            The camera is needed for indoor navigation and QR scanning.
          </Text>

          <Pressable style={s.permissionBtn} onPress={requestPermission}>
            <Text style={s.permissionBtnText}>Allow Camera Access</Text>
          </Pressable>

          <Pressable style={s.permissionBackBtn} onPress={() => navigation.goBack()}>
            <Text style={s.permissionBackText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={s.screen}>
      {viewMode === VIEW_MODE.INDOOR ? renderIndoorView() : renderOutdoorView()}

      <Modal visible={helpVisible} animationType="slide" transparent>
        <View style={s.helpBackdrop}>
          <View style={s.helpSheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {renderHelpContent()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Outdoor QR scanner — used for both entrance (Case A) and exit (Case C) */}
      <Modal visible={outdoorScannerVisible} animationType="slide">
        <View style={s.scannerScreen}>
          <SafeAreaView style={s.scannerSafe} edges={["top"]}>
            <View style={s.scannerHeader}>
              <Pressable
                style={s.scannerCloseBtn}
                onPress={() => setOutdoorScannerVisible(false)}
              >
                <Text style={s.scannerCloseText}>Close</Text>
              </Pressable>

              <Text style={s.scannerTitle}>
                {pendingTransitionType === "entrance"
                  ? "Scan Entrance QR"
                  : pendingTransitionType === "exit"
                  ? "Scan Exit QR"
                  : "Scan Entrance QR"}
              </Text>

              <View style={{ width: 56 }} />
            </View>

            <Text style={s.scannerSubtitle}>
              {pendingTransitionType === "entrance"
                ? "Scan the QR code at the building entrance to switch into indoor navigation."
                : pendingTransitionType === "exit"
                ? "Scan the QR code at the exit to continue to outdoor routing toward your destination."
                : "Scan a building entrance or indoor QR code to switch into indoor navigation."}
            </Text>

            <View style={s.scannerCameraWrap}>
              <CameraView
                style={s.scannerCamera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={handleOutdoorQrScan}
              />
            </View>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal visible={detailsVisible} animationType="slide" transparent>
        <View style={s.detailsBackdrop}>
          <View style={s.detailsSheet}>
            <View style={s.detailsHeader}>
              <Text style={s.detailsTitle}>Navigation Details</Text>
              <Pressable onPress={() => setDetailsVisible(false)}>
                <Text style={s.detailsClose}>Close</Text>
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.detailSection}>
                <SectionTitle icon="📋" text="Step List" />
                <View style={s.stepListWrap}>
                  {steps.length === 0 ? (
                    <View style={s.detailInfoCard}>
                      <Text style={s.detailBody}>
                        No steps yet. Follow the current navigation state.
                      </Text>
                    </View>
                  ) : (
                    steps.map((step, index) => {
                      const isActive = index === activeStepIndex;

                      return (
                        <View key={step.id || `${step.waypointId}_${index}`} style={s.stepRow}>
                          <View style={[s.stepDot, isActive && s.stepDotActive]}>
                            <Text style={s.stepDotText}>
                              {arrived && isActive ? "✓" : getStepIcon(step.text)}
                            </Text>
                          </View>

                          <View
                            style={[
                              s.stepContent,
                              isActive && s.stepContentActive,
                              arrived && isActive && s.stepContentArrived,
                            ]}
                          >
                            {isActive ? (
                              <Text
                                style={[
                                  s.stepCurrentBadge,
                                  arrived && s.stepCurrentBadgeArrived,
                                ]}
                              >
                                {arrived ? "Arrived" : "Current Step"}
                              </Text>
                            ) : null}

                            <Text
                              style={[
                                s.stepText,
                                isActive && s.stepTextActive,
                                arrived && isActive && s.stepTextArrived,
                              ]}
                            >
                              {step.text}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>

              {orsSteps.length > 0 ? (
                <View style={s.detailSection}>
                  <SectionTitle icon="🗺" text="Outdoor Route Steps" />
                  <View style={s.detailInfoCard}>
                    {orsSteps.map((step, index) => (
                      <Text key={index} style={[s.detailBody, index > 0 && { marginTop: 6 }]}>
                        {index + 1}. {step.instruction}
                      </Text>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={s.detailSection}>
                <SectionTitle icon="🔎" text="Last QR Scan" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {lastScannedText || "Nothing scanned yet."}
                  </Text>
                  {visionSource ? (
                    <Text style={[s.detailBody, { marginTop: 4 }]}>
                      Source: {visionSource === "vision" ? "Visual recognition" : "QR code"}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="📍" text="Next Waypoint" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {nextWaypoint?.label || "No next waypoint yet."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="📏" text="Route Distance" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {orsMeters !== null
                      ? `${orsMeters.toFixed(0)} m (ORS walking route)`
                      : Number.isFinite(routeDistance)
                      ? `${routeDistance.toFixed(1)} m`
                      : "No route distance yet."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🧠" text="Vision Status" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {visionSource === "vision"
                      ? "Last location update came from visual locate."
                      : visionSource === "qr"
                      ? "Last location update came from QR."
                      : "Use Locate Me Visually for a separate camera-based check."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🧭" text="Compass Heading" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>{`${Math.round(deviceHeading)}°`}</Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="📍" text="GPS Status" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {gpsLoading
                      ? "Loading GPS..."
                      : gpsPermissionGranted
                      ? userGps
                        ? `Lat: ${userGps.latitude.toFixed(6)}, Lng: ${userGps.longitude.toFixed(6)}`
                        : "Waiting for GPS coordinates..."
                      : "GPS permission not granted."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🏢" text="Building Guess" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {gpsBuildingGuess.building
                      ? `${gpsBuildingGuess.building.name} (${gpsBuildingGuess.confidence})`
                      : "No building guess yet."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🧩" text="View Mode" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>{viewMode}</Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🧠" text="Stage Mode" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>{stageMode || "idle"}</Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🚦" text="Transition State" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {pendingTransitionType === "entrance"
                      ? "At destination entrance — awaiting QR scan"
                      : pendingTransitionType === "exit"
                      ? "At wrong building exit — awaiting QR scan"
                      : "None"}
                  </Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {renderDebugPanel()}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },

  cameraLayer: { flex: 1, backgroundColor: "#000" },
  camera: { ...StyleSheet.absoluteFillObject },
  cameraPaused: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111827",
  },
  cameraPausedText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },

  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 130,
    backgroundColor: PSU.overlayDarkStrong,
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    backgroundColor: PSU.overlayDarkStrong,
  },
  overlaySafe: { flex: 1 },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 2,
    marginTop: -25,
  },
  backChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  backChipText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  destinationPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  destinationPillEyebrow: {
    color: "#E7EEFB",
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },
  destinationPillTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  destinationPillSub: { color: "#E7EEFB", fontSize: 12, marginTop: 2 },
  helpChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  helpChipText: { color: "#fff", fontWeight: "900" },

  arrowCenterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 310,
    alignItems: "center",
    justifyContent: "center",
  },

  visionLoadingBadge: {
    position: "absolute",
    top: 102,
    right: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: PSU.scanBadgeBorder,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  visionLoadingText: { color: PSU.muted, fontSize: 11, fontWeight: "700" },

  scanFeedback: {
    position: "absolute",
    alignSelf: "center",
    top: 110,
    backgroundColor: PSU.scanBadgeBg,
    borderColor: PSU.scanBadgeBorder,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    minWidth: 220,
    maxWidth: "88%",
  },
  scanFeedbackTitle: {
    color: PSU.blue,
    fontSize: 13,
    fontWeight: "900",
    marginBottom: 2,
  },
  scanFeedbackText: {
    color: PSU.text,
    fontSize: 13,
    fontWeight: "700",
  },

  middleInstructionWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 160,
  },
  nextStepCard: {
    backgroundColor: PSU.nextBg,
    borderColor: PSU.nextBorder,
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
  },
  arrivalCard: {
    backgroundColor: PSU.arrivalBg,
    borderColor: PSU.arrivalBorder,
  },
  nextStepEyebrow: {
    color: PSU.blue2,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  arrivalEyebrow: { color: PSU.green },
  nextStepTitle: {
    color: PSU.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  arrivalTitle: { color: PSU.green },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  metaPill: {
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    color: PSU.text,
    fontSize: 12,
    fontWeight: "800",
  },
  stageText: {
    color: PSU.muted,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },

  bottomPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  bottomPanelTopRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 10,
    marginBottom: 10,
  },
  currentLocationPill: {
    flex: 1,
    backgroundColor: PSU.cardBg,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: PSU.border,
    minHeight: 88,
  },
  currentLocationEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },
  currentLocationText: {
    color: PSU.text,
    fontSize: 15,
    fontWeight: "900",
  },
  currentLocationSub: {
    color: PSU.muted,
    fontSize: 12,
    marginTop: 2,
  },
  bottomIconBtn: {
    backgroundColor: PSU.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 14,
    minWidth: 92,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomIconBtnText: {
    color: PSU.text,
    fontWeight: "800",
    fontSize: 13,
  },
  bottomActionRow: { flexDirection: "row", gap: 10 },
  secondaryBottomBtn: {
    flex: 1,
    backgroundColor: PSU.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBottomBtnText: { color: PSU.text, fontWeight: "900" },
  primaryBottomBtn: {
    flex: 1.4,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBottomBtnText: { color: PSU.white, fontWeight: "900" },

  // ── Exit prompt (wrong building, near exit) ────────────────────────────────
  exitPromptRow: { marginTop: 0 },
  exitPromptBtn: {
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  exitPromptBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 14,
    textAlign: "center",
  },

  outdoorScroll: {
    flex: 1,
  },
  outdoorScrollContent: {
    flexGrow: 1,
  },
  outdoorSafe: {
    flex: 1,
    backgroundColor: PSU.light,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  outdoorHeader: {
    paddingTop: 6,
    marginBottom: 12,
  },
  outdoorBackBtn: {
    alignSelf: "flex-start",
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  outdoorBackText: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 14,
  },
  outdoorHeaderCard: {
    backgroundColor: PSU.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 16,
  },
  outdoorEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  outdoorTitle: {
    color: PSU.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 6,
  },
  outdoorSub: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 20,
  },

  // ── Map ────────────────────────────────────────────────────────────────────
  mapCard: {
    backgroundColor: PSU.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: PSU.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  mapView: {
    height: 260,
    borderRadius: 20,
  },
  mapPlaceholder: {
    height: 260,
    backgroundColor: PSU.mapBg,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: {
    color: PSU.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  mapLoadingOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: PSU.border,
  },
  mapLoadingText: {
    color: PSU.text,
    fontSize: 12,
    fontWeight: "700",
  },
  mapInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
  },
  mapInfoPill: {
    backgroundColor: PSU.light,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapInfoPillText: {
    color: PSU.text,
    fontSize: 12,
    fontWeight: "800",
  },

  // ── Outdoor bottom card ────────────────────────────────────────────────────
  outdoorBottomCard: {
    backgroundColor: PSU.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 16,
  },
  outdoorBottomTitle: {
    color: PSU.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
    marginBottom: 8,
  },
  outdoorBottomText: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  orsErrorText: {
    color: PSU.errorText,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  orsStepsList: {
    marginBottom: 14,
    gap: 4,
  },
  orsStepText: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  orsStepsMore: {
    color: PSU.muted,
    fontSize: 13,
  },
  outdoorBottomButtons: {
    flexDirection: "row",
    gap: 10,
  },
  outdoorSecondaryBtn: {
    flex: 1,
    backgroundColor: PSU.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorSecondaryBtnText: {
    color: PSU.text,
    fontWeight: "900",
  },
  outdoorScanBtn: {
    flex: 1.1,
    backgroundColor: PSU.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.blue2,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorScanBtnText: {
    color: PSU.blue2,
    fontWeight: "900",
  },
  outdoorPrimaryBtn: {
    flex: 1.2,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorPrimaryBtnText: {
    color: PSU.white,
    fontWeight: "900",
  },

  // ── Transition card (entrance reached) ────────────────────────────────────
  transitionCard: {
    borderColor: PSU.helpBlueBorder,
    backgroundColor: PSU.helpBlue,
  },
  transitionCardEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  transitionCardTitle: {
    color: PSU.blue,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6,
    lineHeight: 24,
  },
  transitionCardSub: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  transitionScanBtn: {
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    marginBottom: 10,
  },
  transitionScanBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 15,
    textAlign: "center",
  },
  transitionSecondaryBtn: {
    backgroundColor: PSU.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingVertical: 12,
    alignItems: "center",
  },
  transitionSecondaryBtnText: {
    color: PSU.text,
    fontWeight: "800",
  },

  // ── Permission screens ─────────────────────────────────────────────────────
  permissionSafe: { flex: 1, backgroundColor: PSU.light },
  permissionCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: PSU.text,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },
  permissionText: {
    color: PSU.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 18,
  },
  permissionBtn: {
    backgroundColor: PSU.blue,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minWidth: 220,
    alignItems: "center",
    marginBottom: 10,
  },
  permissionBtnText: { color: PSU.white, fontWeight: "900" },
  permissionBackBtn: {
    backgroundColor: PSU.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minWidth: 220,
    alignItems: "center",
  },
  permissionBackText: { color: PSU.text, fontWeight: "800" },

  // ── Help modal ─────────────────────────────────────────────────────────────
  helpBackdrop: {
    flex: 1,
    backgroundColor: PSU.modalBackdrop,
    justifyContent: "flex-end",
  },
  helpSheet: {
    backgroundColor: PSU.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: "88%",
  },
  helpTitle: {
    color: PSU.text,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  helpSubtitle: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  helpInfoCard: {
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
  },
  helpInfoTitle: {
    color: PSU.text,
    fontWeight: "900",
    marginBottom: 4,
  },
  helpInfoBody: {
    color: PSU.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitleText: { color: PSU.text, fontSize: 17, fontWeight: "900" },

  buildingList: {
    gap: 10,
    marginBottom: 8,
  },
  buildingCard: {
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 18,
    padding: 14,
  },
  buildingCardSelected: {
    backgroundColor: PSU.helpBlue,
    borderColor: PSU.helpBlueBorder,
  },
  buildingCardTitle: {
    color: PSU.text,
    fontWeight: "900",
    marginBottom: 2,
  },
  buildingCardTitleSelected: {
    color: PSU.blue,
  },
  buildingCardSub: {
    color: PSU.muted,
    fontSize: 12,
  },

  helpInput: {
    backgroundColor: PSU.helpFieldBg,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: PSU.text,
    fontSize: 16,
    fontWeight: "700",
  },

  errorCard: {
    backgroundColor: PSU.errorBg,
    borderWidth: 1,
    borderColor: PSU.errorBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  errorText: {
    color: PSU.errorText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  helpBottomRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  helpSecondaryBtn: {
    flex: 1,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  helpSecondaryBtnText: { color: PSU.text, fontWeight: "800" },
  helpPrimaryBtn: {
    flex: 1.4,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  helpPrimaryBtnText: { color: PSU.white, fontWeight: "900" },

  // ── Outdoor QR scanner modal ───────────────────────────────────────────────
  scannerScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerSafe: {
    flex: 1,
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  scannerCloseBtn: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scannerCloseText: {
    color: "#fff",
    fontWeight: "900",
  },
  scannerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  scannerSubtitle: {
    color: "#E7EEFB",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  scannerCameraWrap: {
    flex: 1,
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  scannerCamera: {
    flex: 1,
  },

  // ── Details modal ──────────────────────────────────────────────────────────
  detailsBackdrop: {
    flex: 1,
    backgroundColor: PSU.modalBackdrop,
    justifyContent: "flex-end",
  },
  detailsSheet: {
    backgroundColor: PSU.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 26,
    maxHeight: "90%",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailsTitle: { color: PSU.text, fontSize: 24, fontWeight: "900" },
  detailsClose: { color: PSU.blue, fontWeight: "900" },
  detailSection: { marginTop: 14 },
  detailInfoCard: {
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    padding: 14,
  },
  detailBody: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 20,
  },
  stepListWrap: { gap: 10 },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: PSU.helpBlue,
    borderColor: PSU.helpBlueBorder,
  },
  stepDotText: { fontSize: 16 },
  stepContent: {
    flex: 1,
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    padding: 12,
  },
  stepContentActive: {
    backgroundColor: "#F8FBFF",
    borderColor: PSU.helpBlueBorder,
  },
  stepContentArrived: {
    backgroundColor: PSU.arrivalBg,
    borderColor: PSU.arrivalBorder,
  },
  stepCurrentBadge: {
    alignSelf: "flex-start",
    backgroundColor: PSU.blue,
    color: PSU.white,
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
    overflow: "hidden",
  },
  stepCurrentBadgeArrived: {
    backgroundColor: PSU.green,
  },
  stepText: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 20,
  },
  stepTextActive: { fontWeight: "800" },
  stepTextArrived: { color: PSU.green },

  debugPanel: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
  },
  debugCard: {
    maxHeight: 180,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(11,18,32,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  debugHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  debugTitle: {
    color: PSU.white,
    fontSize: 13,
    fontWeight: "900",
  },
  debugHideText: {
    color: "#B9D2FF",
    fontSize: 12,
    fontWeight: "800",
  },
  debugSummary: {
    color: "#D8E5FF",
    fontSize: 11,
    marginBottom: 8,
  },
  debugLogScroll: {
    maxHeight: 120,
  },
  debugLogLine: {
    color: "#F5F7FA",
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 4,
  },
});
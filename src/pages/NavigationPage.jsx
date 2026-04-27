import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
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
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Pedometer } from "expo-sensors";
import MapView, { Polyline } from "react-native-maps";

import { loadAccessibilityMode } from "../utils/preferencesStorage";
import DirectionArrow from "../components/DirectionArrow";
import {
  initializeImageModel,
  loadReferenceImageDatabase,
  identifyLocationFromFrame,
} from "../utils/imageRecognition";
import campusData from "../data/campusData.json";
import { findRoom } from "../utils/findRoom";
import {
  findWaypointByQrData,
  getWaypointById,
  getBuildingEntrances,
} from "../utils/qrWaypointLookup";
import { buildStageNavigation, findNearestExitRoute } from "../utils/pathfinding";
import { calculateBearingDegrees } from "../utils/location";
import {
  advanceRouteIfNeeded,
  getNextWaypointId,
  advanceRouteIfNeededIndoor,
} from "../utils/routeSteps";
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

const ENTRANCE_REACHED_THRESHOLD_METERS = 20;
const INDOOR_STEP_PIXELS = 18;
const INDOOR_HEADING_OFFSET_DEGREES = 0;

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
  const m = Number(meters);

  if (!Number.isFinite(m)) {
    return { metersText: "-- m", feetText: "-- ft" };
  }

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

function withTimeout(promise, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Route request timed out"));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export default function NavigationPage({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { destination } = route.params || {};
  const destinationRoom = destination?.room || null;
  const destinationBuilding = destination?.building || null;

  const routeAccessibilityMode = route.params?.accessibilityMode;
  const routeEmergencyMode = route.params?.emergencyMode;
  const emergencyMode = routeEmergencyMode === true && !destinationRoom;

  const [savedAccessibilityMode, setSavedAccessibilityMode] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSavedPreferences() {
      const savedAccessibility = await loadAccessibilityMode();

      if (mounted) {
        setSavedAccessibilityMode(savedAccessibility);
        setPreferencesReady(true);
      }
    }

    loadSavedPreferences();

    return () => {
      mounted = false;
    };
  }, []);

  const accessibilityMode =
  typeof routeAccessibilityMode === "boolean"
    ? routeAccessibilityMode
    : savedAccessibilityMode;

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

  const [batterySaverMode, setBatterySaverMode] = useState(false);
  const [outdoorScannerVisible, setOutdoorScannerVisible] = useState(false);
  const [forceIndoorAfterScan, setForceIndoorAfterScan] = useState(false);

  const [visionReady, setVisionReady] = useState(false);
  const [visionSource, setVisionSource] = useState(null); // "qr" | "vision" | null
  const [visualLocateActive, setVisualLocateActive] = useState(false);

  const [currentIndoorPosition, setCurrentIndoorPosition] = useState(null);
  const [previousIndoorDistance, setPreviousIndoorDistance] = useState(null);

  const [pedometerAvailable, setPedometerAvailable] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [lastStepAnchorCount, setLastStepAnchorCount] = useState(0);

  const [orsCoords, setOrsCoords] = useState([]);
  const [orsSteps, setOrsSteps] = useState([]);
  const [orsMeters, setOrsMeters] = useState(null);
  const [orsLoading, setOrsLoading] = useState(false);
  const [orsError, setOrsError] = useState(null);

  const [pendingTransitionType, setPendingTransitionType] = useState(null);

  const cameraRef = useRef(null);
  const visionBusyRef = useRef(false);
  const lastOrsGpsRef = useRef(null);
  const lastOrsFetchKeyRef = useRef(null);
  const mapRef = useRef(null);
  const didAutoFitRouteRef = useRef(false);

  const nextStepFade = useRef(new Animated.Value(1)).current;
  const nextStepScale = useRef(new Animated.Value(1)).current;
  const arrivalPulse = useRef(new Animated.Value(1)).current;
  const scanBadgeAnim = useRef(new Animated.Value(0)).current;
  const scanCooldownRef = useRef(false);

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
    if (targetBearing !== null) return "straight";
    return getArrowDirectionFromText(currentStep?.text || stageMessage || "");
  }, [targetBearing, currentStep, stageMessage]);

  const targetBearing = useMemo(() => {
    if (viewMode === VIEW_MODE.INDOOR) {
      if (
        !currentIndoorPosition ||
        !nextWaypoint ||
        nextWaypoint.x == null ||
        nextWaypoint.y == null
      ) {
        return null;
      }
  
      const dx = Number(nextWaypoint.x) - Number(currentIndoorPosition.x);
      const dy = Number(nextWaypoint.y) - Number(currentIndoorPosition.y);
  
      let indoorBearing = Math.atan2(dx, -dy) * (180 / Math.PI);
      indoorBearing = (indoorBearing + 360) % 360;
  
      return indoorBearing;
    }
  
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
  }, [viewMode, currentIndoorPosition, userGps, nextWaypoint]);

  const formattedDistance = useMemo(() => {
    if (orsMeters !== null && viewMode === VIEW_MODE.OUTDOOR) {
      return formatDistance(orsMeters);
    }
    return formatDistance(routeDistance);
  }, [routeDistance, orsMeters, viewMode]);

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

  const destinationEntranceWaypoints = useMemo(() => {
    const buildingId = destinationBuilding?.id || destinationRoom?.building || "";
    if (!buildingId) return [];
    return getBuildingEntrances(buildingId);
  }, [destinationBuilding, destinationRoom]);

  const currentBuildingEntranceWaypoints = useMemo(() => {
    if (!currentBuildingId) return [];
    return getBuildingEntrances(currentBuildingId);
  }, [currentBuildingId]);

  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR) return;
    if (!userGps) return;
    if (!currentBuildingId) return;
    if (!destinationBuilding && !destinationRoom) return;

    const destinationBuildingId =
      destinationBuilding?.id || destinationRoom?.building || "";

    if (
      !destinationBuildingId ||
      normalize(currentBuildingId) === normalize(destinationBuildingId)
    ) {
      if (pendingTransitionType === "exit") {
        setPendingTransitionType(null);
      }
      return;
    }

    const nearExit = currentBuildingEntranceWaypoints.some((wp) => {
      if (wp.latitude == null || wp.longitude == null) return false;

      return (
        haversineMeters(
          Number(userGps.latitude),
          Number(userGps.longitude),
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
    pendingTransitionType,
  ]);
  
  const selectedDestinationEntrance = useMemo(() => {
    const entrancesWithGps = destinationEntranceWaypoints.filter((wp) => {
      return wp.latitude != null && wp.longitude != null;
    });
  
    if (entrancesWithGps.length === 0) {
      return null;
    }
  
    // If accessibility is on, prefer entrances marked accessible.
    // If none are marked accessible, fall back to all entrances so routing still works.
    const accessibleEntrances = entrancesWithGps.filter(
      (wp) => wp.accessible === true
    );
  
    const usableEntrances =
      accessibilityMode && accessibleEntrances.length > 0
        ? accessibleEntrances
        : entrancesWithGps;
  
    // If GPS is not ready yet, just use the first usable entrance.
    if (!userGps) {
      return usableEntrances[0];
    }
  
    let nearest = null;
    let nearestDist = Infinity;
  
    for (const wp of usableEntrances) {
      const d = haversineMeters(
        Number(userGps.latitude),
        Number(userGps.longitude),
        Number(wp.latitude),
        Number(wp.longitude)
      );
  
      if (d < nearestDist) {
        nearestDist = d;
        nearest = wp;
      }
    }
  
    return nearest;
  }, [userGps, destinationEntranceWaypoints, accessibilityMode]);
  
  const orsDestinationGps = useMemo(() => {
    if (selectedDestinationEntrance) {
      return {
        latitude: Number(selectedDestinationEntrance.latitude),
        longitude: Number(selectedDestinationEntrance.longitude),
      };
    }
  
    // Fallback only if no entrance data exists.
    if (outdoorTargetBuilding?.latitude && outdoorTargetBuilding?.longitude) {
      return {
        latitude: Number(outdoorTargetBuilding.latitude),
        longitude: Number(outdoorTargetBuilding.longitude),
      };
    }
  
    return null;
  }, [selectedDestinationEntrance, outdoorTargetBuilding]);
  
  useEffect(() => {
    if (viewMode !== VIEW_MODE.OUTDOOR) {
      setOrsLoading(false);
      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      lastOrsFetchKeyRef.current = null;
      return;
    }

    if (!userGps || !orsDestinationGps) {
      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      setOrsLoading(false);
      lastOrsGpsRef.current = null;
      lastOrsFetchKeyRef.current = null;
      return;
    }

    const fetchKey = [
      userGps.latitude?.toFixed?.(5) ?? userGps.latitude,
      userGps.longitude?.toFixed?.(5) ?? userGps.longitude,
      orsDestinationGps.latitude?.toFixed?.(5) ?? orsDestinationGps.latitude,
      orsDestinationGps.longitude?.toFixed?.(5) ?? orsDestinationGps.longitude,
      stageMode || "",
      pendingTransitionType || "",
    ].join("|");

    if (lastOrsFetchKeyRef.current === fetchKey) {
      return;
    }

    lastOrsGpsRef.current = userGps;

    let cancelled = false;

    async function loadOutdoorRoute() {
      try {
        setOrsLoading(true);
        setOrsError(null);

        const route = await withTimeout(
          fetchOrsRoute(
            {
              latitude: Number(userGps.latitude),
              longitude: Number(userGps.longitude),
            },
            {
              latitude: Number(orsDestinationGps.latitude),
              longitude: Number(orsDestinationGps.longitude),
            }
          ),
          8000
        );

        if (cancelled) return;

        const coordinates = Array.isArray(route?.coordinates)
          ? route.coordinates
              .map((point) => {
                if (
                  point &&
                  typeof point === "object" &&
                  point.latitude != null &&
                  point.longitude != null
                ) {
                  return {
                    latitude: Number(point.latitude),
                    longitude: Number(point.longitude),
                  };
                }

                if (Array.isArray(point) && point.length >= 2) {
                  return {
                    latitude: Number(point[1]),
                    longitude: Number(point[0]),
                  };
                }

                return null;
              })
              .filter(Boolean)
          : [];

        const steps = Array.isArray(route?.steps) ? route.steps : [];
        const distance =
          typeof route?.totalMeters === "number" && route.totalMeters > 0
            ? route.totalMeters
            : typeof route?.distance === "number" && route.distance > 0
            ? route.distance
            : typeof route?.meters === "number" && route.meters > 0
            ? route.meters
            : coordinates.length > 1
            ? coordinates.reduce((sum, point, index) => {
                if (index === 0) return 0;
                const prev = coordinates[index - 1];
                return (
                  sum +
                  haversineMeters(
                    prev.latitude,
                    prev.longitude,
                    point.latitude,
                    point.longitude
                  )
                );
              }, 0)
            : null;

        setOrsCoords(coordinates);
        setOrsSteps(steps);
        setOrsMeters(distance);
        setOrsError(null);
        lastOrsFetchKeyRef.current = fetchKey;

        if (
          pendingTransitionType !== "entrance" &&
          destinationEntranceWaypoints.length > 0 &&
          userGps
        ) {
          let nearestEntranceDistance = Infinity;

          for (const wp of destinationEntranceWaypoints) {
            if (wp.latitude == null || wp.longitude == null) continue;

            const d = haversineMeters(
              Number(userGps.latitude),
              Number(userGps.longitude),
              Number(wp.latitude),
              Number(wp.longitude)
            );

            if (d < nearestEntranceDistance) {
              nearestEntranceDistance = d;
            }
          }

          if (
            Number.isFinite(nearestEntranceDistance) &&
            nearestEntranceDistance <= ENTRANCE_REACHED_THRESHOLD_METERS
          ) {
            setPendingTransitionType("entrance");
          } else if (pendingTransitionType === "entrance") {
            setPendingTransitionType(null);
          }
        }
      } catch (error) {
        if (cancelled) return;
        setOrsCoords([]);
        setOrsSteps([]);
        setOrsMeters(null);
        lastOrsFetchKeyRef.current = null;
        setOrsError(
          error?.message === "Route request timed out"
            ? "Outdoor route request timed out."
            : "Failed to load outdoor route."
        );
      } finally {
        if (!cancelled) {
          setOrsLoading(false);
        }
      }
    }

    loadOutdoorRoute();

    return () => {
      cancelled = true;
    };
  }, [
    viewMode,
    userGps,
    orsDestinationGps,
    stageMode,
    pendingTransitionType,
    destinationEntranceWaypoints,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!Array.isArray(orsCoords) || orsCoords.length < 2) return;
    if (didAutoFitRouteRef.current) return;

    mapRef.current.fitToCoordinates(orsCoords, {
      edgePadding: {
        top: 80,
        right: 40,
        bottom: 80,
        left: 40,
      },
      animated: true,
    });

    didAutoFitRouteRef.current = true;
  }, [orsCoords]);

  useEffect(() => {
    let cancelled = false;

    async function setupVision() {
      try {
        await initializeImageModel();
        await loadReferenceImageDatabase();
        if (!cancelled) setVisionReady(true);
      } catch (error) {
        console.log("Vision setup failed:", error);
      }
    }

    setupVision();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      viewMode !== VIEW_MODE.INDOOR ||
      !visionReady ||
      !cameraEnabled ||
      !visualLocateActive
    ) {
      return;
    }

    let cancelled = false;

    async function runLoop() {
      while (!cancelled) {
        await new Promise((resolve) =>
          setTimeout(resolve, batterySaverMode ? 7000 : 3000)
        );
        if (cancelled) break;
        if (visionBusyRef.current || !cameraRef.current) continue;

        visionBusyRef.current = true;
        try {
          const photo = await cameraRef.current.takePictureAsync({
            quality: 0.15,
            base64: false,
            skipProcessing: true,
          });

          if (cancelled || !photo?.uri) continue;

          const result = await identifyLocationFromFrame(photo.uri);
          const waypointId = result?.location?.waypoint_id;
          if (!waypointId) continue;

          const matchedWaypoint = (campusData.waypoints || []).find(
            (waypoint) => waypoint.id === waypointId
          );

          if (matchedWaypoint) {
            if (!visualLocateActive) continue;
            applyScannedWaypoint(matchedWaypoint, "vision");
          }
        } catch (error) {
          if (!cancelled) console.log("Vision scan failed:", error);
        } finally {
          visionBusyRef.current = false;
        }
      }
    }

    runLoop();

    return () => {
      cancelled = true;
    };
  }, [viewMode, visionReady, cameraEnabled, visualLocateActive, batterySaverMode]);

  useEffect(() => {
    let mounted = true;
    let subscription = null;

    async function setupPedometer() {
      try {
        const available = await Pedometer.isAvailableAsync();
        if (!mounted) return;

        setPedometerAvailable(Boolean(available));
        if (!available) return;

        subscription = Pedometer.watchStepCount((result) => {
          if (!mounted) return;
          setStepCount(result?.steps ?? 0);
        });
      } catch (error) {
        console.log("Pedometer setup failed:", error);
      }
    }

    setupPedometer();

    return () => {
      mounted = false;
      if (subscription?.remove) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!linkedStartWaypoint) return;

    setCurrentWaypointLabel(linkedStartWaypoint.label || linkedStartWaypoint.id);
    setCurrentBuildingId(linkedStartWaypoint.building || "");
    setCurrentWaypointId(linkedStartWaypoint.id || "");
    setLastScannedText(linkedStartWaypoint.qr_code || linkedStartWaypoint.id);
    setVisionSource("qr");
    setVisualLocateActive(false);

    setCurrentIndoorPosition({
      building: linkedStartWaypoint.building || "",
      floor: linkedStartWaypoint.floor || "",
      x: linkedStartWaypoint.x,
      y: linkedStartWaypoint.y,
    });

    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);
  }, [linkedStartWaypoint, stepCount]);

  useEffect(() => {
    const result = route.params?.visualLocateResult;
    if (!result?.waypointId) return;

    const matchedWaypoint = (campusData.waypoints || []).find(
      (waypoint) => waypoint.id === result.waypointId
    );

    if (!matchedWaypoint) return;

    setCurrentWaypointLabel(matchedWaypoint.label || matchedWaypoint.id);
    setCurrentBuildingId(matchedWaypoint.building || "");
    setCurrentWaypointId(matchedWaypoint.id || "");
    setForceIndoorAfterScan(true);
    setVisionSource("vision");
    setVisualLocateActive(false);

    setCurrentIndoorPosition({
      building: matchedWaypoint.building || "",
      floor: matchedWaypoint.floor || "",
      x: matchedWaypoint.x,
      y: matchedWaypoint.y,
    });

    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);
    showScanBadge(matchedWaypoint.label || matchedWaypoint.id);

    if (navigation?.setParams) {
      navigation.setParams({ visualLocateResult: undefined });
    }
  }, [route.params?.visualLocateResult, navigation, stepCount]);

  useEffect(() => {
    if (currentBuildingId) return;
    if (gpsBuildingGuess.building && gpsBuildingGuess.confidence === "high") {
      setCurrentBuildingId(gpsBuildingGuess.building.id);
    }
  }, [gpsBuildingGuess, currentBuildingId]);

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

  useEffect(() => {
    if (!arrived || batterySaverMode) {
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
  }, [arrived, arrivalPulse, batterySaverMode]);

  useEffect(() => {
    let locationSubscription = null;
    let headingSubscription = null;

    async function setupLocation() {
      try {
        setGpsLoading(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
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

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (loc) => {
            setUserGps({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
          }
        );

        headingSubscription = await Location.watchHeadingAsync((heading) => {
          if (typeof heading?.trueHeading === "number" && heading.trueHeading >= 0) {
            setDeviceHeading(heading.trueHeading);
          } else if (typeof heading?.magHeading === "number") {
            setDeviceHeading(heading.magHeading);
          }
        });
      } catch (error) {
        console.log("Location setup failed:", error);
      } finally {
        setGpsLoading(false);
      }
    }

    setupLocation();

    return () => {
      if (locationSubscription?.remove) locationSubscription.remove();
      if (headingSubscription?.remove) headingSubscription.remove();
    };
  }, [batterySaverMode]);

  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR) return;
    if (!currentIndoorPosition) return;
    if (!pedometerAvailable) return;
    if (!Number.isFinite(stepCount) || !Number.isFinite(lastStepAnchorCount)) return;

    const deltaSteps = stepCount - lastStepAnchorCount;
    if (deltaSteps <= 0) return;

    const heading = Number(deviceHeading ?? 0) + INDOOR_HEADING_OFFSET_DEGREES;
    const headingRad = (heading * Math.PI) / 180;

    const dx = Math.cos(headingRad) * deltaSteps * INDOOR_STEP_PIXELS;
    const dy = Math.sin(headingRad) * deltaSteps * INDOOR_STEP_PIXELS;

    setCurrentIndoorPosition((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        x: Number(prev.x || 0) + dx,
        y: Number(prev.y || 0) + dy,
      };
    });

    setLastStepAnchorCount(stepCount);
  }, [
    viewMode,
    currentIndoorPosition,
    stepCount,
    lastStepAnchorCount,
    deviceHeading,
    pedometerAvailable,
  ]);

  useEffect(() => {
    if (!preferencesReady) return;

    let nav;

    if (emergencyMode) {
      
      const CAMPUS_THRESHOLD = 180;
      const outsideCampus =
        !gpsBuildingGuess.building ||
        gpsBuildingGuess.distance > CAMPUS_THRESHOLD;

      if (outsideCampus) {
        nav = {
          mode: "emergency_outside",
          path: [],
          steps: [
            {
              id: "step-0",
              text: "You are already outside.",
            },
            {
              id: "step-1",
              text: "Emergency Mode is only for getting out of a building. No exit route is needed.",
            },
          ],
          nextWaypoint: null,
          distance: 0,
          arrived: true,
          transportMode: "arrow",
          message: "You are already outside. Emergency exit routing is not needed.",
        };
      } else if (!currentWaypointId || !currentBuildingId) {
        nav = {
          mode: "emergency_wait_for_scan",
          path: [],
          steps: [
            {
              id: "step-0",
              text: "Emergency Mode is active.",
            },
            {
              id: "step-1",
              text: "Scan the nearest QR code so the app can route you to the closest exit.",
            },
          ],
          nextWaypoint: null,
          distance: Infinity,
          arrived: false,
          transportMode: "arrow",
          message:
            "Emergency Mode is active. Scan the nearest QR code to begin exit routing.",
        };
      } else {
        const exitRoute = findNearestExitRoute(currentWaypointId, currentBuildingId, {
          accessibleOnly: false,
          stairsOnly: true,
        });

        const path = Array.isArray(exitRoute.path) ? exitRoute.path : [];
        const nextWaypointId = getNextWaypointId(path, currentWaypointId);

        if (!path.length) {
          nav = {
            mode: "emergency_stairs_required",
            path: [],
            steps: [
              {
                id: "step-0",
                text: "Emergency Mode uses stairs only.",
              },
              {
                id: "step-1",
                text: "Scan the nearest stairs QR code to begin the fastest exit route.",
              },
            ],
            nextWaypoint: null,
            distance: Infinity,
            arrived: false,
            transportMode: "arrow",
            message: "Emergency Mode uses stairs only. Scan the nearest stairs QR code.",
          };
        } else {
          nav = {
            mode: "emergency_exit",
            path,
            steps: Array.isArray(exitRoute.steps) ? exitRoute.steps : [],
            nextWaypoint: nextWaypointId ? getWaypointById(nextWaypointId) : null,
            distance: exitRoute.distance ?? Infinity,
            arrived: path.length > 0 && path[path.length - 1] === currentWaypointId,
            transportMode: "arrow",
            message: "Fastest stairs-only route to the nearest exit found.",
          };
        }
      }
    } else {
      nav = buildStageNavigation({
        currentWaypointId,
        currentBuildingId,
        destinationBuildingId:
          destinationBuilding?.id || destinationRoom?.building || "",
        destinationRoomNumber: destinationRoom?.room_number || "",
        userGps,
        accessibleOnly: accessibilityMode,
      });
    }

    setSteps(Array.isArray(nav.steps) ? nav.steps : []);
    setPathIds(Array.isArray(nav.path) ? nav.path : []);
    setNextWaypoint(nav.nextWaypoint || null);
    setRouteDistance(nav.distance ?? Infinity);
    setTransportMode(nav.transportMode || "arrow");
    setStageMode(nav.mode || "idle");
    setStageMessage(nav.message || "");
    setArrived(Boolean(nav.arrived));

    if (Array.isArray(nav.steps) && nav.steps.length > 0) {
      const nextIdx = nav.steps.findIndex(
        (step) => step.waypointId === nav.nextWaypoint?.id
      );

      if (nextIdx >= 0) {
        setActiveStepIndex(nextIdx);
      } else if (!nav.arrived && nav.steps.length > 1) {
        setActiveStepIndex(1);
      } else {
        setActiveStepIndex(nav.arrived ? nav.steps.length - 1 : 0);
      }
    } else {
      setActiveStepIndex(0);
    }
  }, [
    currentWaypointId,
    currentBuildingId,
    destinationBuilding,
    destinationRoom,
    userGps,
    accessibilityMode,
    emergencyMode,
    preferencesReady,
  ]);

  useEffect(() => {
    if (viewMode !== VIEW_MODE.OUTDOOR) return;
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
  }, [viewMode, userGps, currentWaypointId, pathIds, arrived]);

  useEffect(() => {
    if (viewMode !== VIEW_MODE.INDOOR) return;
    if (!currentIndoorPosition || !currentWaypointId || pathIds.length === 0 || arrived) return;
    if (!nextWaypoint) return;

    const advanced = advanceRouteIfNeededIndoor({
      currentWaypointId,
      currentIndoorPosition,
      pathIds,
      deviceHeading,
      currentFloor: currentWaypointObj?.floor ?? null,
      currentBuildingId,
      previousDistanceToNext: previousIndoorDistance,
      closeThreshold: 20,
      nearThreshold: 35,
      headingToleranceDegrees: 60,
    });

    if (Number.isFinite(advanced.distanceToNext)) {
      setPreviousIndoorDistance(advanced.distanceToNext);
    }

    if (advanced.advanced && advanced.currentWaypointId !== currentWaypointId) {
      const next = getWaypointById(advanced.currentWaypointId);

      setCurrentWaypointId(advanced.currentWaypointId);

      if (next?.building) setCurrentBuildingId(next.building);
      if (next?.label) setCurrentWaypointLabel(next.label);

      setCurrentIndoorPosition({
        building: next?.building || currentBuildingId || "",
        floor: next?.floor || "",
        x: next?.x,
        y: next?.y,
      });

      setPreviousIndoorDistance(null);
      setLastStepAnchorCount(stepCount);
    }
  }, [
    viewMode,
    currentIndoorPosition,
    currentWaypointId,
    pathIds,
    arrived,
    nextWaypoint,
    deviceHeading,
    currentWaypointObj,
    currentBuildingId,
    previousIndoorDistance,
    stepCount,
  ]);

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

  function applyScannedWaypoint(scannedWaypoint, source = "qr") {
    if (!scannedWaypoint) return;

    const scannedId = scannedWaypoint.id || "";
    const isOnCurrentPath = Array.isArray(pathIds) && pathIds.includes(scannedId);

    setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
    setCurrentBuildingId(scannedWaypoint.building || "");
    setCurrentWaypointId(scannedId);
    setForceIndoorAfterScan(true);
    setVisionSource(source);

    setCurrentIndoorPosition({
      building: scannedWaypoint.building || "",
      floor: scannedWaypoint.floor || "",
      x: scannedWaypoint.x,
      y: scannedWaypoint.y,
    });

    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);

    setVisualLocateActive(false);

    if (!isOnCurrentPath) {
      setActiveStepIndex(0);
    }

    showScanBadge(scannedWaypoint.label || scannedWaypoint.id);
  }

  function handleScan({ data }) {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);

    const qrText = String(data || "").trim();
    if (!qrText) return;

    const scannedWaypoint = findWaypointByQrData(qrText);
    setLastScannedText(qrText);

    if (!scannedWaypoint) {
      setCurrentWaypointLabel(`Scanned: ${qrText}`);
      setVisionSource(null);
      showScanBadge(qrText);
      return;
    }

    const destinationBuildingId =
      destinationBuilding?.id || destinationRoom?.building || "";

    const scannedBuildingId = scannedWaypoint.building || "";
    const scannedType = String(scannedWaypoint.type || "").toLowerCase();
    const scannedLabel = String(scannedWaypoint.label || "").toLowerCase();

    const isEntranceLike =
      scannedType === "entrance" ||
      scannedLabel.includes("entrance") ||
      scannedLabel.includes("exit");

    const isWrongBuildingExitScan =
      isEntranceLike &&
      destinationBuildingId &&
      scannedBuildingId &&
      normalize(scannedBuildingId) !== normalize(destinationBuildingId);

    if (isWrongBuildingExitScan || pendingTransitionType === "exit") {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId("");
      setCurrentWaypointId("");
      setForceIndoorAfterScan(false);
      setVisionSource("qr");
      setVisualLocateActive(false);
      setCurrentIndoorPosition(null);
      setPreviousIndoorDistance(null);
      setLastStepAnchorCount(stepCount);
      setPendingTransitionType(null);

      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      lastOrsGpsRef.current = null;
      lastOrsFetchKeyRef.current = null;

      setStageMode("outdoor_guidance");
      setStageMessage(
        "Exit confirmed. Continuing outdoor navigation to the destination building."
      );

      showScanBadge(`Exited ${scannedWaypoint.building || "building"}`);
      return;
    }

    applyScannedWaypoint(scannedWaypoint, "qr");
  }

  function handleOutdoorQrScan({ data }) {
    if (scanCooldownRef.current) return;
    scanCooldownRef.current = true;

    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);

    const qrText = String(data || "").trim();
    if (!qrText) return;

    const scannedWaypoint = findWaypointByQrData(qrText);
    setLastScannedText(qrText);

    if (!scannedWaypoint) {
      showScanBadge(qrText);
      return;
    }

    const destinationBuildingId =
      destinationBuilding?.id || destinationRoom?.building || "";

    const scannedBuildingId = scannedWaypoint.building || "";
    const scannedType = String(scannedWaypoint.type || "").toLowerCase();
    const scannedLabel = String(scannedWaypoint.label || "").toLowerCase();

    const isEntranceLike =
      scannedType === "entrance" ||
      scannedLabel.includes("entrance") ||
      scannedLabel.includes("exit");

    const isWrongBuildingExitScan =
      isEntranceLike &&
      destinationBuildingId &&
      scannedBuildingId &&
      normalize(scannedBuildingId) !== normalize(destinationBuildingId);

    if (pendingTransitionType === "entrance" && !isWrongBuildingExitScan) {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId(scannedWaypoint.building || "");
      setCurrentWaypointId(scannedWaypoint.id || "");
      setForceIndoorAfterScan(true);
      setVisionSource("qr");
      setVisualLocateActive(false);

      setCurrentIndoorPosition({
        building: scannedWaypoint.building || "",
        floor: scannedWaypoint.floor || "",
        x: scannedWaypoint.x,
        y: scannedWaypoint.y,
      });

      setPreviousIndoorDistance(null);
      setLastStepAnchorCount(stepCount);
      setPendingTransitionType(null);
      showScanBadge(scannedWaypoint.label || scannedWaypoint.id);
    } else if (pendingTransitionType === "exit" || isWrongBuildingExitScan) {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId("");
      setCurrentWaypointId("");
      setForceIndoorAfterScan(false);
      setVisionSource("qr");
      setVisualLocateActive(false);
      setCurrentIndoorPosition(null);
      setPreviousIndoorDistance(null);
      setLastStepAnchorCount(stepCount);
      setPendingTransitionType(null);
      setStageMode("outdoor_guidance");
      setStageMessage(
        "Exit confirmed. Continuing outdoor navigation to the destination building."
      );

      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      lastOrsGpsRef.current = null;
      lastOrsFetchKeyRef.current = null;

      showScanBadge(`Exited ${scannedWaypoint.building || "building"}`);
    } else {
      applyScannedWaypoint(scannedWaypoint, "qr");
    }

    setOutdoorScannerVisible(false);
    setDetailsVisible(false);
    setHelpVisible(false);
  }

  function openOutdoorScanner() {
    setOutdoorScannerVisible(true);
  }

  function handleReset() {
    setForceIndoorAfterScan(false);
    setPendingTransitionType(null);

    setOrsCoords([]);
    setOrsSteps([]);
    setOrsMeters(null);
    setOrsError(null);
    setOrsLoading(false);

    didAutoFitRouteRef.current = false;
    lastOrsGpsRef.current = null;
    lastOrsFetchKeyRef.current = null;

    setCurrentWaypointLabel("Waiting for scan");
    setCurrentWaypointId("");
    setCurrentBuildingId("");
    setLastScannedText("");
    setVisionSource(null);
    setVisualLocateActive(false);
    setCurrentIndoorPosition(null);
    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);

    setSteps([]);
    setPathIds([]);
    setNextWaypoint(null);
    setRouteDistance(Infinity);
    setStageMode("idle");
    setStageMessage("Outdoor navigation reset. Route will rebuild from current GPS.");
    setArrived(false);
    setActiveStepIndex(0);

    setDetailsVisible(false);
    setHelpVisible(false);
    setOutdoorScannerVisible(false);
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
    const gpsWeak = gpsBuildingGuess.confidence !== "high";

    const fallbackBuildingId =
      helpBuildingId ||
      (gpsWeak ? "" : (currentBuildingId || gpsBuildingGuess.building?.id || destinationBuilding?.id || ""));

    const buildingId = String(fallbackBuildingId || "").trim();
    const roomNumber = String(helpRoomNumber || "").trim().toUpperCase();

    if (!buildingId) {
      setHelpError(
        gpsWeak
          ? "GPS is weak. Choose a building first."
          : "Choose a building first."
      );
      return;
    }

    if (!roomNumber) {
      setHelpError("Enter a nearby room number.");
      return;
    }

    const result = findRoom(buildingId, roomNumber);

    if (!result?.waypoint) {
      setHelpError(
        `We couldn’t find room ${roomNumber} in this building. Check the number or choose another building.`
      );
      return;
    }

    setCurrentBuildingId(buildingId);
    setCurrentWaypointId(result.waypoint.id);
    setCurrentWaypointLabel(result.waypoint.label || `Room ${roomNumber}`);
    setForceIndoorAfterScan(true);

    setCurrentIndoorPosition({
      building: result.waypoint.building || "",
      floor: result.waypoint.floor || "",
      x: result.waypoint.x,
      y: result.waypoint.y,
    });

    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);
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
    setCurrentIndoorPosition(null);
    setPreviousIndoorDistance(null);
    setLastStepAnchorCount(stepCount);
    showScanBadge(`Route set to ${destinationBuilding?.name || "destination building"}`);
  }

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
        <Text style={s.helpTitle}>You’re outside campus</Text>
        <Text style={s.helpSubtitle}>
          We’ll guide you to {destinationBuilding?.name || "the destination building"} first.
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
    const gpsWeak = gpsBuildingGuess.confidence !== "high";

    return (
      <>
        <Text style={s.helpTitle}>
          You’re near {destinationBuilding?.name || "the correct building"}
        </Text>
        <Text style={s.helpSubtitle}>
          If you see a QR code nearby, scan it first for the most accurate indoor location.
          If there is no QR code nearby, {gpsWeak ? "choose your building and " : ""}enter a room number you can see next to you.
        </Text>

        {gpsBuildingGuess.confidence !== "high" && (
          <View style={s.helpWarningBox}>
            <Text style={s.helpWarningTitle}>GPS signal is weak</Text>
            <Text style={s.helpWarningText}>
              Building could not be confirmed accurately. Please choose your building manually.
            </Text>
          </View>
        )}

        <SectionTitle icon="🏢" text={gpsWeak ? "Choose building" : "Building (optional)"} />
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
            onPress={() => {
              setHelpVisible(false);
              setCameraEnabled(true);
            }}
          >
            <Text style={s.helpSecondaryBtnText}>Scan Nearby QR</Text>
          </Pressable>

          <Pressable style={s.helpPrimaryBtn} onPress={handleUseRoomLocation}>
            <Text style={s.helpPrimaryBtnText}>Use Room Number</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderWrongHelp() {
    return (
      <>
        <Text style={s.helpTitle}>
          You’re near {gpsBuildingGuess.building?.name || "another building"}
        </Text>
        <Text style={s.helpSubtitle}>
          Your destination is in {destinationBuilding?.name || "a different building"}.
          We’ll guide you there first.
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
        <Text style={s.helpTitle}>We couldn’t confirm your building</Text>
        <Text style={s.helpSubtitle}>
          If you see a QR code nearby, scan it first. If not, choose your building and enter
          a nearby room number so we can estimate your indoor location.
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

          <Pressable
            style={s.helpSecondaryBtn}
            onPress={() => {
              setHelpVisible(false);
              setCameraEnabled(true);
            }}
          >
            <Text style={s.helpSecondaryBtnText}>Scan Nearby QR</Text>
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

  function renderOutdoorView() {
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
          contentContainerStyle={[s.outdoorScrollContent, { paddingBottom: 24 + insets.bottom }]}
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

            <View style={s.modeBadgeRow}>
              {accessibilityMode ? (
                <View style={s.accessibilityBadgeStatic}>
                  <Text style={s.accessibilityBadgeText}>ACCESS ON</Text>
                </View>
              ) : null}

              {emergencyMode ? (
                <View style={s.emergencyBadgeStatic}>
                  <Text style={s.emergencyBadgeText}>EMERGENCY ON</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={s.mapCard}>
            {mapRegion ? (
              <MapView
                ref={mapRef}
                key={outdoorTargetBuilding?.id || destinationTitle}
                style={s.mapView}
                region={mapRegion}
                showsUserLocation
                showsMyLocationButton={false}
                rotateEnabled={false}
                scrollEnabled={true}
                zoomEnabled={true}
                pitchEnabled={false}
              >
                {orsCoords.length > 1 ? (
                  <Polyline
                    coordinates={orsCoords}
                    strokeColor="#eb2525"
                    strokeWidth={6}
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

            {orsLoading && orsCoords.length === 0 ? (
              <View style={s.mapLoadingOverlay}>
                <ActivityIndicator color={PSU.blue} />
                <Text style={s.mapLoadingText}>Getting route…</Text>
              </View>
            ) : null}

            <View style={s.mapInfoRow}>
              {typeof orsMeters === "number" && Number.isFinite(orsMeters) ? (
                <>
                  <View style={s.mapInfoPill}>
                    <Text style={s.mapInfoPillText}>
                      {`${Math.round(Number(orsMeters) * 3.28084)} ft`}
                    </Text>
                  </View>
                  <View style={s.mapInfoPill}>
                    <Text style={s.mapInfoPillText}>
                      {`${Number(orsMeters).toFixed(1)} m`}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={s.mapInfoPill}>
                  <Text style={s.mapInfoPillText}>
                    Calculating distance…
                  </Text>
                </View>
              )}
              <View style={s.mapInfoPill}>
                <Text style={s.mapInfoPillText}>
                  {outdoorTargetBuilding?.name ||
                    gpsBuildingGuess.building?.name ||
                    "GPS locating"}
                </Text>
              </View>
            </View>
          </View>

          <View style={[s.outdoorBottomCard, pendingTransitionType === "entrance" && s.transitionCard]}>
            {pendingTransitionType === "entrance" ? (
              <>
                <Text style={s.transitionCardEyebrow}>ENTRANCE REACHED</Text>
                <Text style={s.transitionCardTitle}>
                  You're at {outdoorTargetBuilding?.name || "the destination building"}
                </Text>
                <Text style={s.transitionCardSub}>
                  Scan the QR code at the entrance to switch to indoor navigation.
                </Text>
              </>
            ) : (
              <>
                <Text style={s.outdoorBottomTitle}>
                  {stageMode === "exit_current_building"
                    ? "Leave the current building and head toward the destination building."
                    : stageMode === "outdoor_guidance"
                    ? "Follow the outdoor route to the correct building."
                    : "Use outdoor guidance until you reach the correct entrance."}
                </Text>

                {selectedDestinationEntrance ? (
                  <Text style={s.outdoorBottomText}>
                    Routing to entrance:{" "}
                    {selectedDestinationEntrance.label || selectedDestinationEntrance.id}
                  </Text>
                ) : outdoorTargetBuilding ? (
                  <Text style={s.outdoorBottomText}>
                    Routing to building fallback: {outdoorTargetBuilding.name}
                  </Text>
                ) : null}

                {orsError ? (
                  <Text style={s.orsErrorText}>⚠ {orsError} — using GPS guidance</Text>
                ) : null}

                {orsSteps.length > 0 && !orsError ? (
                  <View style={s.stepListWrap}>
                    {orsSteps.slice(0, 3).map((step, index) => {
                      const isActive = index === 0;

                      return (
                        <View key={index} style={s.stepRow}>
                          <View style={[s.stepDot, isActive && s.stepDotActive]}>
                            <Text style={s.stepDotText}>
                              {index === 0 ? "➡️" : "•"}
                            </Text>
                          </View>

                          <View style={[s.stepContent, isActive && s.stepContentActive]}>
                            {isActive ? (
                              <Text style={s.stepCurrentBadge}>Current Step</Text>
                            ) : null}

                            <Text style={[s.stepText, isActive && s.stepTextActive]}>
                              {step.instruction}
                            </Text>

                            {typeof step.distance === "number" ? (
                              <Text style={s.stepSubText}>
                                {step.distance.toFixed(0)} m
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}

                    {orsSteps.length > 3 ? (
                      <Text style={s.orsStepsMore}>+{orsSteps.length - 3} more steps</Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={s.outdoorBottomText}>
                    Use Scan QR when you reach an entrance or indoor anchor so the app can switch into indoor navigation.
                  </Text>
                )}
              </>
            )}

            <View style={s.outdoorBottomButtons}>
              <Pressable style={s.outdoorSecondaryBtn} onPress={handleReset}>
                <Text style={s.outdoorSecondaryBtnText}>Reset</Text>
              </Pressable>

              <Pressable
                style={pendingTransitionType === "entrance" ? s.transitionScanBtn : s.outdoorScanBtn}
                onPress={openOutdoorScanner}
              >
                <Text style={pendingTransitionType === "entrance" ? s.transitionScanBtnText : s.outdoorScanBtnText}>
                  {pendingTransitionType === "entrance" ? "📷 I'm at the entrance — Scan QR" : "Scan QR"}
                </Text>
              </Pressable>

              <Pressable
                style={s.outdoorPrimaryBtn}
                onPress={() =>
                  navigation.navigate("VisualLocateScreen", {
                    returnScreen: route.name || "NavigationPage",
                    destination,
                  })
                }
              >
                <Text style={s.outdoorPrimaryBtnText}>Locate</Text>
              </Pressable>

              <Pressable
                style={s.outdoorPrimaryBtn}
                onPress={() => setDetailsVisible(true)}
              >
                <Text style={s.outdoorPrimaryBtnText}>Details</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  function renderIndoorView() {
    return (
      <View style={s.cameraLayer}>
        {cameraEnabled ? (
          <CameraView
            ref={cameraRef}
            style={s.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleScan}
          />
        ) : (
          <View style={[s.camera, s.cameraPaused]}>
            <Text style={s.cameraPausedText}>Camera paused</Text>
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

          {accessibilityMode ? (
            <View style={s.accessibilityBadge}>
              <Text style={s.accessibilityBadgeText}>ACCESS ON</Text>
            </View>
          ) : null}

          {emergencyMode ? (
            <View style={s.emergencyBadge}>
              <Text style={s.emergencyBadgeText}>EMERGENCY ON</Text>
            </View>
          ) : null}

          {batterySaverMode ? (
            <View style={s.batteryBadge}>
              <Text style={s.batteryBadgeText}>BATTERY SAVER ON</Text>
            </View>
          ) : null}

          <View style={s.arrowCenterWrap}>
            <DirectionArrow
              direction={fallbackArrowDirection}
              arrived={arrived}
              heading={deviceHeading}
              targetBearing={targetBearing}
              mode={transportMode}
            />
          </View>

          {!visionReady ? (
            <View style={s.visionLoadingBadge}>
              <Text style={s.visionLoadingText}>📷 Loading vision…</Text>
            </View>
          ) : null}

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
              <Text style={s.scanFeedbackTitle}>
                {visionSource === "vision" ? "📷 Location Recognized" : "✅ Location Updated"}
              </Text>
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
                {stageMessage || currentStep?.text || "No QR nearby? Tap User Help."}
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
                onPress={() => setDetailsVisible(true)}
              >
                <Text style={s.bottomIconBtnText}>Details</Text>
              </Pressable>
            </View>

            {pendingTransitionType === "exit" ? (
              <View style={s.exitPromptRow}>
                <Pressable style={s.exitPromptBtn} onPress={openOutdoorScanner}>
                  <Text style={s.exitPromptBtnText}>
                    🚪 I exited the building — Scan exit QR to continue outside
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={s.bottomActionRow}>
                <Pressable
                  style={[
                    s.secondaryBottomBtn,
                    batterySaverMode && s.batterySaverBtnActive,
                  ]}
                  onPress={() => setBatterySaverMode((prev) => !prev)}
                >
                  <Text
                    style={[
                      s.secondaryBottomBtnText,
                      batterySaverMode && s.batterySaverBtnTextActive,
                    ]}
                  >
                    {batterySaverMode ? "Battery Saver ON" : "Battery Saver"}
                  </Text>
                </Pressable>

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
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    );
  }

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
                {pendingTransitionType === "exit" ? "Scan Exit QR" : "Scan Entrance QR"}
              </Text>

              <View style={{ width: 56 }} />
            </View>

            <Text style={s.scannerSubtitle}>
              {pendingTransitionType === "exit"
                ? "Scan the QR code at the exit to continue outside toward the correct building."
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
                    {Number.isFinite(routeDistance)
                      ? `${routeDistance.toFixed(1)} m`
                      : "No route distance yet."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🧠" text="Vision Status" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {visionReady
                      ? visualLocateActive
                        ? "Ready — visual locate is active"
                        : "Ready — visual locate is idle until user starts it"
                      : "Loading reference fingerprints…"}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="👣" text="Pedometer" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {pedometerAvailable
                      ? `Steps: ${stepCount} (anchor: ${lastStepAnchorCount})`
                      : "Pedometer unavailable on this device."}
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
                <SectionTitle icon="🗺️" text="Indoor Position" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {currentIndoorPosition
                      ? `x: ${Number(currentIndoorPosition.x).toFixed(1)}, y: ${Number(currentIndoorPosition.y).toFixed(1)}, floor: ${currentIndoorPosition.floor || "?"}`
                      : "No indoor anchor yet."}
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
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    borderColor: "rgba(255,255,255,0.18)",
  },
  destinationPillEyebrow: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  destinationPillTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  destinationPillSub: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    marginTop: 2,
  },

  helpChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  helpChipText: { color: "#fff", fontWeight: "900", fontSize: 14 },

  accessibilityBadge: {
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: "rgba(234,241,255,0.96)",
    borderColor: "#C9D9FF",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  accessibilityBadgeStatic: {
    backgroundColor: "rgba(234,241,255,0.96)",
    borderColor: "#C9D9FF",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  accessibilityBadgeText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 11,
  },

  emergencyBadge: {
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: "rgba(255,238,238,0.96)",
    borderColor: "#F3C7C7",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emergencyBadgeStatic: {
    backgroundColor: "rgba(255,238,238,0.96)",
    borderColor: "#F3C7C7",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  emergencyBadgeText: {
    color: "#B42318",
    fontWeight: "900",
    fontSize: 11,
  },

  batteryBadge: {
    alignSelf: "center",
    marginTop: 6,
    backgroundColor: "rgba(255,255,245,0.96)",
    borderColor: "#E8D89A",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  batteryBadgeText: {
    color: "#7A5D00",
    fontWeight: "900",
    fontSize: 11,
  },

  arrowCenterWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -10,
  },

  visionLoadingBadge: {
    position: "absolute",
    top: 128,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.52)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  visionLoadingText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },

  scanFeedback: {
    position: "absolute",
    top: 165,
    alignSelf: "center",
    backgroundColor: PSU.scanBadgeBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.scanBadgeBorder,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 220,
    alignItems: "center",
  },
  scanFeedbackTitle: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 2,
  },
  scanFeedbackText: {
    color: PSU.text,
    fontSize: 12,
    fontWeight: "700",
  },

  middleInstructionWrap: {
    alignItems: "center",
    marginBottom: 92,
  },
  nextStepCard: {
    width: "88%",
    backgroundColor: PSU.nextBg,
    borderColor: PSU.nextBorder,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  arrivalCard: {
    backgroundColor: PSU.arrivalBg,
    borderColor: PSU.arrivalBorder,
  },
  nextStepEyebrow: {
    color: PSU.blue,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  arrivalEyebrow: {
    color: PSU.green,
  },
  nextStepTitle: {
    color: PSU.text,
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 23,
  },
  arrivalTitle: {
    color: PSU.green,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    backgroundColor: "#EEF3FA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaPillText: {
    color: PSU.blue,
    fontSize: 12,
    fontWeight: "800",
  },
  stageText: {
    marginTop: 10,
    color: PSU.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  bottomPanel: {
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  bottomPanelTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  currentLocationPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE7F2",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  currentLocationEyebrow: {
    color: PSU.blue,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  currentLocationText: {
    color: PSU.text,
    fontSize: 14,
    fontWeight: "900",
  },
  currentLocationSub: {
    color: PSU.muted,
    fontSize: 12,
    marginTop: 2,
  },

  bottomIconBtn: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#DDE7F2",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bottomIconBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 13,
  },

  exitPromptRow: {
    marginTop: 12,
  },
  exitPromptBtn: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#DDE7F2",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  exitPromptBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "center",
  },

  bottomActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  secondaryBottomBtn: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#DDE7F2",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBottomBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 13,
  },
  batterySaverBtnActive: {
    backgroundColor: "#FFF8D6",
    borderColor: "#E8D89A",
  },
  batterySaverBtnTextActive: {
    color: "#7A5D00",
  },
  primaryBottomBtn: {
    flex: 1.25,
    backgroundColor: PSU.blue,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBottomBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

  permissionSafe: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  permissionCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  permissionTitle: {
    color: PSU.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  permissionText: {
    color: PSU.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
    marginTop: 10,
  },
  permissionBtn: {
    marginTop: 20,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  permissionBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  permissionBackBtn: {
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  permissionBackText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 14,
  },

  outdoorSafe: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  outdoorScroll: {
    flex: 1,
  },
  outdoorScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  outdoorHeader: {
    marginBottom: 14,
  },
  outdoorBackBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  outdoorBackText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 14,
  },
  outdoorHeaderCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  outdoorEyebrow: {
    color: PSU.blue,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  outdoorTitle: {
    color: PSU.text,
    fontSize: 19,
    fontWeight: "900",
  },
  outdoorSub: {
    color: PSU.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  modeBadgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  mapCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 10,
    marginBottom: 14,
  },
  mapView: {
    width: "100%",
    height: 280,
    borderRadius: 16,
  },
  mapPlaceholder: {
    height: 280,
    borderRadius: 16,
    backgroundColor: PSU.mapBg,
    borderWidth: 1,
    borderColor: PSU.mapBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  mapPlaceholderText: {
    color: PSU.blue,
    fontWeight: "800",
    fontSize: 14,
  },
  mapLoadingOverlay: {
    position: "absolute",
    top: 24,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapLoadingText: {
    color: PSU.blue,
    fontWeight: "800",
    fontSize: 12,
  },
  mapInfoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  mapInfoPill: {
    backgroundColor: "#EEF3FA",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapInfoPillText: {
    color: PSU.blue,
    fontWeight: "800",
    fontSize: 12,
  },

  outdoorBottomCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  transitionCard: {
    borderColor: "#C9D9FF",
    backgroundColor: "#F7FAFF",
  },
  transitionCardEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  transitionCardTitle: {
    color: PSU.text,
    fontSize: 18,
    fontWeight: "900",
  },
  transitionCardSub: {
    color: PSU.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },

  outdoorBottomTitle: {
    color: PSU.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 22,
  },
  outdoorBottomText: {
    color: PSU.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  orsErrorText: {
    color: PSU.errorText,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 8,
  },
  orsStepsMore: {
    color: PSU.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
    marginLeft: 38,
  },

  outdoorBottomButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    flexWrap: "wrap",
  },
  outdoorSecondaryBtn: {
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorSecondaryBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 13,
  },
  outdoorScanBtn: {
    flexGrow: 1,
    backgroundColor: "#EEF4FF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#C9D9FF",
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorScanBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 13,
  },
  transitionScanBtn: {
    flexGrow: 1,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  transitionScanBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },
  outdoorPrimaryBtn: {
    flexGrow: 1,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  outdoorPrimaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

  scannerScreen: {
    flex: 1,
    backgroundColor: "#000",
  },
  scannerSafe: {
    flex: 1,
    paddingHorizontal: 16,
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  scannerCloseBtn: {
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  scannerCloseText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },
  scannerTitle: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  scannerSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
  },
  scannerCameraWrap: {
    flex: 1,
    marginTop: 18,
    marginBottom: 20,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  scannerCamera: {
    flex: 1,
  },

  helpBackdrop: {
    flex: 1,
    backgroundColor: PSU.modalBackdrop,
    justifyContent: "flex-end",
  },
  helpSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    maxHeight: "82%",
  },
  helpTitle: {
    color: PSU.text,
    fontSize: 22,
    fontWeight: "900",
  },
  helpSubtitle: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 14,
  },
  helpInfoCard: {
    backgroundColor: "#F8FAFD",
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  helpInfoTitle: {
    color: PSU.blue,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  helpInfoBody: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },

  helpWarningBox: {
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: "#FFF4E5",
    borderWidth: 1,
    borderColor: "#F5B971",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

  helpWarningTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#A15C00",
    marginBottom: 4,
  },

  helpWarningText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#7A4B00",
  },
  helpInput: {
    backgroundColor: PSU.helpFieldBg,
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: PSU.text,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 14,
  },
  helpBottomRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  helpSecondaryBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  helpSecondaryBtnText: {
    color: PSU.blue,
    fontWeight: "900",
    fontSize: 14,
  },
  helpPrimaryBtn: {
    flex: 1.15,
    backgroundColor: PSU.blue,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  helpPrimaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
  },

  errorCard: {
    backgroundColor: PSU.errorBg,
    borderColor: PSU.errorBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  errorText: {
    color: PSU.errorText,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 20,
  },

  buildingList: {
    gap: 10,
    marginBottom: 14,
  },
  buildingCard: {
    backgroundColor: "#fff",
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  buildingCardSelected: {
    backgroundColor: PSU.helpBlue,
    borderColor: PSU.helpBlueBorder,
  },
  buildingCardTitle: {
    color: PSU.text,
    fontSize: 14,
    fontWeight: "900",
  },
  buildingCardTitleSelected: {
    color: PSU.blue,
  },
  buildingCardSub: {
    color: PSU.muted,
    fontSize: 12,
    marginTop: 2,
  },

  detailsBackdrop: {
    flex: 1,
    backgroundColor: PSU.modalBackdrop,
    justifyContent: "flex-end",
  },
  detailsSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 22,
    maxHeight: "84%",
  },
  detailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailsTitle: {
    color: PSU.text,
    fontSize: 22,
    fontWeight: "900",
  },
  detailsClose: {
    color: PSU.blue,
    fontSize: 14,
    fontWeight: "900",
  },
  detailSection: {
    marginBottom: 16,
  },
  detailInfoCard: {
    backgroundColor: "#F8FAFD",
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  detailBody: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionIcon: {
    fontSize: 16,
  },
  sectionTitleText: {
    color: PSU.blue,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  stepListWrap: {
    gap: 10,
    marginTop: 4,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepDotActive: {
    backgroundColor: "#DBEAFE",
  },
  stepDotText: {
    fontSize: 12,
  },
  stepContent: {
    flex: 1,
    backgroundColor: "#F8FAFD",
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stepContentActive: {
    backgroundColor: "#F4F8FF",
    borderColor: "#C9D9FF",
  },
  stepContentArrived: {
    backgroundColor: "#EFFAF2",
    borderColor: "#B7DEC1",
  },
  stepCurrentBadge: {
    color: PSU.blue,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  stepCurrentBadgeArrived: {
    color: PSU.green,
  },
  stepText: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "700",
  },
  stepTextActive: {
    color: PSU.text,
  },
  stepTextArrived: {
    color: PSU.green,
  },
  stepSubText: {
    color: PSU.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
});

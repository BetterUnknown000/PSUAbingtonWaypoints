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
import MapView, { Polyline, Marker } from "react-native-maps";
import { loadAccessibilityMode } from "../utils/preferencesStorage";
import DirectionArrow from "../components/DirectionArrow";
import {
  initializeImageModel,
  loadReferenceImageDatabase,
  identifyLocationFromFrame,
} from "../utils/imageRecognition";
import campusData from "../data/campusData.json";
import { findRoom } from "../utils/findRoom";
import { findWaypointByQrData, getWaypointById, getBuildingEntrances } from "../utils/qrWaypointLookup";
import { buildStageNavigation, findNearestExitRoute  } from "../utils/pathfinding";
import { calculateBearingDegrees } from "../utils/location";
import { advanceRouteIfNeeded, getNextWaypointId } from "../utils/routeSteps";
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

  const [orsCoords, setOrsCoords] = useState([]);
  const [orsSteps, setOrsSteps] = useState([]);
  const [orsMeters, setOrsMeters] = useState(null);
  const [orsLoading, setOrsLoading] = useState(false);
  const [orsError, setOrsError] = useState(null);

  const [pendingTransitionType, setPendingTransitionType] = useState(null);

  const cameraRef = useRef(null);
  const visionBusyRef = useRef(false);
  const lastOrsFetchRef = useRef(null);
  const mapRef = useRef(null);

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

    // Only care if user is in the wrong building
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



  const orsDestinationGps = useMemo(() => {
    if (!userGps || destinationEntranceWaypoints.length === 0) {
      if (outdoorTargetBuilding?.latitude && outdoorTargetBuilding?.longitude) {
        return {
          latitude: Number(outdoorTargetBuilding.latitude),
          longitude: Number(outdoorTargetBuilding.longitude),
        };
      }
      return null;
    }

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

  useEffect(() => {
    if (viewMode !== VIEW_MODE.OUTDOOR) {
      setOrsLoading(false);
      return;
    }

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

    if (!userGps || !orsDestinationGps) {
      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      setOrsLoading(false);
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

    if (lastOrsFetchRef.current === fetchKey) {
      return;
    }

    lastOrsFetchRef.current = fetchKey;

    let cancelled = false;

    async function loadOutdoorRoute() {
      try {
        setOrsLoading(true);
        setOrsError(null);

        const route = await fetchOrsRoute(
          {
            latitude: Number(userGps.latitude),
            longitude: Number(userGps.longitude),
          },
          {
            latitude: Number(orsDestinationGps.latitude),
            longitude: Number(orsDestinationGps.longitude),
          }
        );

        if (cancelled) return;

        const coordinates = Array.isArray(route?.coordinates)
          ? route.coordinates
            .map((point) => {
              // case 1: already { latitude, longitude }
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

              // case 2: ORS style [longitude, latitude]
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
          typeof route?.totalMeters  === "number" && route.totalMeters > 0
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
        console.log("ORS coordinates count:", coordinates.length);
        console.log("First ORS point:", coordinates[0]);
        setOrsSteps(steps);
        setOrsMeters(distance);
        console.log("setOrsMeters distance:", distance, typeof distance);
        setOrsError(null);

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
        setOrsError("Failed to load outdoor route.");
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

    mapRef.current.fitToCoordinates(orsCoords, {
      edgePadding: {
        top: 80,
        right: 40,
        bottom: 80,
        left: 40,
    },
    animated: true,
    });
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
    if (viewMode !== VIEW_MODE.INDOOR || !visionReady || !cameraEnabled) return;

    let cancelled = false;

    async function runLoop() {
      while (!cancelled) {
        await new Promise((resolve) =>
          setTimeout(resolve, batterySaverMode ? 7000 : 3000)
        );
        if (cancelled) break;
        if (visionSource === "qr") continue;
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
  }, [viewMode, visionReady, cameraEnabled, visionSource, batterySaverMode]);

  useEffect(() => {
    if (!linkedStartWaypoint) return;

    setCurrentWaypointLabel(linkedStartWaypoint.label || linkedStartWaypoint.id);
    setCurrentBuildingId(linkedStartWaypoint.building || "");
    setCurrentWaypointId(linkedStartWaypoint.id || "");
    setLastScannedText(linkedStartWaypoint.qr_code || linkedStartWaypoint.id);
    setVisionSource("qr");
  }, [linkedStartWaypoint]);


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
    showScanBadge(matchedWaypoint.label || matchedWaypoint.id);

    if (navigation?.setParams) {
      navigation.setParams({ visualLocateResult: undefined });
    }
  }, [route.params?.visualLocateResult, navigation]);

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

  const accessibilityMode =
    typeof routeAccessibilityMode === "boolean"
      ? routeAccessibilityMode
      : savedAccessibilityMode;
      
  useEffect(() => {
    if (!preferencesReady) return;

    let nav;

    if (emergencyMode) {
      if (!currentWaypointId || !currentBuildingId) {
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
      const idx = nav.steps.findIndex(
        (step) => step.waypointId === nav.nextWaypoint?.id
      );
      setActiveStepIndex(
        idx >= 0 ? idx : nav.arrived ? nav.steps.length - 1 : 0
      );
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

    // If the user scanned a waypoint off the planned path,
    // the route effect will rebuild from this new location automatically.
    // Clearing the active step index makes the UI feel like a reroute instead of a stale continuation.
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

    // If user scans an entrance/exit QR from the WRONG building,
    // switch back to outdoor navigation immediately.
    if (isWrongBuildingExitScan || pendingTransitionType === "exit") {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId("");
      setCurrentWaypointId("");
      setForceIndoorAfterScan(false);
      setVisionSource("qr");
      setPendingTransitionType(null);

      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      lastOrsFetchRef.current = null;

      setStageMode("outdoor_guidance");
      setStageMessage(
        "Exit confirmed. Continuing outdoor navigation to the destination building."
      );

      showScanBadge(`Exited ${scannedWaypoint.building || "building"}`);
      return;
    }

    // Normal indoor scan
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

    // destination entrance -> switch INTO indoor mode
    if (pendingTransitionType === "entrance" && !isWrongBuildingExitScan) {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId(scannedWaypoint.building || "");
      setCurrentWaypointId(scannedWaypoint.id || "");
      setForceIndoorAfterScan(true);
      setVisionSource("qr");
      setPendingTransitionType(null);
      showScanBadge(scannedWaypoint.label || scannedWaypoint.id);
    }

    // wrong building exit -> switch BACK to outdoor mode
    else if (pendingTransitionType === "exit" || isWrongBuildingExitScan) {
      setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
      setCurrentBuildingId("");
      setCurrentWaypointId("");
      setForceIndoorAfterScan(false);
      setVisionSource("qr");
      setPendingTransitionType(null);
      setStageMode("outdoor_guidance");
      setStageMessage(
        "Exit confirmed. Continuing outdoor navigation to the destination building."
      );

      setOrsCoords([]);
      setOrsSteps([]);
      setOrsMeters(null);
      setOrsError(null);
      lastOrsFetchRef.current = null;

      showScanBadge(`Exited ${scannedWaypoint.building || "building"}`);
    }

    // fallback manual scan
    else {
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

    lastOrsFetchRef.current = null;

    setCurrentWaypointLabel("Waiting for scan");
    setCurrentWaypointId("");
    setCurrentBuildingId("");
    setLastScannedText("");
    setVisionSource(null);

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
        `We couldn’t find room ${roomNumber} in this building. Check the number or choose another building.`
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

  useEffect(() => {
    console.log("orsMeters state changed:", orsMeters, typeof orsMeters);
  }, [orsMeters]);

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
    return (
      <>
        <Text style={s.helpTitle}>
          You’re near {destinationBuilding?.name || "the correct building"}
        </Text>
        <Text style={s.helpSubtitle}>
          Enter a room number you can see nearby. The app will use that room’s waypoint
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
                scrollEnabled={false}
                zoomEnabled={false}
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
              {Number.isFinite(Number(orsMeters)) ? (
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
                    {`orsMeters=${String(orsMeters)}`}
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
                      ? `Ready — ${visionSource === "qr" ? "paused after QR lock" : "scanning every 3 seconds"}`
                      : "Loading reference fingerprints…"}
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

  accessibilityBadge: {
    position: "absolute",
    top: 104,
    left: 16,
    backgroundColor: "rgba(234,241,255,0.96)",
    borderWidth: 1,
    borderColor: "#C9D9FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  accessibilityBadgeText: {
    color: "#0B3D91",
    fontSize: 12,
    fontWeight: "800",
  },

  emergencyBadge: {
    position: "absolute",
    top: 104,
    right: 16,
    backgroundColor: "rgba(255,241,241,0.96)",
    borderWidth: 1,
    borderColor: "#F3C7C7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  emergencyBadgeText: {
    color: "#B42318",
    fontSize: 12,
    fontWeight: "800",
  },

  modeBadgeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },

  accessibilityBadgeStatic: {
    backgroundColor: "rgba(234,241,255,0.96)",
    borderWidth: 1,
    borderColor: "#C9D9FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  emergencyBadgeStatic: {
    backgroundColor: "rgba(255,241,241,0.96)",
    borderWidth: 1,
    borderColor: "#F3C7C7",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  batterySaverBtnActive: {
    backgroundColor: "#FFF8E8",
    borderColor: "#E7C66A",
  },

  batterySaverBtnTextActive: {
    color: "#8A6700",
  },

  batteryBadge: {
    position: "absolute",
    top: 144,
    left: 16,
    backgroundColor: "rgba(255,248,232,0.96)",
    borderWidth: 1,
    borderColor: "#E7C66A",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  batteryBadgeText: {
    color: "#8A6700",
    fontSize: 12,
    fontWeight: "800",
  },

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
  bottomActionRowSingle: {
    flexDirection: "row",
    gap: 10,
  },

  secondaryBottomBtnFull: {
    flex: 1,
    backgroundColor: PSU.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingVertical: 14,
    alignItems: "center",
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
  stepListWrap: { 
    gap: 10,
    marginBottom: 14,},

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepDotActive: {
    backgroundColor: PSU.blue,
    borderColor: PSU.blue,
  },
  stepDotText: {
    color: PSU.text,
    fontSize: 14,
    fontWeight: "900",
  },
  stepContent: {
    flex: 1,
    backgroundColor: PSU.white,
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

  stepSubText: {
    marginTop: 6,
    color: PSU.muted,
    fontSize: 12,
    fontWeight: "700",
  },

  stepText: {
    color: PSU.text,
    fontSize: 14,
    lineHeight: 20,
  },
  orsStepsMore: {
    color: PSU.muted,
    fontSize: 13,
  },
  stepTextActive: { fontWeight: "800" },
  stepTextArrived: { color: PSU.green },
});

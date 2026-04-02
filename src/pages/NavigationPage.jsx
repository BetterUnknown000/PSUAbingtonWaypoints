import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import DirectionArrow from "../components/DirectionArrow";
import campusData from "../data/campusData.json";

import {
  formatDistanceMeters,
  getCurrentUserLocation,
  haversineMeters,
  requestForegroundLocationPermission,
  watchUserLocation,
} from "../utils/location";
import { findWaypointByQrData } from "../utils/qrWaypointLookup";
import { findRouteToRoom } from "../utils/pathfinding";
import { buildStepsFromPath } from "../utils/routeSteps";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  green: "#18794E",
  orange: "#B45309",
  light: "#F5F7FA",
  border: "#DCE5F0",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
  nextBg: "rgba(255,255,255,0.96)",
  nextBorder: "#C9D9FF",
  arrivalBg: "rgba(238,248,241,0.97)",
  arrivalBorder: "#B7DEC1",
  stageBg: "rgba(255,255,255,0.96)",
  stageBorder: "#DCE5F0",
  cardBg: "rgba(255,255,255,0.985)",
  overlayDark: "rgba(0,0,0,0.16)",
  overlayDarkStrong: "rgba(0,0,0,0.34)",
  modalBackdrop: "rgba(0,0,0,0.40)",
  scanBadgeBg: "rgba(255,255,255,0.96)",
  scanBadgeBorder: "#CFE0FF",
};

function SectionTitle({ icon, text }) {
  return (
    <View style={s.sectionTitleRow}>
      <Text style={s.sectionIcon}>{icon}</Text>
      <Text style={s.sectionTitleText}>{text}</Text>
    </View>
  );
}

function getArrowDirectionFromStep(stepText = "") {
  const t = String(stepText).toLowerCase();
  if (t.includes("left")) return "left";
  if (t.includes("right")) return "right";
  if (t.includes("back")) return "back";
  return "straight";
}

function getStage({
  currentBuildingId,
  destinationBuildingId,
  currentWaypointLabel,
}) {
  const current = String(currentBuildingId || "").toLowerCase();
  const destination = String(destinationBuildingId || "").toLowerCase();

  if (current && destination && current === destination) {
    return {
      key: "indoor_destination",
      label: "Indoor Navigation",
      description: "You are in the destination building.",
    };
  }

  if (current && destination && current !== destination) {
    return {
      key: "exit_current_building",
      label: "Exit Guidance",
      description: "You are in a different building. Head to the nearest exit first.",
    };
  }

  if (!currentWaypointLabel || currentWaypointLabel === "Waiting for scan") {
    return {
      key: "outdoor_guidance",
      label: "Outdoor Guidance",
      description: "Use GPS to head toward the destination building.",
    };
  }

  return {
    key: "outdoor_guidance",
    label: "Outdoor Guidance",
    description: "Head toward the destination building.",
  };
}

function getNextStepText({
  arrived,
  destinationRoom,
  stage,
  steps,
  activeStepIndex,
  destinationBuildingName,
  currentWaypointLabel,
}) {
  // If no destination was chosen yet, show a helpful message.
  if (!destinationRoom) {
    return currentWaypointLabel === "Waiting for scan"
      ? "Scan a QR code or open the app from a building QR to set your starting location."
      : "Starting point set. Go back and choose a room or course to begin directions.";
  }

  // If the destination was reached, show the arrival message.
  if (arrived) {
    return `You have arrived at Room ${destinationRoom?.room_number || ""}.`;
  }

  // If the user is in the wrong building, tell them to leave first.
  if (stage.key === "exit_current_building") {
    return "Proceed to the nearest exit of your current building.";
  }

  // If the user is still outside, guide them toward the destination building.
  if (stage.key === "outdoor_guidance") {
    return `Head toward ${destinationBuildingName || "the destination building"}.`;
  }

  // Otherwise, show the current indoor direction step.
  return steps[activeStepIndex]?.text || "Continue toward your destination.";
}

export default function NavigationPage({ route, navigation }) {
  const { destination } = route.params || {};
  const destinationRoom = destination?.room || null;
  const destinationBuilding = destination?.building || null;
  const linkedStartWaypoint = useMemo(() => {
    const params = route.params || {};
    const startWaypointId =
      params.startWaypointId || params.waypoint_id || params.waypointId || "";
    const startQrId = params.startQrId || params.qr_id || params.qrCode || "";

    if (!startWaypointId && !startQrId) {
      return null;
    }

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

  // Stores the actual waypoint object the user is currently at
  const [currentWaypoint, setCurrentWaypoint] = useState(linkedStartWaypoint || null);
  // Text shown in the UI for the user's current location
  const [currentWaypointLabel, setCurrentWaypointLabel] = useState("Waiting for scan");
  // Keeps track of which building the user is currently in
  const [currentBuildingId, setCurrentBuildingId] = useState("");
  // Saves the raw QR text from the last scan
  const [lastScannedText, setLastScannedText] = useState("");
  // Stores the full route path as waypoint IDs from Dijkstra
  const [routePath, setRoutePath] = useState([]);
  // Stores the total route distance returned from pathfinding
  const [routeDistance, setRouteDistance] = useState(0);
  // Stores the step-by-step directions built from the route path
  const [steps, setSteps] = useState([]);
  // Keeps track of which direction step the user is currently on
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  // Becomes true when the user scans the destination waypoint
  const [arrived, setArrived] = useState(false);
  // Controls the little scan success popup animation
  const [scanFlashVisible, setScanFlashVisible] = useState(false);
  // Controls whether the details modal is open
  const [detailsVisible, setDetailsVisible] = useState(false);
  // Stores route errors, like when no path can be found
  const [routeError, setRouteError] = useState("");

  const [gpsPermissionGranted, setGpsPermissionGranted] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [userGps, setUserGps] = useState(null);

  const nextStepFade = useRef(new Animated.Value(1)).current;
  const nextStepScale = useRef(new Animated.Value(1)).current;
  const arrivalPulse = useRef(new Animated.Value(1)).current;
  const scanBadgeAnim = useRef(new Animated.Value(0)).current;
  const scanCooldownRef = useRef(false);

  const destinationTitle = useMemo(() => {
    if (!destinationRoom) return "Choose a Destination";
    return `${destinationBuilding?.name || destinationRoom.building} ${destinationRoom.room_number}`;
  }, [destinationRoom, destinationBuilding]);

  // Builds a real indoor route from the current waypoint to the destination room.
  const applyRouteFromWaypoint = (startWaypoint) => {
    // If we are missing important destination info, stop here.
    if (!startWaypoint || !destinationBuilding?.id || !destinationRoom?.room_number) {
      return;
    }
  
    // Use the utils pathfinding.
    const result = findRouteToRoom(
      startWaypoint.id,
      destinationBuilding.id,
      destinationRoom.room_number,
      { accessibleOnly: false }
    );
  
    // ERROR CASE
    if (
      !result ||
      !result.route ||
      !Array.isArray(result.route.path) ||
      result.route.path.length === 0
    ) {
      setRoutePath([]);
      setRouteDistance(0);
      setSteps([]);
      setActiveStepIndex(0);
      setRouteError("No route could be found from this waypoint.");
      return;
    }
  
    // Save the real route path, distance, and generated step text.
    setRoutePath(result.route.path);
    setRouteDistance(result.route.distance || 0);
    setSteps(buildStepsFromPath(result.route.path));
    setActiveStepIndex(0);
    setRouteError("");
  };
    
  useEffect(() => {
    // If the page was not opened with a starting waypoint, do nothing.
    if (!linkedStartWaypoint) return;
  
    // Set the user's starting location info.
    setCurrentWaypoint(linkedStartWaypoint);
    setCurrentWaypointLabel(linkedStartWaypoint.label || linkedStartWaypoint.id);
    setCurrentBuildingId(linkedStartWaypoint.building || "");
    setLastScannedText(linkedStartWaypoint.qr_code || linkedStartWaypoint.id);
    setArrived(false);
  
    // If the starting point is already inside the destination building,
    // build the indoor route right away.
    if (linkedStartWaypoint.building === destinationBuilding?.id) {
      applyRouteFromWaypoint(linkedStartWaypoint);
    }
  }, [linkedStartWaypoint, destinationBuilding, destinationRoom]);

  useEffect(() => {
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
  }, [activeStepIndex, arrived, nextStepFade, nextStepScale]);

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

  useEffect(() => {
    let subscription = null;
  
    async function setupLocation() {
      try {
        setGpsLoading(true);
  
        // Ask the user for GPS permission.
        const result = await requestForegroundLocationPermission();
  
        if (result.status !== "granted") {
          setGpsPermissionGranted(false);
          setGpsLoading(false);
          return;
        }
  
        setGpsPermissionGranted(true);
  
        // Get the user's current location one time.
        const current = await getCurrentUserLocation();
        setUserGps(current);
  
        // Start watching the user's location as they move.
        subscription = await watchUserLocation((position) => {
          setUserGps(position);
        });
  
        setGpsLoading(false);
      } catch (error) {
        console.log("Location setup error:", error);
        setGpsLoading(false);
      }
    }
  
    setupLocation();
  
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const stage = useMemo(() => {
    return getStage({
      currentBuildingId,
      destinationBuildingId:
        destinationBuilding?.id || destinationRoom?.building || "",
      currentWaypointLabel,
    });
  }, [currentBuildingId, destinationBuilding, destinationRoom, currentWaypointLabel]);

  const nextStepText = useMemo(() => {
    return getNextStepText({
      arrived,
      destinationRoom,
      stage,
      steps,
      activeStepIndex,
      destinationBuildingName: destinationBuilding?.name,
      currentWaypointLabel,
    });
  }, [
    arrived,
    destinationRoom,
    stage,
    steps,
    activeStepIndex,
    destinationBuilding,
    currentWaypointLabel,
  ]);

  const arrowDirection = useMemo(() => {
    if (arrived) return "straight";

    if (stage.key === "exit_current_building") {
      return "straight";
    }

    if (stage.key === "outdoor_guidance") {
      return "straight";
    }

    return getArrowDirectionFromStep(steps[activeStepIndex]?.text || "");
  }, [steps, activeStepIndex, arrived, stage]);

  const remainingSteps = useMemo(() => {
    if (arrived) return 0;
    return Math.max(steps.length - activeStepIndex - 1, 0);
  }, [steps, activeStepIndex, arrived]);

  const distanceToBuildingMeters = useMemo(() => {
    if (
      !userGps ||
      destinationBuilding?.latitude == null ||
      destinationBuilding?.longitude == null
    ) {
      return null;
    }

    return haversineMeters(
      userGps.latitude,
      userGps.longitude,
      Number(destinationBuilding.latitude),
      Number(destinationBuilding.longitude)
    );
  }, [userGps, destinationBuilding]);

  const distanceText = useMemo(() => {
    return formatDistanceMeters(distanceToBuildingMeters);
  }, [distanceToBuildingMeters]);

  const showScanBadge = (text) => {
    setScanFlashVisible(true);
    scanBadgeAnim.setValue(0);

    Animated.sequence([
      Animated.timing(scanBadgeAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(900),
      Animated.timing(scanBadgeAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setScanFlashVisible(false);
    });
  };

  const handleScan = ({ data }) => {
    // Ignore empty scans or scans that happen too fast.
    if (!data || scanCooldownRef.current) return;
  
    // Small cooldown so the camera does not keep scanning the same code nonstop.
    scanCooldownRef.current = true;
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);
  
    // Clean up the scanned text.
    const qrText = String(data).trim();
  
    // Try to match the QR scan to a real waypoint.
    const scannedWaypoint = findWaypointByQrData(qrText);
  
    // Save the raw QR text.
    setLastScannedText(qrText);
  
    // If it was not a real waypoint, still show what was scanned.
    if (!scannedWaypoint) {
      setCurrentWaypoint(null);
      setCurrentWaypointLabel(`Scanned: ${qrText}`);
      setCurrentBuildingId("");
      showScanBadge(qrText);
      return;
    }
  
    // Update the user's current indoor location.
    setCurrentWaypoint(scannedWaypoint);
    setCurrentWaypointLabel(scannedWaypoint.label || scannedWaypoint.id);
    setCurrentBuildingId(scannedWaypoint.building || "");
    showScanBadge(scannedWaypoint.label || scannedWaypoint.id);
  
    // If the user scanned the destination waypoint, they arrived.
    if (scannedWaypoint.id === destination?.waypoint?.id) {
      setArrived(true);
      setActiveStepIndex(Math.max(routePath.length - 1, 0));
      return;
    }
  
    // If the user is now in the destination building,
    // either continue on the route or rebuild the route from here.
    if (scannedWaypoint.building === destinationBuilding?.id) {
      const existingIndex = routePath.indexOf(scannedWaypoint.id);
  
      // If this waypoint is already on the current route,
      // move the user to that step.
      if (existingIndex >= 0) {
        setActiveStepIndex(existingIndex);
        setArrived(false);
        setRouteError("");
      } else {
        // Otherwise, make a brand new route from the scanned location.
        applyRouteFromWaypoint(scannedWaypoint);
        setArrived(false);
      }
    }
  };
  
  const handleReset = () => {
    // Reset everything back to the starting state.
    setCurrentWaypoint(linkedStartWaypoint || null);
    setCurrentWaypointLabel(linkedStartWaypoint?.label || "Waiting for scan");
    setCurrentBuildingId(linkedStartWaypoint?.building || "");
    setLastScannedText(linkedStartWaypoint?.qr_code || linkedStartWaypoint?.id || "");
    setRoutePath([]);
    setRouteDistance(0);
    setSteps([]);
    setActiveStepIndex(0);
    setArrived(false);
    setRouteError("");
    setDetailsVisible(false);
  
    // If a start waypoint already exists in the destination building,
    // rebuild the route right away after reset.
    if (
      linkedStartWaypoint &&
      linkedStartWaypoint.building === destinationBuilding?.id
    ) {
      applyRouteFromWaypoint(linkedStartWaypoint);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={s.permissionSafe}>
        <View style={s.permissionCenter}>
          <Text style={s.permissionTitle}>Loading camera permission...</Text>
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
            The camera is needed to display the navigation view and detect QR codes.
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
      <View style={s.cameraLayer}>
        {cameraEnabled ? (
          <CameraView
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
              <Text style={s.destinationPillEyebrow}>📍 Navigation</Text>
              <Text style={s.destinationPillTitle} numberOfLines={1}>
                {destinationTitle}
              </Text>
              <Text style={s.destinationPillSub} numberOfLines={1}>
                {destinationRoom?.room_name ||
                  "Open from a QR code or choose a room to start."}
              </Text>
            </View>
          </View>

          <View style={s.arrowCenterWrap}>
            <DirectionArrow direction={arrowDirection} arrived={arrived} />
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
              <Text style={s.scanFeedbackTitle}>✅ Location Updated</Text>
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
                {arrived ? "✅ Arrival" : "🧭 Next Step"}
              </Text>
              <Text style={[s.nextStepText, arrived && s.arrivalText]}>
                {nextStepText}
              </Text>
            </Animated.View>
          </View>
        </SafeAreaView>
      </View>

      <View style={s.bottomCardsArea}>
        <View style={s.summaryRow}>
          <View style={s.summaryCard}>
            <SectionTitle icon="📌" text="Current Location" />
            <Text style={s.summaryValue} numberOfLines={1}>
              {currentWaypointLabel}
            </Text>
            <Text style={s.summarySub} numberOfLines={2}>
              {lastScannedText
                ? "Location updated from QR scan."
                : gpsLoading
                ? "Getting GPS location..."
                : "Scan a QR code to set your indoor location."}
            </Text>

            {routeError ? (
              <Text style={s.summarySub}>{routeError}</Text>
            ) : null}
          </View>

          <View style={s.summaryCard}>
            <SectionTitle icon="📏" text="Distance" />
            <Text style={s.summaryValue}>
              {distanceText.feetText} / {distanceText.metersText}
            </Text>
            <Text style={s.summarySub}>
              Distance to destination building
            </Text>
          </View>
        </View>

        <View style={s.miniStatusRow}>
          <View style={s.miniStatusCard}>
            <Text style={s.miniStatusLabel}>Destination</Text>
            <Text style={s.miniStatusValue} numberOfLines={1}>
              {destinationTitle}
            </Text>
          </View>

          <View style={s.miniStatusCard}>
            <Text style={s.miniStatusLabel}>Status</Text>
            <Text style={[s.miniStatusValue, arrived && s.miniStatusValueArrived]}>
              {arrived
                ? "Arrived"
                : stage.key === "exit_current_building"
                ? "Exiting Building"
                : stage.key === "outdoor_guidance"
                ? "Heading Outside"
                : "Indoor Routing"}
            </Text>
          </View>

          <View style={s.miniStatusCard}>
            <Text style={s.miniStatusLabel}>Steps Left</Text>
            <Text style={s.miniStatusValue}>
              {arrived ? "0" : String(remainingSteps)}
            </Text>
          </View>
        </View>

        <View style={s.actionRow}>
          <Pressable
            style={s.controlBtn}
            onPress={() => setCameraEnabled((prev) => !prev)}
          >
            <Text style={s.controlBtnText}>
              {cameraEnabled ? "Pause Camera" : "Resume Camera"}
            </Text>
          </Pressable>

          <Pressable style={s.controlBtn} onPress={handleReset}>
            <Text style={s.controlBtnText}>Reset</Text>
          </Pressable>

          <Pressable style={s.moreInfoBtn} onPress={() => setDetailsVisible(true)}>
            <Text style={s.moreInfoBtnText}>More Info</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={s.modalBackdropWrap}>
          <Pressable style={s.modalBackdropTap} onPress={() => setDetailsVisible(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Navigation Details</Text>
                <Text style={s.modalSubtitle}>Directions and scan history</Text>
              </View>

              <Pressable style={s.modalCloseBtn} onPress={() => setDetailsVisible(false)}>
                <Text style={s.modalCloseBtnText}>Done</Text>
              </Pressable>
            </View>

            <ScrollView
              style={s.modalScroll}
              contentContainerStyle={s.modalScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.detailSection}>
                <SectionTitle icon="📝" text="Directions" />

                {steps.map((step, index) => {
                  const isActive = index === activeStepIndex;

                  return (
                    <View key={step.id} style={s.stepRow}>
                      <View
                        style={[
                          s.stepNumber,
                          isActive && s.stepNumberActive,
                        ]}
                      >
                        <Text
                          style={[
                            s.stepNumberText,
                            isActive && s.stepNumberTextActive,
                          ]}
                        >
                          {arrived && index === activeStepIndex ? "✓" : index + 1}
                        </Text>
                      </View>

                      <View
                        style={[
                          s.stepContent,
                          isActive && s.stepContentActive,
                          arrived && index === activeStepIndex && s.stepContentArrived,
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
                            arrived && index === activeStepIndex && s.stepTextArrived,
                          ]}
                        >
                          {step.text}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="🔎" text="Last QR Scan" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {lastScannedText || "Nothing scanned yet."}
                  </Text>
                </View>
              </View>

              <View style={s.detailSection}>
                <SectionTitle icon="📍" text="GPS Status" />
                <View style={s.detailInfoCard}>
                  <Text style={s.detailBody}>
                    {gpsPermissionGranted
                      ? userGps
                        ? `Lat: ${userGps.latitude.toFixed(6)}, Lng: ${userGps.longitude.toFixed(6)}`
                        : "Waiting for GPS coordinates..."
                      : "GPS permission not granted."}
                  </Text>
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
    height: 90,
    backgroundColor: PSU.overlayDarkStrong,
  },
  bottomGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    backgroundColor: PSU.overlayDark,
  },

  overlaySafe: { flex: 1 },

  topHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  backChip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  backChipText: {
    color: PSU.text,
    fontWeight: "800",
    fontSize: 14,
  },

  destinationPill: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  destinationPillEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  destinationPillTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
  },
  destinationPillSub: {
    marginTop: 4,
    fontSize: 13,
    color: PSU.muted,
  },

  arrowCenterWrap: {
    position: "absolute",
    top: "19%",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },

  scanFeedback: {
    position: "absolute",
    top: 112,
    alignSelf: "center",
    minWidth: 180,
    maxWidth: "82%",
    backgroundColor: PSU.scanBadgeBg,
    borderColor: PSU.scanBadgeBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  scanFeedbackTitle: {
    color: PSU.blue2,
    fontSize: 12,
    fontWeight: "900",
  },
  scanFeedbackText: {
    marginTop: 3,
    color: PSU.text,
    fontSize: 12,
    fontWeight: "700",
  },

  middleInstructionWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 15,
  },
  nextStepCard: {
    backgroundColor: PSU.nextBg,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: PSU.nextBorder,
  },
  arrivalCard: {
    backgroundColor: PSU.arrivalBg,
    borderColor: PSU.arrivalBorder,
  },
  nextStepEyebrow: {
    color: PSU.blue2,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  arrivalEyebrow: {
    color: PSU.green,
  },
  nextStepText: {
    marginTop: 6,
    color: PSU.text,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  arrivalText: {
    color: PSU.green,
  },

  bottomCardsArea: {
    backgroundColor: PSU.cardBg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5ECF4",
  },

  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 12,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionIcon: {
    fontSize: 14,
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: "900",
    color: PSU.blue2,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  summaryValue: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: "800",
    color: PSU.text,
  },
  summarySub: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: PSU.muted,
  },

  miniStatusRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  miniStatusCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 10,
  },
  miniStatusLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: PSU.muted,
    textTransform: "uppercase",
  },
  miniStatusValue: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "800",
    color: PSU.text,
  },
  miniStatusValueArrived: {
    color: PSU.green,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  controlBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnText: {
    color: PSU.text,
    fontSize: 13,
    fontWeight: "800",
  },
  moreInfoBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  moreInfoBtnText: {
    color: PSU.white,
    fontSize: 13,
    fontWeight: "900",
  },

  modalBackdropWrap: {
    flex: 1,
    backgroundColor: PSU.modalBackdrop,
    justifyContent: "flex-end",
  },
  modalBackdropTap: {
    flex: 1,
  },
  modalSheet: {
    maxHeight: "72%",
    backgroundColor: PSU.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: PSU.text,
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: PSU.muted,
  },
  modalCloseBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EEF4FF",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    color: PSU.blue2,
    fontWeight: "900",
    fontSize: 14,
  },

  modalScroll: {
    marginTop: 4,
  },
  modalScrollContent: {
    paddingBottom: 12,
  },

  detailSection: {
    marginBottom: 16,
  },
  detailInfoCard: {
    marginTop: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 12,
  },
  detailBody: {
    color: PSU.muted,
    lineHeight: 20,
    fontSize: 14,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 10,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  stepNumberActive: {
    backgroundColor: PSU.blue2,
    transform: [{ scale: 1.08 }],
  },
  stepNumberText: {
    color: PSU.white,
    fontSize: 12,
    fontWeight: "900",
  },
  stepNumberTextActive: {
    color: PSU.white,
  },
  stepContent: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#EEF2F7",
  },
  stepContentActive: {
    backgroundColor: "#EEF4FF",
    borderColor: "#C9D9FF",
  },
  stepContentArrived: {
    backgroundColor: "#EEF8F1",
    borderColor: "#B7DEC1",
  },
  stepCurrentBadge: {
    alignSelf: "flex-start",
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: PSU.blue,
    color: PSU.white,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden",
  },
  stepCurrentBadgeArrived: {
    backgroundColor: PSU.green,
  },
  stepText: {
    color: PSU.text,
    lineHeight: 20,
    fontWeight: "600",
  },
  stepTextActive: {
    color: PSU.blue,
    fontWeight: "800",
  },
  stepTextArrived: {
    color: PSU.green,
  },

  permissionSafe: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  permissionCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: PSU.text,
    textAlign: "center",
  },
  permissionText: {
    marginTop: 12,
    color: PSU.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  permissionBtn: {
    marginTop: 18,
    backgroundColor: PSU.blue,
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionBtnText: {
    color: PSU.white,
    fontSize: 15,
    fontWeight: "900",
  },
  permissionBackBtn: {
    marginTop: 12,
    padding: 10,
  },
  permissionBackText: {
    color: PSU.blue,
    fontWeight: "800",
  },
});

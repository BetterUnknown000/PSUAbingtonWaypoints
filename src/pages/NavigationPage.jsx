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
import * as Location from "expo-location";
import DirectionArrow from "../components/DirectionArrow";

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

const DEMO_STEPS = [
  { id: "step-0", text: "Start at the entrance." },
  { id: "step-1", text: "Walk toward the main hallway." },
  { id: "step-2", text: "Turn left near the stairs." },
  { id: "step-3", text: "Continue down the hallway." },
  { id: "step-4", text: "Arrive at the classroom." },
];

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

function formatDistance(meters) {
  if (meters == null || Number.isNaN(meters)) {
    return {
      metersText: "-- m",
      feetText: "-- ft",
    };
  }

  const m = Number(meters);
  const ft = m * 3.28084;

  return {
    metersText: `${m.toFixed(1)} m`,
    feetText: `${ft.toFixed(0)} ft`,
  };
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
  demoSteps,
  activeStepIndex,
  destinationBuildingName,
}) {
  if (arrived) {
    return `You have arrived at Room ${destinationRoom?.room_number || ""}.`;
  }

  if (stage.key === "exit_current_building") {
    return "Proceed to the nearest exit of your current building.";
  }

  if (stage.key === "outdoor_guidance") {
    return `Head toward ${destinationBuildingName || "the destination building"}.`;
  }

  return demoSteps[activeStepIndex]?.text || "Continue toward your destination.";
}

export default function NavigationPage({ route, navigation }) {
  const { destination } = route.params || {};
  const destinationRoom = destination?.room || null;
  const destinationBuilding = destination?.building || null;

  const [permission, requestPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const [currentWaypointLabel, setCurrentWaypointLabel] = useState("Waiting for scan");
  const [currentBuildingId, setCurrentBuildingId] = useState("");
  const [lastScannedText, setLastScannedText] = useState("");
  const [steps, setSteps] = useState(DEMO_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(1);
  const [arrived, setArrived] = useState(false);
  const [scanFlashVisible, setScanFlashVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);

  const [gpsPermissionGranted, setGpsPermissionGranted] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(true);
  const [userGps, setUserGps] = useState(null);

  const nextStepFade = useRef(new Animated.Value(1)).current;
  const nextStepScale = useRef(new Animated.Value(1)).current;
  const arrivalPulse = useRef(new Animated.Value(1)).current;
  const scanBadgeAnim = useRef(new Animated.Value(0)).current;
  const scanCooldownRef = useRef(false);

  const destinationTitle = useMemo(() => {
    if (!destinationRoom) return "Unknown Destination";
    return `${destinationBuilding?.name || destinationRoom.building} ${destinationRoom.room_number}`;
  }, [destinationRoom, destinationBuilding]);

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

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 3000,
            distanceInterval: 3,
          },
          (position) => {
            setUserGps({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          }
        );

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
      demoSteps: steps,
      activeStepIndex,
      destinationBuildingName: destinationBuilding?.name,
    });
  }, [arrived, destinationRoom, stage, steps, activeStepIndex, destinationBuilding]);

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
    return formatDistance(distanceToBuildingMeters);
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
    if (!data || scanCooldownRef.current) return;

    scanCooldownRef.current = true;
    setTimeout(() => {
      scanCooldownRef.current = false;
    }, 1200);

    const qrText = String(data);
    setLastScannedText(qrText);
    setCurrentWaypointLabel(`Scanned: ${qrText}`);
    showScanBadge(qrText);

    // Temporary UI-only building detection from QR text.
    // Later your teammate can replace this with real waypoint/building parsing.
    const lowered = qrText.toLowerCase();
    if (lowered.includes("woodland")) setCurrentBuildingId("woodland");
    else if (lowered.includes("sutherland")) setCurrentBuildingId("sutherland");
    else if (lowered.includes("lares")) setCurrentBuildingId("lares");
    else if (lowered.includes("rydal")) setCurrentBuildingId("rydal");
    else if (lowered.includes("springhouse")) setCurrentBuildingId("springhouse");
    else if (lowered.includes("athletic")) setCurrentBuildingId("athletic");

    if (stage.key === "indoor_destination") {
      setActiveStepIndex((prev) => {
        if (prev >= steps.length - 1) {
          setArrived(true);
          return prev;
        }

        const next = prev + 1;
        if (next >= steps.length - 1) {
          setArrived(true);
        }
        return next;
      });
    }
  };

  const handleReset = () => {
    setCurrentWaypointLabel("Waiting for scan");
    setCurrentBuildingId("");
    setLastScannedText("");
    setSteps(DEMO_STEPS);
    setActiveStepIndex(1);
    setArrived(false);
    setDetailsVisible(false);
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
                {destinationRoom?.room_name || "Classroom destination"}
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

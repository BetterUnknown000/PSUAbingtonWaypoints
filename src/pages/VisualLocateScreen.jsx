import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";

import {
  initializeImageModel,
  loadReferenceImageDatabase,
  identifyLocationFromFrame,
} from "../utils/imageRecognition";
import campusData from "../data/campusData.json";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  light: "#F5F7FA",
  border: "#DCE5F0",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

export default function VisualLocateScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [visionReady, setVisionReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Loading visual locator…");
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        setStatus("Loading image references…");
        await initializeImageModel();
        await loadReferenceImageDatabase();
        if (!cancelled) {
          setVisionReady(true);
          setStatus(
            "Ready. Point the camera at a known hallway or landmark, then tap Scan Current View."
          );
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(`Vision setup failed: ${error?.message || "unknown error"}`);
        }
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLocate() {
    if (busy || !visionReady || !cameraRef.current) return;

    setBusy(true);
    setStatus("Capturing image…");

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        base64: false,
      });

      if (!photo?.uri) {
        setStatus("Camera did not return an image.");
        return;
      }

      setStatus("Matching against indoor references…");
      const result = await identifyLocationFromFrame(photo.uri);
      const waypointId = result?.location?.waypoint_id;

      if (!waypointId) {
        setLastResult(null);
        setStatus("No confident visual match. Try steadier framing or better lighting.");
        return;
      }

      const matchedWaypoint = (campusData.waypoints || []).find(
        (waypoint) => waypoint.id === waypointId
      );

      if (!matchedWaypoint) {
        setLastResult(null);
        setStatus("A match was returned, but the waypoint was not found in campus data.");
        return;
      }

      const payload = {
        waypointId: matchedWaypoint.id,
        label: matchedWaypoint.label || matchedWaypoint.id,
        building: matchedWaypoint.building || "",
        floor: matchedWaypoint.floor || "",
        confidence: result?.confidence ?? null,
      };

      setLastResult(payload);
      setStatus(`Matched ${payload.label}. Returning to navigation…`);

      const returnKey = route.params?.returnRouteKey;
      const returnParams = route.params?.returnParams || {};

      navigation.navigate({
        key: returnKey,
        name: route.params?.returnScreen || "Navigation",
        params: {
          ...returnParams,
          visualLocateResult: payload,
        },
        merge: true,
      });
    } catch (error) {
      setStatus(`Visual locate failed: ${error?.message || "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!permission) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.center}>
          <Text style={s.title}>Loading camera permission…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
        <View style={s.centerLight}>
          <Text style={s.title}>Camera permission is required</Text>
          <Text style={s.subtitle}>
            Visual locating uses a separate camera session so indoor QR scanning stays stable.
          </Text>
          <Pressable style={s.primaryBtn} onPress={requestPermission}>
            <Text style={s.primaryBtnText}>Allow Camera Access</Text>
          </Pressable>
          <Pressable style={s.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={s.secondaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 8) }]}> 
        <View style={s.headerSide}>
          <Pressable style={s.headerBtn} onPress={() => navigation.goBack()}>
            <Text style={s.headerBtnText}>← Back</Text>
          </Pressable>
        </View>

        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>Locate Me Visually</Text>
        </View>

        <View style={s.headerSide} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 20 + insets.bottom,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.cameraCard}>
          <CameraView ref={cameraRef} style={s.camera} facing="back" />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>Separate visual check</Text>
          <Text style={s.panelBody}>{status}</Text>

          {lastResult ? (
            <View style={s.resultCard}>
              <Text style={s.resultTitle}>Last match</Text>
              <Text style={s.resultBody}>{lastResult.label}</Text>
              <Text style={s.resultBodySmall}>
                {lastResult.building || "Unknown building"}
                {lastResult.floor ? ` • Floor ${lastResult.floor}` : ""}
                {typeof lastResult.confidence === "number"
                  ? ` • ${(lastResult.confidence * 100).toFixed(1)}%`
                  : ""}
              </Text>
            </View>
          ) : null}

          <View style={s.buttonStack}>
            <Pressable
              style={[s.primaryBtn, (!visionReady || busy) && s.primaryBtnDisabled]}
              onPress={handleLocate}
              disabled={!visionReady || busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Scan Current View</Text>
              )}
            </Pressable>

            <Pressable style={s.secondaryBtn} onPress={() => navigation.goBack()}>
              <Text style={s.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#000",
  },
  centerLight: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: PSU.light,
  },
  scroll: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: PSU.text,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: PSU.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: "#000",
  },
  headerSide: {
    width: 88,
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerBtn: {
    minHeight: 40,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  headerBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  cameraCard: {
    marginHorizontal: 14,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "#111827",
  },
  camera: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  panel: {
    marginTop: 14,
    backgroundColor: PSU.light,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 8,
    minHeight: 300,
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: PSU.blue,
  },
  panelBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: PSU.muted,
  },
  resultCard: {
    marginTop: 16,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 18,
    padding: 14,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: PSU.blue2,
    marginBottom: 4,
  },
  resultBody: {
    fontSize: 16,
    fontWeight: "900",
    color: PSU.text,
  },
  resultBodySmall: {
    marginTop: 4,
    fontSize: 13,
    color: PSU.muted,
  },
  buttonStack: {
    marginTop: 18,
    gap: 12,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PSU.blue,
    paddingHorizontal: 16,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  secondaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    color: PSU.text,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
});

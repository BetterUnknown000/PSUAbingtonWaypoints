import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";

const PSU = {
  blue: "#0B3D91",
  blueDark: "#082E6F",
  green: "#18794E",
  shadow: "#000000",
  ringTick: "#C9D9FF",
};

function normalizeDegrees(value = 0) {
  let deg = Number(value || 0);
  while (deg < 0) deg += 360;
  while (deg >= 360) deg -= 360;
  return deg;
}

function shortestSignedAngle(fromDeg, toDeg) {
  let diff = normalizeDegrees(toDeg) - normalizeDegrees(fromDeg);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function getInstructionRotation(direction) {
  if (direction === "left") return -45;
  if (direction === "right") return 45;
  if (direction === "back") return 180;
  return 0;
}

export default function DirectionArrow({
  direction = "straight",
  arrived = false,
  heading = 0,
  targetBearing = null,
  mode = "arrow",
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const appearAnim = useRef(new Animated.Value(1)).current;
  const compassAnim = useRef(new Animated.Value(0)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const lastArrowDeg = useRef(0);
  const lastTargetBearing = useRef(null);

  const normalizedHeading = normalizeDegrees(heading);

  const relativeArrowDegrees =
    targetBearing != null
      ? shortestSignedAngle(normalizedHeading, targetBearing)
      : getInstructionRotation(direction);

  useEffect(() => {
    appearAnim.setValue(0);
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appearAnim]);

  useEffect(() => {
    if (arrived) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.025,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [arrived, pulseAnim]);

  useEffect(() => {
    Animated.timing(compassAnim, {
      toValue: normalizedHeading,
      duration: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [normalizedHeading, compassAnim]);
  
  useEffect(() => {
    if (targetBearing == null) {
      const target = getInstructionRotation(direction);
      lastArrowDeg.current = target;
      lastTargetBearing.current = null;
      arrowAnim.setValue(target);
      return;
    }

    // Accumulator-based rotation — shortest path, no spinning through 360.
    // Works for both indoor and outdoor since heading is always compass-referenced.
    const current = lastArrowDeg.current;
    let target = relativeArrowDegrees;
    let diff = target - ((current % 360) + (current >= 0 ? 0 : 360));
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    target = current + diff;
    if (target > 3600)  { target -= 3600; lastArrowDeg.current = target; arrowAnim.setValue(target); }
    if (target < -3600) { target += 3600; lastArrowDeg.current = target; arrowAnim.setValue(target); }
    lastArrowDeg.current = target;
    lastTargetBearing.current = targetBearing;
    Animated.timing(arrowAnim, {
      toValue: target,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [targetBearing, heading, relativeArrowDegrees, arrowAnim]);

  const compassRotate = compassAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ["0deg", "360deg"],
  });
  
  const arrowRotate = arrowAnim.interpolate({
    inputRange: [-3600, 3600],
    outputRange: ["-3600deg", "3600deg"],
  });

  if (arrived) {
    return (
      <Animated.View
        style={[
          s.wrap,
          {
            opacity: appearAnim,
            transform: [{ scale: 1 }],
          },
        ]}
      >
        <View style={[s.outerRing, s.outerRingArrived]}>
          <Animated.View
            style={[s.compassLayer, { transform: [{ rotate: compassRotate }] }]}
          >
            <CompassMarks />
          </Animated.View>

          <View style={[s.arrowBubble, s.arrivedBubble]}>
            <Text style={s.arrivedCheck}>✓</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        s.wrap,
        {
          opacity: appearAnim,
          transform: [{ scale: pulseAnim }],
        },
      ]}
    >
      <View style={s.outerRing}>
        <Animated.View
          style={[s.compassLayer, { transform: [{ rotate: compassRotate }] }]}
        >
          <CompassMarks />
        </Animated.View>

        <View style={s.arrowBubble}>
          {mode === "elevator" ? (
            <View style={s.iconWrap}>
              <Text style={s.transportIcon}>🛗</Text>
              <Text style={s.transportLabel}>Elevator</Text>
            </View>
          ) : mode === "stairs" ? (
            <View style={s.iconWrap}>
              <Text style={s.transportIcon}>🪜</Text>
              <Text style={s.transportLabel}>Stairs</Text>
            </View>
          ) : (
            <Animated.View
              style={[
                s.arrowShape,
                {
                  transform: [{ rotate: arrowRotate }],
                },
              ]}
            >
              <View style={s.arrowHead} />
              <View style={s.arrowStem} />
            </Animated.View>
          )}
        </View>

        <View style={s.headingBadge}>
          <Text style={s.headingBadgeText}>{Math.round(normalizedHeading)}°</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function CompassMarks() {
  return (
    <View style={s.compassFace}>
      <View style={[s.tick, s.tickTop]} />
      <View style={[s.tick, s.tickRight]} />
      <View style={[s.tick, s.tickBottom]} />
      <View style={[s.tick, s.tickLeft]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  outerRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  outerRingArrived: {
    backgroundColor: "rgba(24,121,78,0.16)",
  },

  compassLayer: {
    position: "absolute",
    width: 170,
    height: 170,
    alignItems: "center",
    justifyContent: "center",
  },

  compassFace: {
    width: 170,
    height: 170,
    borderRadius: 85,
    alignItems: "center",
    justifyContent: "center",
  },

  tick: {
    position: "absolute",
    backgroundColor: PSU.ringTick,
    borderRadius: 2,
  },
  tickTop: {
    top: 18,
    width: 3,
    height: 14,
  },
  tickRight: {
    right: 18,
    width: 14,
    height: 3,
  },
  tickBottom: {
    bottom: 18,
    width: 3,
    height: 14,
  },
  tickLeft: {
    left: 18,
    width: 14,
    height: 3,
  },

  arrowBubble: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: "rgba(255,255,255,0.97)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: PSU.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },

  arrivedBubble: {
    backgroundColor: "rgba(238,248,241,0.99)",
  },

  arrivedCheck: {
    fontSize: 58,
    fontWeight: "900",
    color: PSU.green,
    lineHeight: 62,
  },

  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  transportIcon: {
    fontSize: 54,
  },
  transportLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "900",
    color: PSU.blueDark,
  },

  arrowShape: {
    alignItems: "center",
    justifyContent: "center",
  },

  arrowHead: {
    width: 0,
    height: 0,
    borderLeftWidth: 24,
    borderRightWidth: 24,
    borderBottomWidth: 38,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: PSU.blue,
    marginBottom: -2,
  },

  arrowStem: {
    width: 18,
    height: 42,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: PSU.blue,
    shadowColor: PSU.blueDark,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },

  headingBadge: {
    position: "absolute",
    bottom: -8,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: PSU.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  headingBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: PSU.blueDark,
  },
});

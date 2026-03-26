import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, Easing } from "react-native";

const PSU = {
  blue: "#0B3D91",
  blueDark: "#082E6F",
  green: "#18794E",
  shadow: "#000000",
};

export default function DirectionArrow({
  direction = "straight",
  arrived = false,
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const appearAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    appearAnim.setValue(0);
    Animated.timing(appearAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [direction, arrived, appearAnim]);

  useEffect(() => {
    if (arrived) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.035,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [arrived, pulseAnim]);

  const rotation =
    direction === "left"
      ? "-45deg"
      : direction === "right"
      ? "45deg"
      : direction === "back"
      ? "180deg"
      : "0deg";

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
        <View style={s.arrowBubble}>
          <View style={[s.arrowShape, { transform: [{ rotate: rotation }] }]}>
            <View style={s.arrowHead} />
            <View style={s.arrowStem} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  outerRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  outerRingArrived: {
    backgroundColor: "rgba(24,121,78,0.16)",
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
});
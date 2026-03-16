// components/layout/TopBar.jsx
import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { PSU, MAX_WIDTH } from "../../constants/psu-theme";

export default function TopBar({ showBack = false, onBack }) {
  return (
    <View style={s.wrapper}>
      <View style={s.inner}>
        <View style={s.logoRow}>
          <Image
            source={require("../../assets/images/psu-logo.png")}
            style={s.logoImage}
            resizeMode="contain"
          />
          <Text style={s.title}>PENN STATE ABINGTON</Text>
        </View>

        {showBack && (
          <Pressable style={s.backBtn} onPress={onBack}>
            <Text style={s.backBtnText}>← Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    backgroundColor: PSU.white,
    borderBottomWidth: 1,
    borderBottomColor: PSU.border,
    alignItems: "center",
  },
  inner: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoImage: { width: 52, height: 52 },
  title: {
    color: PSU.blue,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 1,
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: PSU.badgeBg,
  },
  backBtnText: { color: PSU.blue, fontWeight: "800", fontSize: 13 },
});

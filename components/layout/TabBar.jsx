// components/layout/TabBar.jsx
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { PSU, MAX_WIDTH } from "../../constants/psu-theme";

// activeTab: "search" | "buildings"
export default function TabBar({ activeTab }) {
  return (
    <View style={s.wrapper}>
      <View style={s.inner}>
        <Pressable
          style={[s.tab, activeTab === "search" && s.tabActive]}
          onPress={() => activeTab !== "search" && router.push("/(tabs)/")}
        >
          <View style={s.psuBadge}>
            <Text style={s.psuBadgeText}>PSU</Text>
          </View>
          <Text style={activeTab === "search" ? s.tabLabelActive : s.tabLabel}>
            Search
          </Text>
        </Pressable>

        <Pressable
          style={[s.tab, activeTab === "buildings" && s.tabActive]}
          onPress={() =>
            activeTab !== "buildings" && router.push("/(tabs)/buildings")
          }
        >
          <Text style={s.tabIcon}>🏛️</Text>
          <Text
            style={activeTab === "buildings" ? s.tabLabelActive : s.tabLabel}
          >
            Buildings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrapper: {
    backgroundColor: PSU.white,
    borderTopWidth: 1,
    borderTopColor: PSU.border,
    alignItems: "center",
  },
  inner: {
    width: "100%",
    maxWidth: MAX_WIDTH,
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabActive: { backgroundColor: PSU.light },
  tabIcon: { fontSize: 20 },
  tabLabel: { fontWeight: "700", color: PSU.muted, fontSize: 14 },
  tabLabelActive: { fontWeight: "900", color: PSU.blue, fontSize: 14 },
  psuBadge: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  psuBadgeText: { color: PSU.white, fontWeight: "900", fontSize: 10 },
});

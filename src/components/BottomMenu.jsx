import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Logo from "../assets/psulogo.svg";

const PSU = {
  blue: "#001E44",
  white: "#FFFFFF",
  light: "#F5F7FA",
  border: "#E6ECF2",
  muted: "#5B6776",
  activeBg: "#EAF1FF",
  activeBorder: "#C9D9FF",
};

export const BOTTOM_MENU_HEIGHT = 108;

export default function BottomMenu({ navigation, active = "" }) {
  const insets = useSafeAreaInsets();

  const isSearch = active === "Search";
  const isBuildings = active === "Buildings";
  const isMap = active === "Map";
  const isSchedule = active === "Schedule";

  return (
    <View style={[s.wrap, { paddingBottom: 18 + insets.bottom }]}>
      <Pressable
        style={[s.item, isMap && s.itemActive]}
        onPress={() => {
          if (!isMap) navigation.navigate("MapView");
        }}
      >
        <Text style={[s.icon, isMap && s.activeText]}>🗺️</Text>
        <Text style={[s.label, isMap && s.activeText]}>Map</Text>
      </Pressable>

      <Pressable
        style={[s.item, isSchedule && s.itemActive]}
        onPress={() => {
          if (!isSchedule) navigation.navigate("MySchedule");
        }}
      >
        <Text style={[s.icon, isSchedule && s.activeText]}>📅</Text>
        <Text style={[s.label, isSchedule && s.activeText]}>Schedule</Text>
      </Pressable>

      <Pressable
        style={s.centerItem}
        onPress={() => {
          if (!isSearch) navigation.navigate("Search");
        }}
      >
        <View style={s.logoCircle}>
          <Logo width={42} height={42} />
        </View>
        <Text style={[s.centerLabel, isSearch && s.activeText]}>
          Main Page
        </Text>
      </Pressable>

      <Pressable
        style={[s.item, isBuildings && s.itemActive]}
        onPress={() => {
          if (!isBuildings) navigation.navigate("Buildings");
        }}
      >
        <Text style={[s.icon, isBuildings && s.activeText]}>🏛️</Text>
        <Text style={[s.label, isBuildings && s.activeText]}>
          Buildings
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: PSU.border,
    backgroundColor: PSU.white,
    minHeight: BOTTOM_MENU_HEIGHT,
    zIndex: 100,
    elevation: 20,
  },

  item: {
    width: 72,
    minHeight: 70,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 16,
  },

  itemActive: {
    backgroundColor: PSU.activeBg,
    borderWidth: 1,
    borderColor: PSU.activeBorder,
  },

  icon: {
    fontSize: 22,
    color: PSU.muted,
  },

  label: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: PSU.muted,
    textAlign: "center",
  },

  activeText: {
    color: PSU.blue,
  },

  centerItem: {
    width: 100,
    minHeight: 75,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },

  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PSU.white,
    borderWidth: 2,
    borderColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  centerLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: PSU.muted,
    textAlign: "center",
  },
});

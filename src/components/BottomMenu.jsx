import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
} from "react-native";

const PSU = {
  blue: "#001E44",
  white: "#FFFFFF",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  activeBg: "#EAF1FF",
  activeBorder: "#C9D9FF",
};

export default function BottomMenu({ navigation, active = "" }) {
  const isBuildings = active === "Buildings";
  const isMap = active === "Map";

  return (
    <View style={s.wrap}>
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
        style={s.logoWrap}
        onPress={() => navigation.navigate("Search")}
      >
        <Image
          source={require("../assets/psu-logo.png")}
          style={s.logo}
          resizeMode="contain"
        />
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: PSU.border,
    backgroundColor: PSU.white,
    minHeight: 108,
  },

  item: {
    width: 84,
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
  },
  activeText: {
    color: PSU.blue,
  },

  logoWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: PSU.white,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -28,
    borderWidth: 4,
    borderColor: PSU.light,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },

  logo: {
    width: 52,
    height: 52,
  },
});
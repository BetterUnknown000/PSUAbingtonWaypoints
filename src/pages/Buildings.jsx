import React, { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAllBuildings } from "../utils/findRoom";
import campusData from "../data/campusData.json";
import BottomMenu, { BOTTOM_MENU_HEIGHT } from "../components/BottomMenu";


const PSU = {
  blue: "#001E44",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

const IMAGE_BY_BUILDING_ID = {
  sutherland:
    "https://upload.wikimedia.org/wikipedia/commons/3/3b/Sutherland_Building%2C_Penn_State_Abington_02.JPG",
  woodland:
    "https://upload.wikimedia.org/wikipedia/commons/5/59/Woodland_Building%2C_Penn_State_Abington_01.JPG",
  lares:
    "https://upload.wikimedia.org/wikipedia/commons/d/d5/Lares_Union_Building%2C_Penn_State_Abington_03.JPG",
  rydal:
    "https://upload.wikimedia.org/wikipedia/commons/e/e0/Rydal_Building%2C_Penn_State_Abington_01.JPG",
  springhouse:
    "https://upload.wikimedia.org/wikipedia/commons/f/fa/Springhouse%2C_Penn_State_Abington_02.JPG",
};

function getImage(id) {
  return (
    IMAGE_BY_BUILDING_ID[id] ||
    "https://upload.wikimedia.org/wikipedia/commons/3/37/Athletic_Building%2C_Penn_State_Abington.JPG"
  );
}

function countEntrancesForBuilding(buildingId) {
  const bid = String(buildingId || "").toLowerCase();
  const waypoints = Array.isArray(campusData?.waypoints) ? campusData.waypoints : [];

  return waypoints.filter(
    (w) =>
      String(w.building || "").toLowerCase() === bid &&
      String(w.type || "").toLowerCase() === "entrance"
  ).length;
}

function countRoomsForBuilding(buildingId) {
  const bid = String(buildingId || "").toLowerCase();
  const rooms = Array.isArray(campusData?.rooms) ? campusData.rooms : [];
  return rooms.filter((r) => String(r.building || "").toLowerCase() === bid).length;
}

export default function Buildings({ navigation }) {
  const buildings = useMemo(() => getAllBuildings(), []);
  const insets = useSafeAreaInsets();

  return (
      <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.page}>
        <View style={s.header}>
          <Text style={s.title}>Campus Buildings</Text>
          <Text style={s.subtitle}>
            Browse buildings and open detailed information.
          </Text>
        </View>

        <FlatList
          data={buildings}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{
            gap: 14,
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: BOTTOM_MENU_HEIGHT + insets.bottom + 30,
          }}
          renderItem={({ item }) => {
            const entranceCount = countEntrancesForBuilding(item.id);
            const roomCount = countRoomsForBuilding(item.id);

            return (
              <Pressable
                style={s.card}
                onPress={() =>
                  navigation.navigate("BuildingDetail", {
                    buildingId: item.id,
                  })
                }
              >
                <Image source={{ uri: getImage(item.id) }} style={s.image} />

                <View style={s.info}>
                  <Text style={s.name} numberOfLines={2}>
                    {item.name}
                  </Text>

                  <Text style={s.meta}>
                    Floors: {Array.isArray(item.floors) ? item.floors.length : "N/A"}
                  </Text>

                  <Text style={s.meta}>Entrances: {entranceCount || "N/A"}</Text>
                  <Text style={s.meta}>Rooms: {roomCount || "N/A"}</Text>
                </View>
              </Pressable>
            );
          }}
        />

        <BottomMenu navigation={navigation} active="Buildings" />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  page: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  header: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: "900",
    color: PSU.text,
  },
  subtitle: {
    marginTop: 8,
    color: PSU.muted,
    lineHeight: 20,
  },

  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: PSU.white,
  },
  image: {
    width: "100%",
    height: 120,
  },
  info: {
    padding: 12,
  },
  name: {
    fontSize: 15,
    fontWeight: "900",
    color: PSU.text,
    minHeight: 38,
  },
  meta: {
    marginTop: 4,
    fontSize: 12,
    color: PSU.muted,
    fontWeight: "600",
  },
});

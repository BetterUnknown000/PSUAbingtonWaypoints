import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  SafeAreaView,
} from "react-native";
import campusData from "../data/campusData.json";
import { findRoomsByBuilding } from "../utils/findRoom";
import BottomMenu from "../components/BottomMenu";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
};

const BUILDING_DESCRIPTIONS = {
  sutherland:
    "A historic building designed by Julian Abele, featuring classrooms, academic advising, a tutoring center, and a lecture hall in a converted indoor swimming pool.",
  lares: "Houses the cafeteria, bookstore, and Student Affairs.",
  lionsgate:
    "Opened in 2017, this is the main residential facility, offering 400 beds in apartment-style units.",
  woodland: "A central campus building with offices and academic space.",
  springhouse:
    "Contains classrooms and the Collegiate Recovery Program.",
  rydal: "Used for classrooms and campus security.",
  athletic: "Features facilities for campus recreation and teams.",
};

export default function BuildingDetail({ route, navigation }) {
  const { buildingId } = route.params || {};

  const building = useMemo(() => {
    const all = Array.isArray(campusData?.buildings) ? campusData.buildings : [];
    return (
      all.find(
        (b) =>
          String(b.id).toLowerCase() === String(buildingId || "").toLowerCase()
      ) || null
    );
  }, [buildingId]);

  const rooms = useMemo(() => findRoomsByBuilding(buildingId), [buildingId]);

  const description =
    BUILDING_DESCRIPTIONS[String(buildingId || "").toLowerCase()] ||
    "Information coming soon.";

  if (!building) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.page}>
          <View style={s.contentOnly}>
            <Text style={s.title}>Building not found</Text>
            <Text style={s.sub}>No data for: {String(buildingId)}</Text>
          </View>
          <BottomMenu navigation={navigation} active="Buildings" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.page}>
        <ScrollView
          style={s.content}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text style={s.title}>{building.name}</Text>
          <Text style={s.sub}>ID: {building.id}</Text>

          <View style={s.section}>
            <Text style={s.sectionTitle}>About This Building</Text>
            <Text style={s.row}>{description}</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Location</Text>
            <Text style={s.row}>Latitude: {building.latitude ?? "N/A"}</Text>
            <Text style={s.row}>Longitude: {building.longitude ?? "N/A"}</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Floors</Text>
            {Array.isArray(building.floors) && building.floors.length > 0 ? (
              building.floors.map((f) => (
                <Text key={String(f)} style={s.bullet}>
                  • Floor {String(f)}
                </Text>
              ))
            ) : (
              <Text style={s.row}>N/A</Text>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Entrances (Waypoints)</Text>
            {Array.isArray(building.entrances) && building.entrances.length > 0 ? (
              building.entrances.map((e) => (
                <Text key={String(e)} style={s.bullet}>
                  • {String(e)}
                </Text>
              ))
            ) : (
              <Text style={s.row}>N/A</Text>
            )}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Room Count</Text>
            <Text style={s.row}>{rooms.length} rooms found in dataset.</Text>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Quick Navigation</Text>
            <Text style={s.row}>
              Search for a specific room from the main page, then start navigation.
            </Text>

            <Pressable
              style={s.btn}
              onPress={() => navigation.navigate("Search")}
            >
              <Text style={s.btnText}>Go to Search</Text>
            </Pressable>
          </View>
        </ScrollView>

        <BottomMenu navigation={navigation} active="Buildings" />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  page: { flex: 1, backgroundColor: PSU.light },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  contentOnly: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  title: { fontSize: 28, fontWeight: "900", color: PSU.text },
  sub: { marginTop: 6, color: PSU.muted },

  section: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: PSU.white,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: PSU.text },
  row: { marginTop: 8, color: "#334155", lineHeight: 20 },
  bullet: { marginTop: 8, color: "#334155" },

  btn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: PSU.white,
    fontWeight: "900",
  },
});
// pages/BuildingDetail.jsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";

import { PSU, MAX_WIDTH } from "../constants/psu-theme";
import TopBar from "../components/layout/TopBar";
import TabBar from "../components/layout/TabBar";
import campusData from "../data/campusData.json";

const BUILDING_IMAGES = {
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
  athletic:
    "https://upload.wikimedia.org/wikipedia/commons/3/37/Athletic_Building%2C_Penn_State_Abington.JPG",
};

const BUILDING_DESCRIPTIONS = {
  sutherland:
    "A historic building designed by Julian Abele, featuring classrooms, academic advising, a tutoring center, and a lecture hall in a converted indoor swimming pool.",
  lares: "Houses the cafeteria, bookstore, and Student Affairs.",
  lionsgate:
    "Opened in 2017, this is the main residential facility, offering 400 beds in apartment-style units.",
  woodland: "A central campus building with offices and academic space.",
  springhouse: "Contains classrooms and the Collegiate Recovery Program.",
  rydal: "Used for classrooms and campus security.",
  athletic: "Features facilities for campus recreation and teams.",
};

function countEntrancesForBuilding(buildingId) {
  const bid = String(buildingId || "").toLowerCase();
  const waypoints = Array.isArray(campusData?.waypoints)
    ? campusData.waypoints
    : [];
  return waypoints.filter(
    (w) =>
      String(w.building || "").toLowerCase() === bid &&
      String(w.type || "").toLowerCase() === "entrance",
  ).length;
}

function countRoomsForBuilding(buildingId) {
  const bid = String(buildingId || "").toLowerCase();
  const rooms = Array.isArray(campusData?.rooms) ? campusData.rooms : [];
  return rooms.filter((r) => String(r.building || "").toLowerCase() === bid)
    .length;
}

export default function BuildingDetail({ route }) {
  const { buildingId } = route?.params || {};

  const building = useMemo(() => {
    const all = Array.isArray(campusData?.buildings)
      ? campusData.buildings
      : [];
    return (
      all.find(
        (b) =>
          String(b.id).toLowerCase() === String(buildingId || "").toLowerCase(),
      ) || null
    );
  }, [buildingId]);

  const description =
    BUILDING_DESCRIPTIONS[String(buildingId || "").toLowerCase()] ||
    "Information coming soon.";
  const imageUri =
    BUILDING_IMAGES[String(buildingId || "").toLowerCase()] ||
    BUILDING_IMAGES.athletic;
  const floorCount = Array.isArray(building?.floors)
    ? building.floors.length
    : 0;
  const entranceCount = countEntrancesForBuilding(buildingId);
  const roomCount = countRoomsForBuilding(buildingId);

  if (!building) {
    return (
      <SafeAreaView style={s.safe}>
        <TopBar showBack onBack={() => router.back()} />
        <View style={s.notFound}>
          <Text style={s.heading}>Building not found</Text>
          <Text style={s.metaText}>No data for: {String(buildingId)}</Text>
        </View>
        <TabBar activeTab="buildings" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <TopBar showBack onBack={() => router.back()} />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <View style={s.content}>
          <Text style={s.heading}>{building.name}</Text>

          <View style={s.card}>
            <Image source={{ uri: imageUri }} style={s.image} />

            <View style={s.cardBody}>
              <Text style={s.sectionTitle}>Overview</Text>
              <Text style={s.description}>{description}</Text>

              <View style={s.pillRow}>
                <View style={s.pill}>
                  <Text style={s.pillText}>Floors: {floorCount}</Text>
                </View>
                <View style={s.pill}>
                  <Text style={s.pillText}>Entrances: {entranceCount}</Text>
                </View>
                <View style={s.pill}>
                  <Text style={s.pillText}>Rooms: {roomCount}</Text>
                </View>
              </View>

              <Text style={s.sectionTitle}>Location</Text>
              <Text style={s.metaText}>
                Latitude: {building.latitude ?? "N/A"} • Longitude:{" "}
                {building.longitude ?? "N/A"}
              </Text>

              <Text style={s.sectionTitle}>Floors</Text>
              {Array.isArray(building.floors) && building.floors.length > 0 ? (
                building.floors.map((f) => (
                  <Text key={String(f)} style={s.metaText}>
                    {String(f)}
                  </Text>
                ))
              ) : (
                <Text style={s.metaText}>N/A</Text>
              )}

              <Text style={s.sectionTitle}>Entrances</Text>
              {Array.isArray(building.entrances) &&
              building.entrances.length > 0 ? (
                building.entrances.map((e) => (
                  <Text key={String(e)} style={s.metaText}>
                    {String(e)}
                  </Text>
                ))
              ) : (
                <Text style={s.metaText}>N/A</Text>
              )}

              <Text style={[s.sectionTitle, { color: PSU.muted }]}>
                What's next
              </Text>
              <Text style={s.metaText}>
                Floor selection + navigation will be added later.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <TabBar activeTab="buildings" />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  scroll: { flex: 1 },
  scrollContent: { alignItems: "center", paddingBottom: 24 },
  content: { width: "100%", maxWidth: MAX_WIDTH, padding: 16 },

  heading: {
    fontSize: 32,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 16,
    lineHeight: 38,
  },

  card: {
    backgroundColor: PSU.white,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  image: { width: "100%", height: 200 },
  cardBody: { padding: 16, paddingBottom: 20 },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
    marginTop: 16,
  },
  description: { color: PSU.muted, fontSize: 15, lineHeight: 22, marginTop: 6 },

  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
  },
  pillText: { fontWeight: "800", color: PSU.blue, fontSize: 13 },

  metaText: { color: PSU.muted, fontSize: 14, marginTop: 6 },
  notFound: { flex: 1, padding: 20 },
});

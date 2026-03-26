import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import BottomMenu from "../components/BottomMenu";
import campusData from "../data/campusData.json";
import { countRoomsInBuilding } from "../utils/findRoom";

const BUILDING_DETAILS = {
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

// Map building IDs to their bundled image assets.
// Add entries here as you add images to your project.
const BUILDING_IMAGES = {
  sutherland: require("../assets/images/buildings/sutherland.jpg"),
  lares: require("../assets/images/buildings/lares.jpg"),
//lionsgate: require("../assets/images/buildings/lionsgate.jpg"),
  woodland: require("../assets/images/buildings/woodland.jpg"),
  springhouse: require("../assets/images/buildings/springhouse.jpg"),
  rydal: require("../assets/images/buildings/rydal.jpg"),
  athletic: require("../assets/images/buildings/athletic.jpg"),
};

export default function BuildingDetail() {
  const navigation = useNavigation();
  const route = useRoute();
  const { buildingId } = route.params || {};

  const building = useMemo(() => {
    const bid = String(buildingId || "").toLowerCase();
    return (
      (campusData.buildings || []).find(
        (b) => String(b.id).toLowerCase() === bid
      ) || null
    );
  }, [buildingId]);

  const roomsCount = building ? countRoomsInBuilding(building.id) : 0;

  if (!building) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Building not found</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate("Buildings")}
          >
            <Text style={styles.primaryBtnText}>Back to Buildings</Text>
          </TouchableOpacity>
        </View>
        <BottomMenu />
      </SafeAreaView>
    );
  }

  const floors = building.floors || [];
  const entrances = building.entrances || [];
  const imageSource = BUILDING_IMAGES[building.id];

  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <View style={styles.psuBadge}>
              <Text style={styles.psuBadgeText}>PSU</Text>
            </View>
            <Text style={styles.brand}>PENN STATE ABINGTON</Text>
          </View>
          <TouchableOpacity
            style={styles.backPill}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backPillText}>← Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{building.name}</Text>

        {/* Main panel */}
        <View style={styles.panel}>
          {imageSource && (
            <Image
              source={imageSource}
              style={styles.buildingImage}
              resizeMode="cover"
            />
          )}

          <Text style={styles.panelTitle}>Overview</Text>
          <Text style={styles.cardSub}>
            {BUILDING_DETAILS[building.id] ||
              "Building details will be expanded later."}
          </Text>

          {/* Stat pills */}
          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Floors: {floors.length}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Entrances: {entrances.length}</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>Rooms: {roomsCount}</Text>
            </View>
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.panelTitle}>Location</Text>
            <Text style={styles.meta}>
              Latitude: {building.latitude} • Longitude: {building.longitude}
            </Text>
          </View>

          {/* Floors */}
          <View style={styles.section}>
            <Text style={styles.panelTitle}>Floors</Text>
            <Text style={styles.meta}>
              {floors.length ? floors.join(", ") : "No floor data yet."}
            </Text>
          </View>

          {/* Entrances */}
          <View style={styles.section}>
            <Text style={styles.panelTitle}>Entrances</Text>
            <Text style={styles.meta}>
              {entrances.length
                ? entrances.join(", ")
                : "No entrance data yet."}
            </Text>
          </View>

          {/* What's next */}
          <View style={styles.section}>
            <Text style={styles.panelTitle}>What's next</Text>
            <Text style={styles.meta}>
              Later we can add floor SVGs, indoor navigation, and QR anchor
              scanning.
            </Text>
          </View>
        </View>
      </ScrollView>

      <BottomMenu />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 4,
  },
  brandLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  psuBadge: {
    backgroundColor: "#1e407c",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  psuBadgeText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  brand: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e407c",
    letterSpacing: 0.5,
  },
  backPill: {
    backgroundColor: "#eef2f8",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  backPillText: {
    fontSize: 13,
    color: "#1e407c",
    fontWeight: "600",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111",
    marginTop: 8,
    marginBottom: 14,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  buildingImage: {
    width: "100%",
    height: 180,
    borderRadius: 10,
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
    marginTop: 4,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  pill: {
    backgroundColor: "#eef2f8",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    color: "#1e407c",
    fontWeight: "600",
  },
  section: {
    marginTop: 14,
  },
  meta: {
    fontSize: 13,
    color: "#555",
    lineHeight: 19,
  },
  primaryBtn: {
    backgroundColor: "#1e407c",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});

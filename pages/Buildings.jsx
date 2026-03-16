// pages/Buildings.jsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";

import { PSU, MAX_WIDTH } from "../constants/psu-theme";
import TopBar from "../components/layout/TopBar";
import TabBar from "../components/layout/TabBar";
import { getAllBuildings } from "../utils/findRoom";
import campusData from "../data/campusData.json";

function getInitials(name) {
  const words = String(name || "").split(" ");
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(name || "")
    .slice(0, 2)
    .toUpperCase();
}

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

function hasGPS(building) {
  return building.latitude != null && building.longitude != null;
}

function BuildingCard({ item }) {
  const floorCount = Array.isArray(item.floors) ? item.floors.length : 0;
  const entranceCount = countEntrancesForBuilding(item.id);
  const roomCount = countRoomsForBuilding(item.id);
  const gps = hasGPS(item);
  const initials = getInitials(item.name);

  return (
    <View style={s.card}>
      <View style={s.cardTopRow}>
        <View style={s.initialsCircle}>
          <Text style={s.initialsText}>{initials}</Text>
        </View>
        <Pressable
          style={s.infoBtn}
          onPress={() => router.push(`/building/${item.id}`)}
        >
          <Text style={s.infoBtnText}>Info</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push(`/building/${item.id}`)}>
        <Text style={s.cardName}>{item.name}</Text>
      </Pressable>

      <View style={s.statsGrid}>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Floors:</Text>
          <Text style={s.statValue}>{floorCount || "N/A"}</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Entrances:</Text>
          <Text style={s.statValue}>{entranceCount || "N/A"}</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statLabel}>Rooms:</Text>
          <Text style={s.statValue}>{roomCount || "N/A"}</Text>
        </View>
        <View style={s.statCell}>
          <Text style={s.statLabel}>GPS:</Text>
          <Text style={[s.statValue, gps ? s.gpsYes : s.gpsNo]}>
            {gps ? "Yes" : "No"}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function Buildings() {
  const buildings = useMemo(() => getAllBuildings(), []);

  const rows = [];
  for (let i = 0; i < buildings.length; i += 2) {
    rows.push([buildings[i], buildings[i + 1] || null]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <TopBar />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <View style={s.content}>
          <Text style={s.heading}>Campus{"\n"}Buildings</Text>

          <View style={s.listCard}>
            <Text style={s.listCardTitle}>Tap a building</Text>

            {rows.map((pair, rowIndex) => (
              <View key={rowIndex} style={s.row}>
                <BuildingCard item={pair[0]} />
                {pair[1] ? (
                  <BuildingCard item={pair[1]} />
                ) : (
                  <View style={s.cardEmpty} />
                )}
              </View>
            ))}
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
  scrollContent: { alignItems: "center", paddingBottom: 32 },
  content: { width: "100%", maxWidth: MAX_WIDTH, padding: 16 },

  heading: {
    fontSize: 36,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 16,
    lineHeight: 42,
  },

  listCard: {
    backgroundColor: PSU.white,
    borderRadius: 20,
    padding: 16,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: PSU.text,
    marginBottom: 14,
  },

  row: { flexDirection: "row", gap: 12, marginBottom: 12 },

  card: {
    flex: 1,
    backgroundColor: PSU.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: PSU.border,
  },
  cardEmpty: { flex: 1 },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  initialsCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PSU.badgeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: { fontWeight: "900", color: PSU.blue, fontSize: 15 },
  infoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: PSU.badgeBg,
  },
  infoBtnText: { fontSize: 12, fontWeight: "800", color: PSU.muted },

  cardName: {
    fontSize: 15,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 10,
    lineHeight: 20,
  },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  statCell: { width: "48%", marginBottom: 4 },
  statLabel: { fontSize: 12, color: PSU.muted },
  statValue: { fontSize: 13, fontWeight: "800", color: PSU.text },
  gpsYes: { color: PSU.blue },
  gpsNo: { color: "#e53e3e" },
});

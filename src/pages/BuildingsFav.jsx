import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import BottomMenu from "../components/BottomMenu";
import { getAllBuildings, countRoomsInBuilding } from "../utils/findRoom";

export default function Buildings() {
  const navigation = useNavigation();
  const buildings = useMemo(() => getAllBuildings(), []);

  const renderItem = ({ item: b }) => {
    const roomsCount = countRoomsInBuilding(b.id);
    const floorsCount = (b.floors || []).length;
    const entrancesCount = (b.entrances || []).length;
    const initials = b.name.split(" ")[0].slice(0, 2).toUpperCase();

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate("BuildingDetail", { buildingId: b.id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardTop}>
          <View style={styles.thumb}>
            <Text style={styles.thumbText}>{initials}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>Info</Text>
          </View>
        </View>

        <Text style={styles.cardTitle}>{b.name}</Text>

        <View style={styles.kv}>
          <Text style={styles.kvText}>
            Floors: <Text style={styles.kvBold}>{floorsCount}</Text>
          </Text>
          <Text style={styles.kvText}>
            Entrances: <Text style={styles.kvBold}>{entrancesCount}</Text>
          </Text>
          <Text style={styles.kvText}>
            Rooms: <Text style={styles.kvBold}>{roomsCount}</Text>
          </Text>
          <Text style={styles.kvText}>
            GPS: <Text style={styles.kvBold}>Yes</Text>
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.page}>
      <FlatList
        data={buildings}
        keyExtractor={(b) => b.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={
          <>
            <View style={styles.brandRow}>
              <View style={styles.psuBadge}>
                <Text style={styles.psuBadgeText}>PSU</Text>
              </View>
              <Text style={styles.brand}>PENN STATE ABINGTON</Text>
            </View>

            <Text style={styles.title}>Campus{"\n"}Buildings</Text>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Tap a building</Text>
            </View>
          </>
        }
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
      />
      <BottomMenu />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 80,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
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
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111",
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 36,
  },
  panel: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    width: "48%",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  thumb: {
    backgroundColor: "#1e407c",
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  thumbText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  pill: {
    backgroundColor: "#eef2f8",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 11,
    color: "#1e407c",
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  kv: {
    gap: 2,
  },
  kvText: {
    fontSize: 12,
    color: "#555",
  },
  kvBold: {
    fontWeight: "700",
    color: "#111",
  },
});

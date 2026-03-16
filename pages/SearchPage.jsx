// pages/SearchPage.jsx
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

import { PSU, MAX_WIDTH } from "../constants/psu-theme";
import TopBar from "../components/layout/TopBar";
import TabBar from "../components/layout/TabBar";
import { findRoom, getAllBuildings } from "../utils/findRoom";

export default function SearchPage() {
  const buildings = useMemo(() => getAllBuildings(), []);
  const [selectedBuildingId, setSelectedBuildingId] = useState(
    buildings[0]?.id || "",
  );
  const [roomNumber, setRoomNumber] = useState("");
  const [courseName, setCourseName] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId],
  );

  const searchRoom = () => {
    setStatus("");
    setResult(null);
    if (!selectedBuildingId) {
      setStatus("Please select a building.");
      return;
    }
    const r = String(roomNumber || "").trim();
    if (!r) {
      setStatus("Please enter a room number.");
      return;
    }
    const found = findRoom(selectedBuildingId, r);
    if (!found) {
      setStatus(
        `No results for room ${r} in ${selectedBuilding?.name || selectedBuildingId}.`,
      );
      return;
    }
    setResult(found);
  };

  const findCourse = () => {
    Alert.alert("Coming Soon", "Course search will be implemented later.");
  };

  return (
    <SafeAreaView style={s.safe}>
      <TopBar />

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        <View style={s.content}>
          <Text style={s.heading}>Where are you{"\n"}heading today?</Text>

          <View style={s.card}>
            <Text style={s.cardTitle}>Search Classroom</Text>

            <Text style={s.label}>Building</Text>
            <View style={s.pickerWrapper}>
              <Picker
                selectedValue={selectedBuildingId}
                onValueChange={(val) => setSelectedBuildingId(val)}
                style={s.picker}
              >
                {buildings.map((b) => (
                  <Picker.Item key={b.id} label={b.name} value={b.id} />
                ))}
              </Picker>
            </View>

            <Text style={s.label}>Room number</Text>
            <TextInput
              style={s.input}
              value={roomNumber}
              onChangeText={setRoomNumber}
              placeholder="e.g. 218, 132B, G04"
              placeholderTextColor="#94a3b8"
            />

            <Pressable style={s.btn} onPress={searchRoom}>
              <Text style={s.btnText}>Search Room</Text>
            </Pressable>

            {status ? <Text style={s.status}>{status}</Text> : null}
            {result && <ResultCard result={result} />}

            <Text style={s.orTitle}>Or Search by Course</Text>

            <Text style={s.label}>Course name</Text>
            <TextInput
              style={s.input}
              value={courseName}
              onChangeText={setCourseName}
              placeholder="e.g. CMPSC 445"
              placeholderTextColor="#94a3b8"
            />

            <Pressable style={s.btn} onPress={findCourse}>
              <Text style={s.btnText}>Find Course</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <TabBar activeTab="search" />
    </SafeAreaView>
  );
}

function ResultCard({ result }) {
  const { room, building } = result;
  return (
    <View style={s.resultCard}>
      <Text style={s.resultRoom}>
        {(building?.name || room.building) + " " + room.room_number}
      </Text>
      <Text style={s.resultMeta}>
        {room.room_name || "Room"} • Floor {room.floor} • {room.type}
      </Text>
      {room.capacity ? (
        <Text style={s.resultMeta}>Capacity: {room.capacity}</Text>
      ) : null}
      <Pressable
        style={s.goBtn}
        onPress={() =>
          Alert.alert(
            "Navigate (Placeholder)",
            `Will navigate to ${building?.name || room.building} ${room.room_number}`,
          )
        }
      >
        <Text style={s.goBtnText}>Go →</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  scroll: { flex: 1 },
  scrollContent: { alignItems: "center", paddingBottom: 24 },
  content: { width: "100%", maxWidth: MAX_WIDTH, padding: 16 },

  heading: {
    fontSize: 36,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 20,
    lineHeight: 42,
  },

  card: {
    backgroundColor: PSU.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 14,
  },

  label: {
    fontSize: 14,
    fontWeight: "800",
    color: PSU.text,
    marginBottom: 6,
    marginTop: 12,
  },

  pickerWrapper: {
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 12,
    backgroundColor: PSU.white,
    overflow: "hidden",
  },
  picker: { height: 48, color: PSU.text },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    color: PSU.text,
    backgroundColor: PSU.white,
    fontSize: 15,
  },

  btn: {
    marginTop: 14,
    backgroundColor: PSU.blue2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: PSU.white, fontWeight: "900", fontSize: 15 },

  status: { marginTop: 10, color: "#e53e3e", fontSize: 13 },

  orTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: PSU.text,
    marginTop: 24,
    marginBottom: 4,
  },

  resultCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.light,
  },
  resultRoom: { fontWeight: "900", fontSize: 15, color: PSU.text },
  resultMeta: { color: PSU.muted, marginTop: 4, fontSize: 13 },
  goBtn: {
    marginTop: 10,
    backgroundColor: PSU.blue2,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  goBtnText: { color: PSU.white, fontWeight: "900" },
});

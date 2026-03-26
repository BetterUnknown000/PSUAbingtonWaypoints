import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Modal,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

import { findRoom, getAllBuildings } from "../utils/findRoom";
import { findCourse } from "../utils/findCourse";
import BottomMenu from "../components/BottomMenu";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  white: "#FFFFFF",
  successBg: "#EEF8F1",
  successBorder: "#B7DEC1",
};

function getCourseLocation(course) {
  const building =
    course?.building ||
    course?.buildingId ||
    course?.building_id ||
    course?.location_building ||
    "";

  const roomNumber =
    course?.room_number ||
    course?.room ||
    course?.classroom ||
    course?.location_room ||
    "";

  return {
    building: String(building || "").trim(),
    roomNumber: String(roomNumber || "").trim(),
  };
}

function isOnlineCourse(course) {
  const mode =
    String(
      course?.mode ||
        course?.delivery_mode ||
        course?.instruction_mode ||
        course?.location ||
        ""
    )
      .trim()
      .toLowerCase();

  const room =
    String(course?.room || course?.room_number || course?.classroom || "")
      .trim()
      .toLowerCase();

  const building =
    String(course?.building || course?.buildingId || course?.building_id || "")
      .trim()
      .toLowerCase();

  return (
    mode.includes("online") ||
    mode.includes("remote") ||
    room === "online" ||
    building === "online"
  );
}

function getCourseLabel(course) {
  const code =
    course?.course_code ||
    course?.course ||
    course?.code ||
    course?.id ||
    "Unknown Course";

  const title =
    course?.course_name ||
    course?.title ||
    course?.name ||
    course?.course_title ||
    "";

  return title ? `${code} — ${title}` : String(code);
}

export default function SearchPage({ navigation }) {
  const buildings = useMemo(() => getAllBuildings(), []);

  const [searchMode, setSearchMode] = useState("room");

  const [selectedBuildingId, setSelectedBuildingId] = useState(
    buildings[0]?.id || ""
  );
  const [roomNumber, setRoomNumber] = useState("");
  const [courseQuery, setCourseQuery] = useState("");

  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

  const [buildingModalOpen, setBuildingModalOpen] = useState(false);
  const [pendingBuildingId, setPendingBuildingId] = useState(
    buildings[0]?.id || ""
  );

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) || null,
    [buildings, selectedBuildingId]
  );

  const openBuildingPicker = () => {
    setPendingBuildingId(selectedBuildingId || buildings[0]?.id || "");
    setBuildingModalOpen(true);
  };

  const confirmBuildingPicker = () => {
    setSelectedBuildingId(pendingBuildingId);
    setBuildingModalOpen(false);
  };

  const resetFeedback = () => {
    setStatus("");
    setResult(null);
  };

  const searchByRoom = () => {
    resetFeedback();

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
        `No results for room ${r} in ${selectedBuilding?.name || selectedBuildingId}.`
      );
      return;
    }

    setResult({
      ...found,
      searchType: "room",
    });
    setStatus("Room found.");
  };

  const searchByCourse = () => {
    resetFeedback();

    const query = String(courseQuery || "").trim();

    if (!query) {
       setStatus("Please enter a course.");
       return;
    }

    const courseResult = findCourse(query);

    if (courseResult.status === "not_found") {
      setStatus("Course not found.");
      return;
    }

    if (courseResult.status === "no_classroom") {
      setStatus("Course found, but its classroom was not found in campus data.");
      return;
    }

    setResult({
      ...courseResult.roomResult,
      searchType: "course",
      course: courseResult.course,
    });

    setStatus("Course classroom found.");
  };

  const runSearch = () => {
    if (searchMode === "course") {
      searchByCourse();
    } else {
      searchByRoom();
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.page}>
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>PENN STATE ABINGTON</Text>
            <Text style={s.title}>Where are you{"\n"}heading today?</Text>
            <Text style={s.subtitle}>
              Search by room number or type a course to find its classroom.
            </Text>
          </View>

          <View style={s.panel}>
            <Text style={s.panelTitle}>Search Classroom</Text>

            <View style={s.modeRow}>
              <Pressable
                style={[s.modeBtn, searchMode === "room" && s.modeBtnActive]}
                onPress={() => {
                  setSearchMode("room");
                  resetFeedback();
                }}
              >
                <Text
                  style={[
                    s.modeBtnText,
                    searchMode === "room" && s.modeBtnTextActive,
                  ]}
                >
                  By Room
                </Text>
              </Pressable>

              <Pressable
                style={[s.modeBtn, searchMode === "course" && s.modeBtnActive]}
                onPress={() => {
                  setSearchMode("course");
                  resetFeedback();
                }}
              >
                <Text
                  style={[
                    s.modeBtnText,
                    searchMode === "course" && s.modeBtnTextActive,
                  ]}
                >
                  By Course
                </Text>
              </Pressable>
            </View>

            {searchMode === "room" ? (
              <>
                <Text style={s.label}>Building</Text>
                <Pressable style={s.dropdownField} onPress={openBuildingPicker}>
                  <Text style={s.dropdownValue}>
                    {selectedBuilding?.name || "Select building"}
                  </Text>
                  <Text style={s.dropdownChevron}>▾</Text>
                </Pressable>

                <Modal
                  visible={buildingModalOpen}
                  transparent
                  animationType="slide"
                  onRequestClose={() => setBuildingModalOpen(false)}
                >
                  <View style={s.modalBackdrop}>
                    <View style={s.modalSheet}>
                      <View style={s.modalHeader}>
                        <Pressable onPress={() => setBuildingModalOpen(false)}>
                          <Text style={s.modalCancel}>Cancel</Text>
                        </Pressable>

                        <Text style={s.modalTitle}>Select Building</Text>

                        <Pressable onPress={confirmBuildingPicker}>
                          <Text style={s.modalDone}>Done</Text>
                        </Pressable>
                      </View>

                      <Picker
                        selectedValue={pendingBuildingId}
                        onValueChange={(val) => setPendingBuildingId(val)}
                        style={s.pickerIOS}
                        itemStyle={s.pickerItemIOS}
                      >
                        {buildings.map((b) => (
                          <Picker.Item
                            key={b.id}
                            label={b.name}
                            value={b.id}
                            color={PSU.text}
                          />
                        ))}
                      </Picker>
                    </View>
                  </View>
                </Modal>

                <Text style={s.label}>Room number</Text>
                <TextInput
                  style={s.input}
                  value={roomNumber}
                  onChangeText={setRoomNumber}
                  placeholder="e.g. 218, 132B, G04"
                  placeholderTextColor="#8B97A7"
                  autoCapitalize="characters"
                />
              </>
            ) : (
              <>
                <Text style={s.label}>Course</Text>
                <TextInput
                  style={s.input}
                  value={courseQuery}
                  onChangeText={setCourseQuery}
                  placeholder="e.g. CMPSC 487W"
                  placeholderTextColor="#8B97A7"
                  autoCapitalize="characters"
                />

                <View style={s.courseHintBox}>
                  <Text style={s.courseHintText}>
                    Enter the course manually. If the course is not found or is online,
                    the app will let you know.
                  </Text>
                </View>
              </>
            )}

            <Pressable style={s.searchBtn} onPress={runSearch}>
              <Text style={s.searchBtnText}>
                {searchMode === "course" ? "Find Course Classroom" : "Search"}
              </Text>
            </Pressable>

            {status ? (
              <Text
                style={[
                  s.status,
                  status === "Room found." || status === "Course classroom found."
                    ? s.statusSuccess
                    : s.statusError,
                ]}
              >
                {status}
              </Text>
            ) : null}

            {result ? (
              <ResultCard result={result} navigation={navigation} />
            ) : null}
          </View>
        </ScrollView>

        <BottomMenu navigation={navigation} />
      </View>
    </SafeAreaView>
  );
}

function ResultCard({ result, navigation }) {
  const { room, building, waypoint, course } = result;

  return (
    <View style={s.resultCard}>
      <View style={s.resultHeaderRow}>
        <View style={{ flex: 1 }}>
          {course ? (
            <Text style={s.resultSearchLabel}>{getCourseLabel(course)}</Text>
          ) : null}

          <Text style={s.resultRoom}>
            {(building?.name || room.building) + " " + room.room_number}
          </Text>

          <Text style={s.resultMeta}>
            {room.room_name || "Room"} • Floor {room.floor} • {room.type}
          </Text>

          {room.capacity ? (
            <Text style={s.resultMeta2}>Capacity: {room.capacity}</Text>
          ) : null}

          {waypoint?.label ? (
            <Text style={s.resultMeta2}>Waypoint: {waypoint.label}</Text>
          ) : null}
        </View>

        <Pressable
          style={s.goBtn}
          onPress={() =>
            navigation.navigate("Navigation", {
              destination: result,
            })
          }
        >
          <Text style={s.goBtnText}>Go</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  page: { flex: 1, backgroundColor: PSU.light },
  scrollContent: { paddingBottom: 16 },

  header: {
    paddingTop: 18,
    paddingHorizontal: 20,
  },
  brand: {
    color: PSU.blue,
    fontWeight: "900",
    letterSpacing: 1.5,
    fontSize: 12,
  },
  title: {
    marginTop: 10,
    fontSize: 38,
    fontWeight: "900",
    color: PSU.text,
    lineHeight: 42,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    color: PSU.muted,
    lineHeight: 22,
  },

  panel: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: PSU.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 18,
  },
  panelTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: PSU.text,
    marginBottom: 14,
  },

  modeRow: {
    flexDirection: "row",
    backgroundColor: "#F3F6FA",
    borderRadius: 16,
    padding: 4,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeBtnActive: {
    backgroundColor: PSU.blue,
  },
  modeBtnText: {
    fontWeight: "800",
    color: PSU.muted,
    fontSize: 14,
  },
  modeBtnTextActive: {
    color: PSU.white,
  },

  label: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "800",
    color: PSU.text,
  },
  dropdownField: {
    height: 54,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownValue: {
    color: PSU.text,
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
  },
  dropdownChevron: {
    color: PSU.muted,
    fontSize: 18,
    fontWeight: "900",
  },

  input: {
    height: 54,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    backgroundColor: "#FBFCFE",
    paddingHorizontal: 14,
    color: PSU.text,
    fontSize: 16,
    fontWeight: "600",
  },

  courseHintBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    backgroundColor: "#FAFBFD",
    padding: 12,
  },
  courseHintText: {
    color: PSU.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  searchBtn: {
    height: 54,
    marginTop: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PSU.blue,
  },
  searchBtnText: {
    color: PSU.white,
    fontSize: 16,
    fontWeight: "900",
  },

  status: {
    marginTop: 14,
    fontSize: 14,
    fontWeight: "700",
  },
  statusSuccess: {
    color: "#1E6B35",
  },
  statusError: {
    color: "#B42318",
  },

  resultCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: PSU.successBorder,
    backgroundColor: PSU.successBg,
    borderRadius: 16,
    padding: 14,
  },
  resultHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  resultSearchLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: PSU.blue2,
    marginBottom: 4,
  },
  resultRoom: {
    fontSize: 17,
    fontWeight: "900",
    color: PSU.text,
  },
  resultMeta: {
    marginTop: 6,
    color: "#2C4A36",
    fontSize: 13,
    fontWeight: "600",
  },
  resultMeta2: {
    marginTop: 4,
    color: "#456252",
    fontSize: 12,
    fontWeight: "600",
  },
  goBtn: {
    minWidth: 74,
    height: 42,
    borderRadius: 12,
    backgroundColor: PSU.blue2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  goBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 14,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: PSU.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 20,
  },
  modalHeader: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: PSU.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCancel: {
    color: PSU.muted,
    fontWeight: "700",
    fontSize: 16,
  },
  modalTitle: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 16,
  },
  modalDone: {
    color: PSU.blue2,
    fontWeight: "900",
    fontSize: 16,
  },
  pickerIOS: {
    width: "100%",
    height: 220,
  },
  pickerItemIOS: {
    fontSize: 18,
  },
});
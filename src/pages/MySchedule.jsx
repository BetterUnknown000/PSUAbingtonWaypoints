import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";

import BottomMenu, { BOTTOM_MENU_HEIGHT } from "../components/BottomMenu";
import { getAllBuildings, findRoom } from "../utils/findRoom";
import {
  loadSchedule,
  addScheduleItem,
  deleteScheduleItem,
  clearSchedule,
} from "../utils/scheduleStorage";
import courseData from "../data/courseData.json";

const PSU = {
  blue: "#001E44",
  blue2: "#0B3D91",
  white: "#FFFFFF",
  light: "#F5F7FA",
  border: "#E6ECF2",
  text: "#0B1220",
  muted: "#5B6776",
  successBg: "#EEF8F1",
  successBorder: "#B7DEC1",
  dangerBg: "#FFF1F1",
  dangerBorder: "#F3C7C7",
  onlineBg: "#F4F6FB",
  onlineBorder: "#D6DEEE",
};

const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function parseTimeToMinutes(value) {
  const parts = String(value || "").split(":");
  if (parts.length !== 2) return null;

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (
    Number.isNaN(h) ||
    Number.isNaN(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  ) {
    return null;
  }

  return h * 60 + m;
}

function parse12HourTo24(timeStr) {
  const raw = String(timeStr || "").trim().toUpperCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3];

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimeRange(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.includes("-")) {
    return { startTime: "", endTime: "" };
  }

  const [startRaw, endRaw] = raw.split("-").map((part) => part.trim());

  return {
    startTime: parse12HourTo24(startRaw),
    endTime: parse12HourTo24(endRaw),
  };
}

function parseDayString(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return [];

  const compact = raw.replace(/\s+/g, "");

  const tokens = [];
  let i = 0;

  while (i < compact.length) {
    if (compact.slice(i, i + 2) === "TH") {
      tokens.push("Thu");
      i += 2;
      continue;
    }

    const ch = compact[i];

    if (ch === "M") tokens.push("Mon");
    else if (ch === "T") tokens.push("Tue");
    else if (ch === "W") tokens.push("Wed");
    else if (ch === "F") tokens.push("Fri");
    else if (ch === "S") tokens.push("Sat");
    else if (ch === "U") tokens.push("Sun");
    else if (ch === "R") tokens.push("Thu");

    i += 1;
  }

  return [...new Set(tokens)];
}

function sortByStartTime(items) {
  return [...items].sort((a, b) => {
    const aTime = parseTimeToMinutes(a.startTime) ?? 9999;
    const bTime = parseTimeToMinutes(b.startTime) ?? 9999;
    return aTime - bTime;
  });
}

function getTodayKey() {
  const day = new Date().getDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day];
}

function getNowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function getNextClass(items) {
  const today = getTodayKey();
  const now = getNowMinutes();

  const todayItems = sortByStartTime(
    items.filter((item) => Array.isArray(item.days) && item.days.includes(today))
  );

  return (
    todayItems.find((item) => {
      const start = parseTimeToMinutes(item.startTime);
      return start !== null && start >= now;
    }) || null
  );
}

function findBuildingObject(buildings, rawBuilding) {
  const normalized = normalizeText(rawBuilding);

  return (
    buildings.find((b) => normalizeText(b.id) === normalized) ||
    buildings.find((b) => normalizeText(b.name) === normalized) ||
    buildings.find((b) => normalizeText(b.name).includes(normalized)) ||
    null
  );
}

function formatSectionLabel(entry, buildings) {
  const status = String(entry?.status || "").trim().toUpperCase();
  const buildingObj = findBuildingObject(buildings, entry?.building);

  const buildingName =
    status === "ZOOM" || status === "WEB"
      ? status
      : buildingObj?.name || entry?.building || "Location TBD";

  const roomPart =
    status === "ZOOM" || status === "WEB"
      ? ""
      : entry?.room_number
      ? ` ${entry.room_number}`
      : "";

  return `${entry?.day || "Days TBD"} • ${entry?.time || "Time TBD"} • ${buildingName}${roomPart}`;
}

function buildScheduleItemFromCourseEntry(entry, buildings) {
  const status = String(entry?.status || "").trim().toUpperCase();
  const isOnline = status === "ZOOM" || status === "WEB";

  const buildingObj = findBuildingObject(buildings, entry?.building);
  const parsedTime = parseTimeRange(entry?.time);
  const parsedDays = parseDayString(entry?.day);

  return {
    id: makeId(),
    sourceType: "course",
    courseCode: String(entry?.course || "").trim(),
    courseName: "",
    buildingId: isOnline ? "" : buildingObj?.id || String(entry?.building || "").trim(),
    buildingName: isOnline
      ? status
      : buildingObj?.name || String(entry?.building || "").trim() || "TBD",
    roomNumber: isOnline ? status : String(entry?.room_number || "").trim(),
    days: parsedDays,
    startTime: parsedTime.startTime,
    endTime: parsedTime.endTime,
    status,
    isOnline,
    createdAt: new Date().toISOString(),
  };
}

export default function MySchedule({ navigation }) {
  const buildings = useMemo(() => getAllBuildings(), []);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalVisible, setModalVisible] = useState(false);
  const [sectionModalVisible, setSectionModalVisible] = useState(false);

  const [addMode, setAddMode] = useState("course");

  const [courseQuery, setCourseQuery] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [buildingId, setBuildingId] = useState(buildings[0]?.id || "");
  const [roomNumber, setRoomNumber] = useState("");
  const [days, setDays] = useState(["Mon", "Wed"]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [pendingCourseMatches, setPendingCourseMatches] = useState([]);
  const [selectedCourseMatchIndex, setSelectedCourseMatchIndex] = useState(0);

  const refreshSchedule = useCallback(async () => {
    setLoading(true);
    const items = await loadSchedule();
    setSchedule(items);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSchedule();
    }, [refreshSchedule])
  );

  const nextClass = useMemo(() => getNextClass(schedule), [schedule]);

  function resetForm() {
    setAddMode("course");
    setCourseQuery("");
    setCourseCode("");
    setCourseName("");
    setBuildingId(buildings[0]?.id || "");
    setRoomNumber("");
    setDays(["Mon", "Wed"]);
    setStartTime("");
    setEndTime("");
    setPendingCourseMatches([]);
    setSelectedCourseMatchIndex(0);
  }

  function toggleDay(day) {
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day]
    );
  }

  function getCourseMatches(query) {
    const normalizedQuery = normalizeText(query);

    const courseList = Array.isArray(courseData?.courses)
      ? courseData.courses
      : Array.isArray(courseData)
      ? courseData
      : [];

    return courseList.filter((entry) => {
      const courseValue = normalizeText(entry?.course);
      return courseValue === normalizedQuery;
    });
  }

  async function saveScheduleItem(item) {
    const updated = await addScheduleItem(item);
    setSchedule(updated);
    setModalVisible(false);
    setSectionModalVisible(false);
    resetForm();
  }

  async function handleConfirmCourseSection() {
    const selected = pendingCourseMatches[selectedCourseMatchIndex];

    if (!selected) {
      Alert.alert("No section selected", "Please select one course section.");
      return;
    }

    const newItem = buildScheduleItemFromCourseEntry(selected, buildings);

    if (!newItem.startTime || !newItem.endTime || newItem.days.length === 0) {
      Alert.alert(
        "Missing schedule info",
        "This course entry does not contain enough day/time information to save automatically."
      );
      return;
    }

    await saveScheduleItem(newItem);
  }

  async function handleAddCourse() {
    const trimmedCourseQuery = String(courseQuery).trim();
    const trimmedCode = String(courseCode).trim();
    const trimmedRoom = String(roomNumber).trim();
    const trimmedStart = String(startTime).trim();
    const trimmedEnd = String(endTime).trim();

    if (addMode === "course") {
      if (!trimmedCourseQuery) {
        Alert.alert("Missing course", "Please enter a course.");
        return;
      }

      const matches = getCourseMatches(trimmedCourseQuery);

      if (matches.length === 0) {
        Alert.alert("Course not found", "This course was not found in courseData.json.");
        return;
      }

      if (matches.length === 1) {
        const newItem = buildScheduleItemFromCourseEntry(matches[0], buildings);

        if (!newItem.startTime || !newItem.endTime || newItem.days.length === 0) {
          Alert.alert(
            "Missing schedule info",
            "This course was found, but its day/time info is incomplete."
          );
          return;
        }

        await saveScheduleItem(newItem);
        return;
      }

      setPendingCourseMatches(matches);
      setSelectedCourseMatchIndex(0);
      setSectionModalVisible(true);
      return;
    }

    if (!trimmedCode) {
      Alert.alert("Missing class label", "Please enter a class code or label.");
      return;
    }

    if (!buildingId) {
      Alert.alert("Missing building", "Please select a building.");
      return;
    }

    if (!trimmedRoom) {
      Alert.alert("Missing room number", "Please enter a room number.");
      return;
    }

    if (days.length === 0) {
      Alert.alert("Missing days", "Please choose at least one day.");
      return;
    }

    if (!trimmedStart || !trimmedEnd) {
      Alert.alert(
        "Missing time",
        "Please enter start and end time in 24-hour format, for example 13:25."
      );
      return;
    }

    const startMinutes = parseTimeToMinutes(trimmedStart);
    const endMinutes = parseTimeToMinutes(trimmedEnd);

    if (startMinutes === null || endMinutes === null) {
      Alert.alert("Invalid time", "Time should look like 09:05 or 13:25.");
      return;
    }

    if (endMinutes <= startMinutes) {
      Alert.alert("Invalid time range", "End time must be later than start time.");
      return;
    }

    const building = buildings.find((b) => b.id === buildingId);

    const newItem = {
      id: makeId(),
      sourceType: "room",
      courseCode: trimmedCode,
      courseName: String(courseName).trim(),
      buildingId,
      buildingName: building?.name || buildingId,
      roomNumber: trimmedRoom,
      days: [...days].sort(
        (a, b) => DAY_OPTIONS.indexOf(a) - DAY_OPTIONS.indexOf(b)
      ),
      startTime: trimmedStart,
      endTime: trimmedEnd,
      status: "IN PERSON",
      isOnline: false,
      createdAt: new Date().toISOString(),
    };

    await saveScheduleItem(newItem);
  }

  async function handleDelete(id) {
    const updated = await deleteScheduleItem(id);
    setSchedule(updated);
  }

  function handleNavigate(item) {
    if (item.isOnline || item.status === "ZOOM" || item.status === "WEB") {
      Alert.alert(
        "Online class",
        "This class is online, so there is no classroom navigation."
      );
      return;
    }

    const result = findRoom(item.buildingId, item.roomNumber);

    if (!result) {
      Alert.alert(
        "Room not found",
        `Could not find room ${item.roomNumber} in ${item.buildingName}.`
      );
      return;
    }

    navigation.navigate("Navigation", {
      destination: {
        ...result,
        searchType: "schedule",
        course: {
          course_code: item.courseCode,
          course_name: item.courseName || "",
        },
      },
    });
  }

  function handleOpenAddModal() {
    resetForm();
    setModalVisible(true);
  }

  function handleClearAll() {
    if (schedule.length === 0) return;

    Alert.alert(
      "Clear saved schedule?",
      "This will remove all locally saved classes from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearSchedule();
            setSchedule([]);
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.page}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>PENN STATE ABINGTON</Text>
            <Text style={s.title}>My Schedule</Text>
            <Text style={s.subtitle}>
              Save your classes on this device for quick access to classroom
              navigation.
            </Text>
          </View>

          {nextClass ? (
            <View style={[s.nextCard, nextClass.isOnline && s.onlineCard]}>
              <Text style={s.nextLabel}>Next class today</Text>
              <Text style={s.nextTitle}>
                {nextClass.courseCode}
                {nextClass.courseName ? ` — ${nextClass.courseName}` : ""}
              </Text>
              <Text style={s.nextMeta}>
                {nextClass.isOnline
                  ? nextClass.status
                  : `${nextClass.buildingName} ${nextClass.roomNumber}`}
              </Text>
              <Text style={s.nextMeta}>
                {nextClass.days.join(" • ")} • {nextClass.startTime} - {nextClass.endTime}
              </Text>

              <Pressable
                style={[s.primaryBtn, nextClass.isOnline && s.disabledBtn]}
                onPress={() => handleNavigate(nextClass)}
              >
                <Text style={s.primaryBtnText}>
                  {nextClass.isOnline ? "Online Class" : "Navigate to next class"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.emptyCard}>
              <Text style={s.emptyTitle}>No upcoming class today</Text>
              <Text style={s.emptyText}>
                Add your classes once and open them later for quick navigation.
              </Text>
            </View>
          )}

          <View style={s.actionsRow}>
            <Pressable style={s.addBtn} onPress={handleOpenAddModal}>
              <Text style={s.addBtnText}>+ Add Class</Text>
            </Pressable>

            <Pressable style={s.clearBtn} onPress={handleClearAll}>
              <Text style={s.clearBtnText}>Clear All</Text>
            </Pressable>
          </View>

          <View style={s.listCard}>
            <Text style={s.sectionTitle}>Saved Classes</Text>

            {loading ? (
              <Text style={s.infoText}>Loading saved schedule...</Text>
            ) : schedule.length === 0 ? (
              <Text style={s.infoText}>
                Nothing saved yet. Tap “Add Class” to build your schedule.
              </Text>
            ) : (
              sortByStartTime(schedule).map((item) => (
                <View
                  key={item.id}
                  style={[s.courseCard, item.isOnline && s.onlineCourseCard]}
                >
                  <View style={s.courseTopRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.courseCode}>{item.courseCode}</Text>
                      {item.courseName ? (
                        <Text style={s.courseName}>{item.courseName}</Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={s.courseMeta}>
                    {item.isOnline
                      ? item.status || "ONLINE"
                      : `${item.buildingName} ${item.roomNumber}`}
                  </Text>
                  <Text style={s.courseMeta}>
                    {item.days.join(" • ")} • {item.startTime} - {item.endTime}
                  </Text>

                  <View style={s.cardButtonsRow}>
                    <Pressable
                      style={[s.navigateBtn, item.isOnline && s.disabledBtn]}
                      onPress={() => handleNavigate(item)}
                    >
                      <Text style={s.navigateBtnText}>
                        {item.isOnline ? "Online" : "Navigate"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={s.deleteBtn}
                      onPress={() => handleDelete(item.id)}
                    >
                      <Text style={s.deleteBtnText}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <BottomMenu navigation={navigation} active="Schedule" />

        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Pressable onPress={() => setModalVisible(false)}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </Pressable>

                <Text style={s.modalTitle}>Add Class</Text>

                <Pressable onPress={handleAddCourse}>
                  <Text style={s.modalDone}>Save</Text>
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={s.modalBody}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.label}>Add class by</Text>
                <View style={s.modeRow}>
                  <Pressable
                    style={[s.modeBtn, addMode === "course" && s.modeBtnActive]}
                    onPress={() => setAddMode("course")}
                  >
                    <Text
                      style={[
                        s.modeBtnText,
                        addMode === "course" && s.modeBtnTextActive,
                      ]}
                    >
                      By Course
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[s.modeBtn, addMode === "room" && s.modeBtnActive]}
                    onPress={() => setAddMode("room")}
                  >
                    <Text
                      style={[
                        s.modeBtnText,
                        addMode === "room" && s.modeBtnTextActive,
                      ]}
                    >
                      By Room
                    </Text>
                  </Pressable>
                </View>

                {addMode === "course" ? (
                  <>
                    <Text style={s.label}>Course</Text>
                    <TextInput
                      value={courseQuery}
                      onChangeText={setCourseQuery}
                      placeholder="e.g. CMPSC 472"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                      autoCapitalize="characters"
                    />

                    <View style={s.courseHintBox}>
                      <Text style={s.courseHintText}>
                        Days, time, and location will be filled automatically
                        from courseData.json. If there are multiple sections,
                        you will choose one.
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.label}>Class label</Text>
                    <TextInput
                      value={courseCode}
                      onChangeText={setCourseCode}
                      placeholder="e.g. CMPSC 472"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                      autoCapitalize="characters"
                    />

                    <Text style={s.label}>Class name (optional)</Text>
                    <TextInput
                      value={courseName}
                      onChangeText={setCourseName}
                      placeholder="Optional"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                    />

                    <Text style={s.label}>Building</Text>
                    <View style={s.pickerWrap}>
                      <Picker
                        selectedValue={buildingId}
                        onValueChange={(value) => setBuildingId(value)}
                      >
                        {buildings.map((building) => (
                          <Picker.Item
                            key={building.id}
                            label={building.name}
                            value={building.id}
                            color={PSU.text}
                          />
                        ))}
                      </Picker>
                    </View>

                    <Text style={s.label}>Room number</Text>
                    <TextInput
                      value={roomNumber}
                      onChangeText={setRoomNumber}
                      placeholder="111"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                      autoCapitalize="characters"
                    />

                    <Text style={s.label}>Days</Text>
                    <View style={s.daysRow}>
                      {DAY_OPTIONS.map((day) => {
                        const active = days.includes(day);
                        return (
                          <Pressable
                            key={day}
                            style={[s.dayChip, active && s.dayChipActive]}
                            onPress={() => toggleDay(day)}
                          >
                            <Text
                              style={[
                                s.dayChipText,
                                active && s.dayChipTextActive,
                              ]}
                            >
                              {day}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={s.label}>Start time</Text>
                    <TextInput
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="10:05"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                    />

                    <Text style={s.label}>End time</Text>
                    <TextInput
                      value={endTime}
                      onChangeText={setEndTime}
                      placeholder="11:20"
                      placeholderTextColor="#8B97A7"
                      style={s.input}
                    />
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={sectionModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSectionModalVisible(false)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalSheet}>
              <View style={s.modalHeader}>
                <Pressable onPress={() => setSectionModalVisible(false)}>
                  <Text style={s.modalCancel}>Cancel</Text>
                </Pressable>

                <Text style={s.modalTitle}>Choose Section</Text>

                <Pressable onPress={handleConfirmCourseSection}>
                  <Text style={s.modalDone}>Save</Text>
                </Pressable>
              </View>

              <View style={s.modalBody}>
                <Text style={s.label}>Matching sections</Text>
                <View style={s.pickerWrap}>
                  <Picker
                    selectedValue={selectedCourseMatchIndex}
                    onValueChange={(value) => setSelectedCourseMatchIndex(value)}
                  >
                    {pendingCourseMatches.map((entry, index) => (
                      <Picker.Item
                        key={`${entry.course}_${entry.day}_${entry.time}_${index}`}
                        label={formatSectionLabel(entry, buildings)}
                        value={index}
                        color={PSU.text}
                      />
                    ))}
                  </Picker>
                </View>

                {pendingCourseMatches[selectedCourseMatchIndex] ? (
                  <View style={s.sectionPreview}>
                    <Text style={s.sectionPreviewTitle}>
                      {pendingCourseMatches[selectedCourseMatchIndex].course}
                    </Text>
                    <Text style={s.sectionPreviewText}>
                      {formatSectionLabel(
                        pendingCourseMatches[selectedCourseMatchIndex],
                        buildings
                      )}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Modal>
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

  scrollContent: {
    flexGrow: 1,
    paddingBottom: BOTTOM_MENU_HEIGHT + 32,
  },

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

  nextCard: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: PSU.successBg,
    borderColor: PSU.successBorder,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },

  onlineCard: {
    backgroundColor: PSU.onlineBg,
    borderColor: PSU.onlineBorder,
  },

  nextLabel: {
    color: PSU.blue2,
    fontWeight: "900",
    fontSize: 13,
    marginBottom: 6,
  },

  nextTitle: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 22,
  },

  nextMeta: {
    marginTop: 6,
    color: "#2C4A36",
    fontSize: 14,
    fontWeight: "700",
  },

  emptyCard: {
    marginTop: 18,
    marginHorizontal: 20,
    backgroundColor: PSU.white,
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },

  emptyTitle: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 20,
  },

  emptyText: {
    marginTop: 8,
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
  },

  actionsRow: {
    marginTop: 14,
    marginHorizontal: 20,
    flexDirection: "row",
    gap: 10,
  },

  addBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  addBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 15,
  },

  clearBtn: {
    width: 110,
    height: 52,
    borderRadius: 16,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    alignItems: "center",
    justifyContent: "center",
  },

  clearBtnText: {
    color: PSU.text,
    fontWeight: "800",
    fontSize: 14,
  },

  listCard: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: PSU.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 16,
  },

  sectionTitle: {
    color: PSU.text,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 10,
  },

  infoText: {
    color: PSU.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },

  courseCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#FBFCFE",
  },

  onlineCourseCard: {
    backgroundColor: PSU.onlineBg,
    borderColor: PSU.onlineBorder,
  },

  courseTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },

  courseCode: {
    color: PSU.text,
    fontSize: 18,
    fontWeight: "900",
  },

  courseName: {
    color: PSU.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },

  courseMeta: {
    marginTop: 6,
    color: PSU.text,
    fontSize: 13,
    fontWeight: "700",
  },

  cardButtonsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },

  navigateBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: PSU.blue2,
    alignItems: "center",
    justifyContent: "center",
  },

  navigateBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 14,
  },

  disabledBtn: {
    backgroundColor: "#8B97A7",
  },

  deleteBtn: {
    width: 88,
    height: 44,
    borderRadius: 12,
    backgroundColor: PSU.dangerBg,
    borderWidth: 1,
    borderColor: PSU.dangerBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  deleteBtnText: {
    color: "#B42318",
    fontWeight: "900",
    fontSize: 14,
  },

  primaryBtn: {
    marginTop: 14,
    height: 50,
    borderRadius: 14,
    backgroundColor: PSU.blue,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtnText: {
    color: PSU.white,
    fontWeight: "900",
    fontSize: 15,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    justifyContent: "flex-end",
  },

  modalSheet: {
    maxHeight: "88%",
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

  modalBody: {
    padding: 18,
    paddingBottom: 30,
  },

  label: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "800",
    color: PSU.text,
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

  pickerWrap: {
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    backgroundColor: "#FBFCFE",
    overflow: "hidden",
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

  sectionPreview: {
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: "#FAFBFD",
  },

  sectionPreviewTitle: {
    color: PSU.text,
    fontWeight: "900",
    fontSize: 16,
  },

  sectionPreviewText: {
    marginTop: 6,
    color: PSU.muted,
    fontWeight: "600",
    fontSize: 13,
    lineHeight: 20,
  },

  daysRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  dayChip: {
    minWidth: 54,
    height: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
    alignItems: "center",
    justifyContent: "center",
  },

  dayChipActive: {
    backgroundColor: PSU.blue,
    borderColor: PSU.blue,
  },

  dayChipText: {
    color: PSU.text,
    fontWeight: "800",
    fontSize: 13,
  },

  dayChipTextActive: {
    color: PSU.white,
  },
});
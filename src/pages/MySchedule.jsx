import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBottomMenuSpacing } from "../utils/useBottomMenuSpacing";
import { Picker } from "@react-native-picker/picker";
import { useFocusEffect } from "@react-navigation/native";
import * as Calendar from "expo-calendar";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";

import BottomMenu, { BOTTOM_MENU_HEIGHT } from "../components/BottomMenu";
import { getAllBuildings, findRoom } from "../utils/findRoom";
import {
  loadSchedule,
  saveSchedule,
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
  danger: "#B42318",
  card: "#FFFFFF",
  gold: "#FFC857",
};

const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const BUILDING_ALIASES = {
  SUTH: "sutherland",
  SUTHERLAND: "sutherland",
  WOOD: "woodland",
  WOODLAND: "woodland",
  RYDAL: "rydal",
  LARES: "lares",
  SPRING: "springhouse",
  SPRINGHOUSE: "springhouse",
  ATH: "athletic",
  ATHLETIC: "athletic",
};

const ICS_DAY_MAP = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

const APP_CALENDAR_NAME = "PSU Abington Waypoints";

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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function timeTo24String(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parse12HourTo24(timeStr) {
  const raw = String(timeStr || "")
    .trim()
    .toUpperCase()
    .replace(/\./g, "");
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);

  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3];

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return `${pad2(hour)}:${pad2(minute)}`;
}

function parseTimeRange(value) {
  const raw = String(value || "").trim().replace(/\./g, "");
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
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/TH/g, "R");

  if (!raw) return [];

  const tokens = [];
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "M") tokens.push("Mon");
    else if (ch === "T") tokens.push("Tue");
    else if (ch === "W") tokens.push("Wed");
    else if (ch === "R") tokens.push("Thu");
    else if (ch === "F") tokens.push("Fri");
    else if (ch === "S") tokens.push("Sat");
    else if (ch === "U") tokens.push("Sun");
  }

  return [...new Set(tokens)];
}

function sortByStartTime(items) {
  return [...items].sort((a, b) => {
    const dayA =
      Array.isArray(a.days) && a.days.length > 0
        ? DAY_OPTIONS.indexOf(a.days[0])
        : 99;
    const dayB =
      Array.isArray(b.days) && b.days.length > 0
        ? DAY_OPTIONS.indexOf(b.days[0])
        : 99;

    if (dayA !== dayB) return dayA - dayB;

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

function formatDays(days = []) {
  if (!Array.isArray(days) || days.length === 0) return "No days";
  return days.join(" • ");
}

function formatTimeRange(startTime, endTime) {
  if (!startTime || !endTime) return "Time not set";
  return `${startTime} - ${endTime}`;
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
    buildingId: isOnline
      ? ""
      : buildingObj?.id || String(entry?.building || "").trim().toLowerCase(),
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

function tryExtractCourseCode(line) {
  const match = String(line || "")
    .toUpperCase()
    .match(/\b([A-Z]{2,}\s?\d{2,3}[A-Z]?)\b/);
  return match ? match[1].replace(/\s+/g, " ").trim() : "";
}
/*
function buildScheduleItemsFromCourseCode(courseCode, buildings, sourceType = "import") {
  const normalizedQuery = normalizeText(courseCode);

  const courseList = Array.isArray(courseData?.courses)
    ? courseData.courses
    : Array.isArray(courseData)
    ? courseData
    : [];

  const matches = courseList.filter(
    (entry) => normalizeText(entry?.course) === normalizedQuery
  );

  return matches.map((entry) => {
    const built = buildScheduleItemFromCourseEntry(entry, buildings);
    return {
      ...built,
      sourceType,
    };
  });
}
*/
function normalizeDayList(days = []) {
  return [...new Set(days)].sort(
    (a, b) => DAY_OPTIONS.indexOf(a) - DAY_OPTIONS.indexOf(b)
  );
}

function sameDays(daysA = [], daysB = []) {
  const a = normalizeDayList(daysA);
  const b = normalizeDayList(daysB);

  if (a.length !== b.length) return false;
  return a.every((day, index) => day === b[index]);
}

function timeDistanceMinutes(a, b) {
  const aMin = parseTimeToMinutes(a);
  const bMin = parseTimeToMinutes(b);
  if (aMin === null || bMin === null) return 99999;
  return Math.abs(aMin - bMin);
}

function buildScheduleItemFromCourseEntryWithSource(entry, buildings, sourceType) {
  const built = buildScheduleItemFromCourseEntry(entry, buildings);
  return {
    ...built,
    sourceType,
  };
}

function pickBestCourseMatch(courseCode, importedDays, importedStartTime) {
  const normalizedQuery = normalizeText(courseCode);

  const courseList = Array.isArray(courseData?.courses)
    ? courseData.courses
    : Array.isArray(courseData)
    ? courseData
    : [];

  const matches = courseList.filter(
    (entry) => normalizeText(entry?.course) === normalizedQuery
  );

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const normalizedImportedDays = normalizeDayList(importedDays || []);

  const scored = matches.map((entry) => {
    const parsedDays = parseDayString(entry?.day);
    const parsedTime = parseTimeRange(entry?.time);

    let score = 0;

    if (sameDays(parsedDays, normalizedImportedDays)) {
      score += 1000;
    } else {
      const overlapCount = parsedDays.filter((d) =>
        normalizedImportedDays.includes(d)
      ).length;
      score += overlapCount * 100;
    }

    if (parsedTime.startTime && importedStartTime) {
      score += Math.max(0, 60 - timeDistanceMinutes(parsedTime.startTime, importedStartTime));
    }

    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.entry || null;
}

function buildScheduleItemsFromCourseCode(
  courseCode,
  buildings,
  sourceType = "import",
  importedDays = [],
  importedStartTime = ""
) {
  const bestMatch = pickBestCourseMatch(courseCode, importedDays, importedStartTime);

  if (!bestMatch) return [];

  return [
    buildScheduleItemFromCourseEntryWithSource(bestMatch, buildings, sourceType),
  ];
}


function buildScheduleItemFromCalendarEvent(event, buildings) {
  const title = String(event?.title || "").trim();
  const notes = String(event?.notes || "").trim();
  const courseCode = tryExtractCourseCode(`${title} ${notes}`);

  if (!courseCode) return [];

  const startDate = new Date(event.startDate);
  const importedDay = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][startDate.getDay()];
  const importedStartTime = timeTo24String(startDate);

  return buildScheduleItemsFromCourseCode(
    courseCode,
    buildings,
    "calendar_import",
    [importedDay],
    importedStartTime
  );
}

function unfoldICSLines(text) {
  return String(text || "").replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function extractICSField(block, fieldName) {
  const regex = new RegExp(`${fieldName}(?:;[^:]+)?:([^\\n\\r]+)`, "i");
  const match = block.match(regex);
  return match ? match[1].trim() : "";
}

function parseICSDateTo24(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/T(\d{2})(\d{2})/);
  if (!match) return "";
  return `${match[1]}:${match[2]}`;
}

function parseICSDays(rrule) {
  const raw = String(rrule || "");
  const match = raw.match(/BYDAY=([^;\n\r]+)/i);
  if (!match) return [];

  return match[1]
    .split(",")
    .map((d) => ICS_DAY_MAP[d.trim().toUpperCase()])
    .filter(Boolean);
}

function buildScheduleItemFromICSBlock(block, buildings) {
  const summary = extractICSField(block, "SUMMARY");
  const description = extractICSField(block, "DESCRIPTION");
  const dtStart = extractICSField(block, "DTSTART");
  const rrule = extractICSField(block, "RRULE");

  const courseCode = tryExtractCourseCode(summary || description);
  if (!courseCode) return [];

  const importedDays = parseICSDays(rrule);
  const importedStartTime = parseICSDateTo24(dtStart);

  return buildScheduleItemsFromCourseCode(
    courseCode,
    buildings,
    "ics_import",
    importedDays,
    importedStartTime
  );
}

function parseICSFileText(text, buildings) {
  const normalized = unfoldICSLines(text);
  const blocks = normalized.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return blocks.flatMap((block) => buildScheduleItemFromICSBlock(block, buildings));
}

function dedupeScheduleItems(items = []) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = [
      item.courseCode,
      item.buildingId,
      item.roomNumber,
      (item.days || []).join(","),
      item.startTime,
      item.endTime,
      item.status,
    ].join("|");

    if (!seen.has(key)) {
      seen.add(key);
      output.push(item);
    }
  }

  return output;
}

function nextOccurrenceForDay(dayName, startTime, endTime, weekOffset = 0) {
  const now = new Date();
  const targetDay = DAY_TO_INDEX[dayName];
  if (targetDay == null) return null;

  const [startH, startM] = String(startTime || "00:00")
    .split(":")
    .map(Number);
  const [endH, endM] = String(endTime || "00:00")
    .split(":")
    .map(Number);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  let diff = targetDay - start.getDay();
  if (diff < 0) diff += 7;

  start.setDate(start.getDate() + diff + weekOffset * 7);
  start.setHours(startH || 0, startM || 0, 0, 0);

  const end = new Date(start);
  end.setHours(endH || 0, endM || 0, 0, 0);

  if (weekOffset === 0 && start < now) {
    start.setDate(start.getDate() + 7);
    end.setDate(end.getDate() + 7);
  }

  return { start, end };
}

async function ensureAppCalendar() {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find((c) => c.title === APP_CALENDAR_NAME);
  if (existing) return existing.id;

  if (Platform.OS === "ios") {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    return Calendar.createCalendarAsync({
      title: APP_CALENDAR_NAME,
      color: "#001E44",
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultCalendar.source?.id,
      source: defaultCalendar.source,
      name: APP_CALENDAR_NAME,
      ownerAccount: "personal",
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
  }

  return Calendar.createCalendarAsync({
    title: APP_CALENDAR_NAME,
    color: "#001E44",
    entityType: Calendar.EntityTypes.EVENT,
    name: APP_CALENDAR_NAME,
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
    source: { isLocalAccount: true, name: APP_CALENDAR_NAME },
  });
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
  const { bottomMenuSpace } = useBottomMenuSpacing(42);
  const [selectedCourseMatchIndex, setSelectedCourseMatchIndex] = useState(0);

  const [calendarBusy, setCalendarBusy] = useState(false);

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

    return courseList.filter((entry) => normalizeText(entry?.course) === normalizedQuery);
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
      Alert.alert("Missing room", "Please enter a room number.");
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
      days: [...days].sort((a, b) => DAY_OPTIONS.indexOf(a) - DAY_OPTIONS.indexOf(b)),
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
      Alert.alert("Online class", "This class is online, so there is no classroom navigation.");
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

  async function handleExportScheduleToCalendar() {
    if (schedule.length === 0) {
      Alert.alert("No schedule", "Add classes before exporting to the phone calendar.");
      return;
    }

    setCalendarBusy(true);

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Calendar permission is required.");
        return;
      }

      const calendarId = await ensureAppCalendar();

      const oldEvents = await Calendar.getEventsAsync(
        [calendarId],
        new Date(),
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 180)
      );

      for (const event of oldEvents) {
        await Calendar.deleteEventAsync(event.id);
      }

      let createdCount = 0;

      for (const item of schedule) {
        if (!Array.isArray(item.days) || item.days.length === 0) continue;
        if (!item.startTime || !item.endTime) continue;

        for (const dayName of item.days) {
          for (let week = 0; week < 14; week += 1) {
            const occurrence = nextOccurrenceForDay(
              dayName,
              item.startTime,
              item.endTime,
              week
            );

            if (!occurrence) continue;

            await Calendar.createEventAsync(calendarId, {
              title: item.courseCode || "Class",
              startDate: occurrence.start,
              endDate: occurrence.end,
              location: item.isOnline
                ? item.status || "ZOOM"
                : `${item.buildingName || item.buildingId} ${item.roomNumber || ""}`.trim(),
              notes: item.courseName
                ? `${item.courseName}\nImported by PSU Abington Waypoints`
                : "Imported by PSU Abington Waypoints",
            });

            createdCount += 1;
          }
        }
      }

      Alert.alert("Exported", `${createdCount} calendar event(s) were added.`);
    } catch (error) {
      console.log("Calendar export failed:", error);
      Alert.alert("Export failed", "Could not export classes to your phone calendar.");
    } finally {
      setCalendarBusy(false);
    }
  }

  async function handleImportFromDeviceCalendar() {
    setCalendarBusy(true);

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission denied", "Calendar permission is required.");
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const events = await Calendar.getEventsAsync(
        calendars.map((c) => c.id),
        new Date(),
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 120)
      );

      const imported = events.flatMap((event) =>
        buildScheduleItemFromCalendarEvent(event, buildings)
      );

      if (imported.length === 0) {
        Alert.alert(
          "Nothing found",
          "No recognizable course codes were found in the next 120 days, or they were not found in courseData.json."
        );
        return;
      }

      const merged = dedupeScheduleItems([...imported, ...schedule]);
      await saveSchedule(merged);
      setSchedule(merged);

      Alert.alert(
        "Imported",
        `${dedupeScheduleItems(imported).length} class item(s) were added from course data.`
      );
    } catch (error) {
      console.log("Calendar import failed:", error);
      Alert.alert("Import failed", "Could not import classes from your phone calendar.");
    } finally {
      setCalendarBusy(false);
    }
  }

  async function handleImportFromICSFile() {
    setCalendarBusy(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/calendar", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) return;

      const file = result.assets?.[0];
      if (!file?.uri) {
        Alert.alert("File error", "Could not read the selected file.");
        return;
      }

      const pickedFile = new File(file.uri);
      const text = await pickedFile.text();
      const imported = parseICSFileText(text, buildings);

      if (imported.length === 0) {
        Alert.alert(
          "Nothing found",
          "No recognizable course codes were found in this file, or they were not found in courseData.json."
        );
        return;
      }

      const merged = dedupeScheduleItems([...imported, ...schedule]);
      await saveSchedule(merged);
      setSchedule(merged);

      Alert.alert(
        "Imported",
        `${dedupeScheduleItems(imported).length} class item(s) were added from course data.`
      );
    } catch (error) {
      console.log("ICS import failed:", error);
      Alert.alert("Import failed", "Could not import classes from the .ics file.");
    } finally {
      setCalendarBusy(false);
    }
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
          contentContainerStyle={[s.scrollContent, { paddingBottom: bottomMenuSpace }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.header}>
            <Text style={s.brand}>PENN STATE ABINGTON</Text>
            <Text style={s.title}>My Schedule</Text>
            <Text style={s.subtitle}>
              Add classes manually, use course lookup, sync with your phone calendar, or import an .ics file.
            </Text>
          </View>

          {nextClass ? (
            <View style={s.nextCard}>
              <Text style={s.nextEyebrow}>NEXT CLASS</Text>
              <Text style={s.nextCourse}>{nextClass.courseCode || "Unnamed class"}</Text>
              <Text style={s.nextMeta}>
                {formatDays(nextClass.days)} • {formatTimeRange(nextClass.startTime, nextClass.endTime)}
              </Text>
              <Text style={s.nextMeta}>
                {nextClass.buildingName}
                {nextClass.roomNumber ? ` • ${nextClass.roomNumber}` : ""}
              </Text>

              <Pressable style={s.navigateBtn} onPress={() => handleNavigate(nextClass)}>
                <Text style={s.navigateBtnText}>
                  {nextClass.isOnline ? "Online Class" : "Navigate to Class"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.emptyNextCard}>
              <Text style={s.emptyNextTitle}>No upcoming class today</Text>
              <Text style={s.emptyNextText}>
                Add a class or import from your calendar to see your next destination here.
              </Text>
            </View>
          )}

          <View style={s.actionRow}>
            <Pressable style={s.primaryAction} onPress={handleOpenAddModal}>
              <Text style={s.primaryActionText}>＋ Add Class</Text>
            </Pressable>
          </View>

          <View style={s.calendarColumn}>
            <View style={s.calendarRow}>
              <Pressable
                style={[s.calendarBtn, calendarBusy && s.disabledBtn]}
                onPress={handleImportFromDeviceCalendar}
                disabled={calendarBusy}
              >
                <Text style={s.calendarBtnText}>
                  {calendarBusy ? "Working..." : "📅 Import Calendar"}
                </Text>
              </Pressable>

              <Pressable
                style={[s.calendarBtnBlue, calendarBusy && s.disabledBtn]}
                onPress={handleExportScheduleToCalendar}
                disabled={calendarBusy}
              >
                <Text style={s.calendarBtnBlueText}>
                  {calendarBusy ? "Working..." : "📆 Export Calendar"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[s.calendarBtn, calendarBusy && s.disabledBtn, s.fileImportBtn]}
              onPress={handleImportFromICSFile}
              disabled={calendarBusy}
            >
              <Text style={s.calendarBtnText}>
                {calendarBusy ? "Working..." : "📂 Import .ics File"}
              </Text>
            </Pressable>
          </View>

          <View style={s.card}>
            <View style={s.cardHeaderRow}>
              <Text style={s.cardTitle}>Saved Classes</Text>
              {schedule.length > 0 ? (
                <Pressable onPress={handleClearAll}>
                  <Text style={s.clearText}>Clear All</Text>
                </Pressable>
              ) : null}
            </View>

            {loading ? (
              <Text style={s.placeholderText}>Loading schedule...</Text>
            ) : schedule.length === 0 ? (
              <Text style={s.placeholderText}>
                No classes saved yet. Add one manually, import from your phone calendar, or upload an .ics file.
              </Text>
            ) : (
              sortByStartTime(schedule).map((item) => (
                <View
                  key={item.id}
                  style={[s.scheduleItem, item.isOnline && s.onlineItem]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.scheduleCode}>{item.courseCode || "Class"}</Text>
                    {!!item.courseName && (
                      <Text style={s.scheduleName}>{item.courseName}</Text>
                    )}
                    <Text style={s.scheduleMeta}>
                      {formatDays(item.days)} • {formatTimeRange(item.startTime, item.endTime)}
                    </Text>
                    <Text style={s.scheduleMeta}>
                      {item.buildingName}
                      {item.roomNumber ? ` • ${item.roomNumber}` : ""}
                    </Text>
                    <Text style={s.scheduleStatus}>{item.status || "IN PERSON"}</Text>
                  </View>

                  <View style={s.itemActions}>
                    <Pressable
                      style={[s.smallAction, item.isOnline && s.disabledSmallAction]}
                      onPress={() => handleNavigate(item)}
                    >
                      <Text style={s.smallActionText}>
                        {item.isOnline ? "Online" : "Go"}
                      </Text>
                    </Pressable>

                    <Pressable
                      style={[s.smallAction, s.deleteAction]}
                      onPress={() => handleDelete(item.id)}
                    >
                      <Text style={[s.smallActionText, s.deleteActionText]}>
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <BottomMenu navigation={navigation} active="Schedule" />
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Add Class</Text>

            <View style={s.segmentRow}>
              <Pressable
                style={[s.segmentBtn, addMode === "course" && s.segmentBtnActive]}
                onPress={() => setAddMode("course")}
              >
                <Text
                  style={[
                    s.segmentBtnText,
                    addMode === "course" && s.segmentBtnTextActive,
                  ]}
                >
                  Course Lookup
                </Text>
              </Pressable>

              <Pressable
                style={[s.segmentBtn, addMode === "room" && s.segmentBtnActive]}
                onPress={() => setAddMode("room")}
              >
                <Text
                  style={[
                    s.segmentBtnText,
                    addMode === "room" && s.segmentBtnTextActive,
                  ]}
                >
                  By Room
                </Text>
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {addMode === "course" ? (
                <View>
                  <Text style={s.fieldLabel}>Course code</Text>
                  <TextInput
                    style={s.input}
                    value={courseQuery}
                    onChangeText={setCourseQuery}
                    placeholder="Example: CMPSC 472"
                    autoCapitalize="characters"
                  />
                  <Text style={s.helperText}>
                    Days, time, and location will be pulled from your course data.
                  </Text>
                </View>
              ) : (
                <View>
                  <Text style={s.fieldLabel}>Class label</Text>
                  <TextInput
                    style={s.input}
                    value={courseCode}
                    onChangeText={setCourseCode}
                    placeholder="Example: CMPSC 472"
                    autoCapitalize="characters"
                  />

                  <Text style={s.fieldLabel}>Class name (optional)</Text>
                  <TextInput
                    style={s.input}
                    value={courseName}
                    onChangeText={setCourseName}
                    placeholder="Optional"
                  />

                  <Text style={s.fieldLabel}>Building</Text>
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
                        />
                      ))}
                    </Picker>
                  </View>

                  <Text style={s.fieldLabel}>Room number</Text>
                  <TextInput
                    style={s.input}
                    value={roomNumber}
                    onChangeText={setRoomNumber}
                    placeholder="Example: 342"
                    autoCapitalize="characters"
                  />

                  <Text style={s.fieldLabel}>Days</Text>
                  <View style={s.dayRow}>
                    {DAY_OPTIONS.map((day) => {
                      const active = days.includes(day);
                      return (
                        <Pressable
                          key={day}
                          style={[s.dayChip, active && s.dayChipActive]}
                          onPress={() => toggleDay(day)}
                        >
                          <Text style={[s.dayChipText, active && s.dayChipTextActive]}>
                            {day}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={s.fieldLabel}>Start time (24-hour)</Text>
                  <TextInput
                    style={s.input}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="11:15"
                  />

                  <Text style={s.fieldLabel}>End time (24-hour)</Text>
                  <TextInput
                    style={s.input}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="12:05"
                  />
                </View>
              )}
            </ScrollView>

            <View style={s.modalActions}>
              <Pressable
                style={[s.modalBtn, s.modalCancelBtn]}
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable style={[s.modalBtn, s.modalSaveBtn]} onPress={handleAddCourse}>
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sectionModalVisible} animationType="fade" transparent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Choose Course Section</Text>

            <View style={s.pickerWrap}>
              <Picker
                selectedValue={selectedCourseMatchIndex}
                onValueChange={(value) => setSelectedCourseMatchIndex(Number(value))}
              >
                {pendingCourseMatches.map((entry, index) => (
                  <Picker.Item
                    key={`${entry.course}_${entry.day}_${entry.time}_${index}`}
                    label={formatSectionLabel(entry, buildings)}
                    value={index}
                  />
                ))}
              </Picker>
            </View>

            <View style={s.modalActions}>
              <Pressable
                style={[s.modalBtn, s.modalCancelBtn]}
                onPress={() => setSectionModalVisible(false)}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[s.modalBtn, s.modalSaveBtn]}
                onPress={handleConfirmCourseSection}
              >
                <Text style={s.modalSaveText}>Add Section</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PSU.light },
  page: {
    flex: 1,
    backgroundColor: PSU.light,
  },
  scrollContent: { padding: 16 },
  header: { marginBottom: 14 },
  brand: {
    color: PSU.blue2,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  title: {
    color: PSU.text,
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 6,
  },
  subtitle: { color: PSU.muted, fontSize: 15, lineHeight: 21 },

  nextCard: {
    backgroundColor: PSU.blue,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  nextEyebrow: {
    color: "#CFE0FF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  nextCourse: {
    color: PSU.white,
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  nextMeta: { color: "#E8F0FF", fontSize: 14, lineHeight: 20, marginBottom: 2 },
  navigateBtn: {
    marginTop: 14,
    backgroundColor: PSU.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  navigateBtnText: { color: PSU.blue, fontWeight: "900", fontSize: 15 },

  emptyNextCard: {
    backgroundColor: PSU.card,
    borderColor: PSU.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
  },
  emptyNextTitle: { color: PSU.text, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptyNextText: { color: PSU.muted, fontSize: 14, lineHeight: 20 },

  actionRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  primaryAction: {
    flex: 1,
    backgroundColor: PSU.blue,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryActionText: { color: PSU.white, fontWeight: "900", fontSize: 15 },

  calendarColumn: { marginBottom: 14 },
  calendarRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  calendarBtn: {
    flex: 1,
    backgroundColor: PSU.white,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  calendarBtnText: { color: PSU.text, fontWeight: "800", fontSize: 14 },
  calendarBtnBlue: {
    flex: 1,
    backgroundColor: PSU.blue2,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: "center",
  },
  calendarBtnBlueText: { color: PSU.white, fontWeight: "900", fontSize: 14 },
  disabledBtn: { opacity: 0.55 },
  fileImportBtn: { marginBottom: 0 },

  card: {
    backgroundColor: PSU.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: { color: PSU.text, fontSize: 20, fontWeight: "900" },
  clearText: { color: PSU.danger, fontWeight: "800" },
  placeholderText: { color: PSU.muted, fontSize: 14, lineHeight: 20, paddingVertical: 10 },

  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PSU.light,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PSU.border,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  onlineItem: {
    backgroundColor: "#F4F6FB",
    borderColor: "#D6DEEE",
  },
  scheduleCode: { color: PSU.text, fontSize: 17, fontWeight: "900", marginBottom: 2 },
  scheduleName: { color: PSU.muted, fontSize: 13, marginBottom: 4 },
  scheduleMeta: { color: PSU.muted, fontSize: 13, lineHeight: 18 },
  scheduleStatus: { marginTop: 6, color: PSU.blue2, fontSize: 12, fontWeight: "800" },

  itemActions: { gap: 8 },
  smallAction: {
    minWidth: 76,
    backgroundColor: PSU.blue,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  disabledSmallAction: {
    backgroundColor: "#AAB4C3",
  },
  smallActionText: { color: PSU.white, fontWeight: "800", fontSize: 13 },
  deleteAction: {
    backgroundColor: "#FFF1F1",
    borderWidth: 1,
    borderColor: "#F3C7C7",
  },
  deleteActionText: { color: PSU.danger },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(10,16,24,0.45)",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    backgroundColor: PSU.white,
    borderRadius: 22,
    padding: 18,
    maxHeight: "90%",
  },
  modalTitle: { color: PSU.text, fontSize: 22, fontWeight: "900", marginBottom: 14 },

  segmentRow: {
    flexDirection: "row",
    backgroundColor: PSU.light,
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentBtnActive: { backgroundColor: PSU.blue },
  segmentBtnText: { color: PSU.blue, fontWeight: "800" },
  segmentBtnTextActive: { color: PSU.white },

  fieldLabel: {
    color: PSU.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: PSU.text,
  },
  helperText: { color: PSU.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  pickerWrap: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: PSU.border,
    borderRadius: 12,
    backgroundColor: PSU.light,
  },

  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  dayChip: {
    borderWidth: 1,
    borderColor: PSU.border,
    backgroundColor: PSU.white,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dayChipActive: {
    backgroundColor: PSU.blue,
    borderColor: PSU.blue,
  },
  dayChipText: { color: PSU.blue, fontWeight: "800", fontSize: 12 },
  dayChipTextActive: { color: PSU.white },

  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  modalCancelBtn: {
    backgroundColor: PSU.light,
    borderWidth: 1,
    borderColor: PSU.border,
  },
  modalSaveBtn: { backgroundColor: PSU.blue },
  modalCancelText: { color: PSU.text, fontWeight: "800" },
  modalSaveText: { color: PSU.white, fontWeight: "900" },
});

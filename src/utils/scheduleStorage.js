import AsyncStorage from "@react-native-async-storage/async-storage";

const SCHEDULE_KEY = "psu_abington_guest_schedule_v1";

export async function loadSchedule() {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.log("Failed to load schedule:", error);
    return [];
  }
}

export async function saveSchedule(items) {
  try {
    await AsyncStorage.setItem(SCHEDULE_KEY, JSON.stringify(items));
    return true;
  } catch (error) {
    console.log("Failed to save schedule:", error);
    return false;
  }
}

export async function addScheduleItem(item) {
  const current = await loadSchedule();
  const updated = [item, ...current];
  await saveSchedule(updated);
  return updated;
}

export async function deleteScheduleItem(id) {
  const current = await loadSchedule();
  const updated = current.filter((item) => item.id !== id);
  await saveSchedule(updated);
  return updated;
}

export async function clearSchedule() {
  try {
    await AsyncStorage.removeItem(SCHEDULE_KEY);
    return true;
  } catch (error) {
    console.log("Failed to clear schedule:", error);
    return false;
  }
}
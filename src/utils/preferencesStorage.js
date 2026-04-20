import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESSIBILITY_MODE_KEY = "waypoints_accessibility_mode";

export async function saveAccessibilityMode(enabled) {
  try {
    await AsyncStorage.setItem(
      ACCESSIBILITY_MODE_KEY,
      JSON.stringify(Boolean(enabled))
    );
    return true;
  } catch (error) {
    console.log("Failed to save accessibility mode:", error);
    return false;
  }
}

export async function loadAccessibilityMode() {
  try {
    const raw = await AsyncStorage.getItem(ACCESSIBILITY_MODE_KEY);
    if (raw == null) return false;
    return JSON.parse(raw) === true;
  } catch (error) {
    console.log("Failed to load accessibility mode:", error);
    return false;
  }
}

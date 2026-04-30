// src/utils/logger.js
import * as FileSystem from 'expo-file-system';

const LOG_PATH = FileSystem.documentDirectory + 'nav_debug.log';

export async function writeLog(tag, data) {
  const line = `[${tag}] ${JSON.stringify(data)}\n`;
  try {
    await FileSystem.writeAsStringAsync(LOG_PATH, line, {
      encoding: FileSystem.EncodingType.UTF8,
      append: true,
    });
  } catch (e) {
    // fail silently so logging never crashes the app
  }
}

export async function clearLog() {
  try {
    await FileSystem.writeAsStringAsync(LOG_PATH, '', {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (e) {}
}

export function getLogPath() {
  return LOG_PATH;
}

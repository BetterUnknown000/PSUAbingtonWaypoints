// src/utils/logger.js
// Writes debug logs to a file on device so they can be shared without a console.

import * as FileSystem from 'expo-file-system/legacy';

const LOG_PATH = FileSystem.documentDirectory + 'nav_debug.log';

export async function writeLog(tag, data) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${tag}] ${JSON.stringify(data)}\n`;
  try {
    await FileSystem.writeAsStringAsync(LOG_PATH, line, {
      encoding: FileSystem.EncodingType.UTF8,
      append: true,
    });
  } catch (_) {
    // fail silently — logging should never crash the app
  }
}

export async function clearLog() {
  try {
    await FileSystem.writeAsStringAsync(LOG_PATH, '', {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (_) {}
}

export function getLogPath() {
  return LOG_PATH;
}

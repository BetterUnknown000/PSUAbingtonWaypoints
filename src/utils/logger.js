// src/utils/logger.js
// Writes debug logs to a file on device. Uses a write queue to prevent
// concurrent append race conditions that cause lines to be overwritten.

import * as FileSystem from 'expo-file-system/legacy';

const LOG_PATH = FileSystem.documentDirectory + 'nav_debug.log';

// Queue of lines waiting to be written
const _queue = [];
let _writing = false;

async function _flush() {
  if (_writing || _queue.length === 0) return;
  _writing = true;
  try {
    const batch = _queue.splice(0, _queue.length).join('');
    await FileSystem.writeAsStringAsync(LOG_PATH, batch, {
      encoding: FileSystem.EncodingType.UTF8,
      append: true,
    });
  } catch (_) {
    // fail silently
  } finally {
    _writing = false;
    if (_queue.length > 0) _flush();
  }
}

export function writeLog(tag, data) {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${tag}] ${JSON.stringify(data)}\n`;
  _queue.push(line);
  _flush();
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

/**
 * qrWaypointLookup.js
 *
 * Waypoint/building lookup helpers backed by campusDataLoader.
 * All functions are synchronous — they operate on already-loaded data.
 * Call preloadBuilding() before navigating indoors.
 */

import { findWaypointFromQrPayload, parseQrPayload } from './qrPayload';
import {
  getWaypointById as _getById,
  getBuildingById,
  getBuildingEntrances,
  getAllBuildings,
  getAllEntrances,
  getAllRooms,
  findRoomByNumber,
  preloadBuilding,
} from './campusDataLoader';

// Re-export for backward compatibility
export { preloadBuilding };

export function getWaypointById(id) {
  return _getById(id);
}

export { getBuildingById, getBuildingEntrances, getAllBuildings, getAllEntrances, getAllRooms, findRoomByNumber };

export function getWaypointFromQrCode(rawQrData) {
  try {
    const payload = parseQrPayload(rawQrData);
    if (!payload) return null;
    return findWaypointFromQrPayload(payload) || null;
  } catch {
    return null;
  }
}

// Alias used by NavigationPage
export const findWaypointByQrData = getWaypointFromQrCode;

export function getQrAnchorForWaypoint(waypointId) {
  // QR anchors are now per-building; use the waypoint itself as anchor info
  const wp = _getById(waypointId);
  if (!wp) return null;
  return {
    qr_id: wp.qr_code || waypointId,
    waypoint_id: waypointId,
    building: wp.building,
    floor: wp.floor,
    x: wp.x,
    y: wp.y,
    bearing_hint_deg: wp.bearing_hint_deg ?? null,
  };
}

// src/utils/findRoom.js
import { getAllBuildings as _getAllBuildings, getAllRooms as _getAllRooms, getWaypointById } from './campusDataLoader';

/*
// ---- CONNECTION CHECK ----
console.log("campusData loaded:", {
  buildings: getAllBuildings()?.length ?? "NOT FOUND",
  rooms: _getAllRooms()?.length ?? "NOT FOUND",
  waypoints: _getAllRooms()?.length ?? "NOT FOUND",
});
// ---- END CONNECTION CHECK ----
*/

// Normalize any general string-like value
function normalizeValue(value) {
  return String(value || "").trim();
}

// Normalize building IDs for safe matching
function normalizeBuildingId(value) {
  return normalizeValue(value).toLowerCase();
}

// Normalize room numbers for safe matching
function normalizeRoomNumber(value) {
  return normalizeValue(value).toUpperCase();
}

/**
 * findRoom
 * @param {string} buildingId - e.g. "sutherland"
 * @param {string} roomNumber - e.g. "209", "132B", "G04"
 * @returns {object|null} result object or null if not found
 *
 * Returned object shape:
 * {
 *   room:     { building, room_number, floor, waypoint_id, room_name, capacity, type },
 *   waypoint: { id, building, floor, label, type, x, y, qr_code },
 *   building: { id, name, latitude, longitude, floors, entrances }
 * }
 */
export function findRoom(buildingId, roomNumber) {
  if (!buildingId || !roomNumber) return null;

  const bid = normalizeBuildingId(buildingId);
  const rnum = normalizeRoomNumber(roomNumber);

  // 1. Match room
  const room = (_getAllRooms() || []).find(
    (r) =>
      normalizeBuildingId(r.building) === bid &&
      normalizeRoomNumber(r.room_number) === rnum
  );

  if (!room) return null;

  // 2. Match waypoint
  const waypoint = (_getAllRooms() || []).find(
    (w) => w.id === room.waypoint_id
  );

  // 3. Match building metadata
  const building = (_getAllBuildings() || []).find(
    (b) => normalizeBuildingId(b.id) === bid
  );

  return {
    room,
    waypoint: waypoint || null,
    building: building || null
  };
}

/**
 * findRoomsByBuilding
 * Returns all rooms in a given building.
 * @param {string} buildingId
 * @returns {Array}
 */
export function findRoomsByBuilding(buildingId) {
  if (!buildingId) return [];

  const bid = normalizeBuildingId(buildingId);

  return (_getAllRooms() || []).filter(
    (r) => normalizeBuildingId(r.building) === bid
  );
}

/**
 * getAllBuildings
 * Returns a sorted list of all buildings.
 * @returns {Array}
 */
export function getAllBuildings() {
  return [...(_getAllBuildings() || [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

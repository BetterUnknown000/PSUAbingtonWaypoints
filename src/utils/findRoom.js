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

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

const ROOM_SEARCH_ALIASES = [
  {
    terms: ["cafe", "cafeteria", "dining", "dining room", "food", "lunch"],
    room: {
      building: "lares",
      room_number: "Cafe",
      floor: "1",
      waypoint_id: "wp_dining_room",
      room_name: "Dining Room",
      type: "dining",
    },
    waypoint: {
      id: "wp_dining_room",
      building: "lares",
      floor: "1",
      label: "Dining Room",
      type: "lounge",
    },
  },
  {
    terms: ["lost and found", "lost found", "lost", "found"],
    room: {
      building: "rydal",
      room_number: "106",
      floor: "1",
      waypoint_id: "wp_rydal_106",
      room_name: "Lost and Found",
      type: "office",
    },
    waypoint: {
      id: "wp_rydal_106",
      building: "rydal",
      floor: "1",
      label: "Room 106",
      type: "office",
    },
  },
  {
    terms: ["library", "woodland library", "wood library"],
    room: {
      building: "woodland",
      room_number: "Library",
      floor: "1",
      waypoint_id: "wp_wood_library_f1",
      room_name: "Woodland Library",
      type: "library",
    },
    waypoint: {
      id: "wp_wood_library_f1",
      building: "woodland",
      floor: "1",
      label: "Woodland Library",
      type: "office",
    },
  },
];

function queryMatchesTerm(query, term) {
  const q = normalizeSearchText(query);
  const t = normalizeSearchText(term);
  if (!q || !t) return false;
  return q === t || compactSearchText(q) === compactSearchText(t);
}

function roomMatchesQuery(room, query) {
  const q = normalizeSearchText(query);
  if (!q) return false;

  const fields = [
    room.room_number,
    `room ${room.room_number || ""}`,
    room.room_name,
    room.type,
  ]
    .map(normalizeSearchText)
    .filter(Boolean);

  const compactQuery = compactSearchText(q);
  return fields.some((field) => {
    const compactField = compactSearchText(field);
    return (
      field === q ||
      compactField === compactQuery ||
      field.startsWith(`${q} `) ||
      field.includes(` ${q}`)
    );
  });
}

function getAliasMatch(query, buildingId = null) {
  const bid = buildingId ? normalizeBuildingId(buildingId) : null;
  return ROOM_SEARCH_ALIASES.find((alias) => {
    if (bid && normalizeBuildingId(alias.room.building) !== bid) return false;
    return alias.terms.some((term) => queryMatchesTerm(query, term));
  }) || null;
}

function buildRoomResult(room, fallbackWaypoint = null) {
  if (!room) return null;

  const waypoint = getWaypointById(room.waypoint_id) || fallbackWaypoint || (room.waypoint_id ? {
    id: room.waypoint_id,
    building: room.building,
    floor: room.floor,
    label: room.room_name || `Room ${room.room_number}`,
    type: room.type || 'classroom',
  } : null);

  const building = (_getAllBuildings() || []).find(
    (b) => normalizeBuildingId(b.id) === normalizeBuildingId(room.building)
  );

  return {
    room,
    waypoint: waypoint || null,
    building: building || null
  };
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
  let room = (_getAllRooms() || []).find(
    (r) =>
      normalizeBuildingId(r.building) === bid &&
      normalizeRoomNumber(r.room_number) === rnum
  );

  if (!room) {
    const alias = getAliasMatch(roomNumber, buildingId);
    if (alias) return buildRoomResult(alias.room, alias.waypoint);

    room = (_getAllRooms() || []).find(
      (r) => normalizeBuildingId(r.building) === bid && roomMatchesQuery(r, roomNumber)
    );
  }

  if (!room) return null;

  // 2. Match waypoint — look it up by ID from the loaded building cache.
  // If the building hasn't been loaded yet (before QR scan), the cache will
  // be empty, so fall back to the room record itself which has x/y/floor.
  const waypoint = getWaypointById(room.waypoint_id) || (room.waypoint_id ? {
    id: room.waypoint_id,
    building: room.building,
    floor: room.floor,
    label: room.room_name || `Room ${room.room_number}`,
    type: room.type || 'classroom',
  } : null);

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

export function findRoomByQuery(query, options = {}) {
  const search = normalizeValue(query);
  if (!search) return null;

  if (options.buildingId) {
    const buildingScoped = findRoom(options.buildingId, search);
    if (buildingScoped) return buildingScoped;
  }

  const alias = getAliasMatch(search);
  if (alias) return buildRoomResult(alias.room, alias.waypoint);

  const room = (_getAllRooms() || []).find((r) => roomMatchesQuery(r, search));
  return room ? buildRoomResult(room) : null;
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

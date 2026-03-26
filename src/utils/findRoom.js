
// src/utils/findRoom.js
import campusData from "../data/campusData.json";

// ---- CONNECTION CHECK ----
console.log("campusData loaded:", {
    buildings: campusData.buildings?.length ?? "NOT FOUND",
    rooms:     campusData.rooms?.length     ?? "NOT FOUND",
    waypoints: campusData.waypoints?.length ?? "NOT FOUND",
});
// ---- END CONNECTION CHECK ----

/**
 * findRoom
 * @param {string} buildingId   - e.g. "sutherland"
 * @param {string} roomNumber   - e.g. "209", "132B", "G04"
 * @returns {object|null}  result object or null if not found
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

    const bid = String(buildingId).trim().toLowerCase();
    const rnum = String(roomNumber).trim().toLowerCase();

    // 1. Match room
    const room = (campusData.rooms || []).find(
        (r) =>
            String(r.building).toLowerCase() === bid &&
            String(r.room_number).toLowerCase() === rnum
    );
    if (!room) return null;

    // 2. Match waypoint
    const waypoint = (campusData.waypoints || []).find(
        (w) => w.id === room.waypoint_id
    );

    // 3. Match building metadata
    const building = (campusData.buildings || []).find(
        (b) => String(b.id).toLowerCase() === bid
    );

    return { room, waypoint: waypoint || null, building: building || null };
}

/**
 * findRoomsByBuilding
 * Returns all rooms in a given building.
 * @param {string} buildingId
 * @returns {Array}
 */
export function findRoomsByBuilding(buildingId) {
    if (!buildingId) return [];
    const bid = String(buildingId).trim().toLowerCase();
    return (campusData.rooms || []).filter(
        (r) => String(r.building).toLowerCase() === bid
    );
}

/**
 * getAllBuildings
 * Returns sorted list of buildings.
 * @returns {Array}
 */
export function getAllBuildings() {
    return [...(campusData.buildings || [])].sort((a, b) =>
        String(a.name).localeCompare(String(b.name))
    );
}
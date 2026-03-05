import campusData from "../data/campusData.json";
import courseData from "../data/courseData.json";

export function findRoom(buildingId, roomNumber) {
  if (!buildingId || !roomNumber) return null;

  const bid = String(buildingId).trim().toLowerCase();
  const rnum = String(roomNumber).trim().toLowerCase();

  const room = (campusData.rooms || []).find(
    (r) =>
      String(r.building).toLowerCase() === bid &&
      String(r.room_number).toLowerCase() === rnum
  );
  if (!room) return null;

  const waypoint = (campusData.waypoints || []).find((w) => w.id === room.waypoint_id) || null;

  const building =
    (campusData.buildings || []).find((b) => String(b.id).toLowerCase() === bid) || null;

  return { room, waypoint, building };
}

export function getAllBuildings() {
  return [...(campusData.buildings || [])].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

export function countRoomsInBuilding(buildingId) {
  const bid = String(buildingId || "").trim().toLowerCase();
  return (campusData.rooms || []).filter((r) => String(r.building).toLowerCase() === bid).length;
}

export function findCourse(courseText) {
  const q = String(courseText || "").trim().toLowerCase();
  if (!q) return null;

  const hit = (courseData.courses || []).find(
    (c) => String(c.course).trim().toLowerCase() === q
  );

  if (!hit) return null;

  // Convert course -> room search
  const result = findRoom(hit.building, hit.room_number);
  return result
    ? { ...result, course: hit.course }
    : null;
}
import campusData from "../data/campusData.json";
import { findWaypointFromQrPayload, parseQrPayload } from "./qrPayload";
 
function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
 
export function getWaypointById(id) {
  return (campusData.waypoints || []).find((w) => w.id === id) || null;
}
 
export function getBuildingById(id) {
  return (
    (campusData.buildings || []).find(
      (b) => normalize(b.id) === normalize(id)
    ) || null
  );
}
 
export function getBuildingEntrances(buildingId) {
  const building = getBuildingById(buildingId);
 
  if (!building || !Array.isArray(building.entrances)) {
    return [];
  }
 
  return building.entrances
    .map((id) => getWaypointById(id))
    .filter(Boolean);
}
 
export function isAtBuildingEntrance(waypointId, buildingId) {
  const building = getBuildingById(buildingId);
 
  if (!building || !Array.isArray(building.entrances)) {
    return false;
  }
 
  return building.entrances.includes(waypointId);
}
 
export function findWaypointByQrData(qrData) {
  const payload = parseQrPayload(qrData);
  const payloadMatch = findWaypointFromQrPayload(payload);
 
  if (payloadMatch) {
    // Merge payload fields into the waypoint — v3 QR x/y overrides campusData
    return {
      ...payloadMatch,
      ...(payload?.x != null ? { x: payload.x } : {}),
      ...(payload?.y != null ? { y: payload.y } : {}),
      ...(payload?.role ? { role: payload.role } : {}),
      ...(payload?.graph_rev ? { graph_rev: payload.graph_rev } : {}),
    };
  }
 
  const normalized = normalize(qrData);
 
  return (
    (campusData.waypoints || []).find((w) => {
      return (
        normalize(w.id) === normalized ||
        normalize(w.qr_code) === normalized
      );
    }) || null
  );
}
 

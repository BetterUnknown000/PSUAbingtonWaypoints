const campusData = require("../src/data/campusData.json");

const APP_SCHEME = "psuabingtonwaypoints";
const QR_NAVIGATION_ROUTE = "navigation";
const QR_PAYLOAD_VERSION = 3;
const GRAPH_REV = "2026-04-28";

const TARGET_TYPES = new Set(["entrance", "stairs", "hallway", "hall"]);
const CATEGORY_BY_TYPE = {
  entrance: "entrance",
  stairs: "stairs",
  hallway: "hall",
  hall: "hall",
};

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function targetCategoryFor(waypoint) {
  return CATEGORY_BY_TYPE[normalize(waypoint && waypoint.type)] || null;
}

function isQrTarget(waypoint) {
  if (!waypoint || !waypoint.id || !waypoint.building) return false;
  if (waypoint.qr_deployed === false) return false;
  return TARGET_TYPES.has(normalize(waypoint.type));
}

function getWaypointQrId(waypoint) {
  return waypoint.id;
}

function getQrFilename(waypoint) {
  return `${waypoint.id}.png`;
}

function deriveRole(waypoint) {
  const type = normalize(waypoint && waypoint.type);
  if (type === "entrance") return "entrance";
  if (type === "stairs") return "stairs";
  if (type === "hallway" || type === "hall") return "hallway";
  return "anchor";
}

function buildAppUrl(waypoint) {
  const role = deriveRole(waypoint);
  const params = [
    ["v", QR_PAYLOAD_VERSION],
    ["qr_id", getWaypointQrId(waypoint)],
    ["waypoint_id", waypoint.id],
    ["building", waypoint.building],
    ["floor", waypoint.floor],
    ["x", waypoint.x ?? ""],
    ["y", waypoint.y ?? ""],
    ["lat", waypoint.latitude ?? ""],
    ["lng", waypoint.longitude ?? ""],
    ["bearing_hint_deg", waypoint.bearing_hint_deg ?? ""],
    ["label", waypoint.label],
    ["type", waypoint.type],
    ["role", role],
    ["graph_rev", GRAPH_REV],
    ["qr_deployed", waypoint.qr_deployed ?? true],
    ["requires_scan", waypoint.requires_scan ?? false],
    ["stop_radius_m", waypoint.stop_radius_m ?? 3],
    ["approach_latitude", waypoint.approach_latitude ?? ""],
    ["approach_longitude", waypoint.approach_longitude ?? ""],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}?${params}`;
}

function buildPayload(waypoint) {
  return {
    version: QR_PAYLOAD_VERSION,
    qr_id: getWaypointQrId(waypoint),
    waypoint_id: waypoint.id,
    building: waypoint.building,
    floor: waypoint.floor,
    x: waypoint.x ?? null,
    y: waypoint.y ?? null,
    latitude: waypoint.latitude ?? null,
    longitude: waypoint.longitude ?? null,
    bearing_hint_deg: waypoint.bearing_hint_deg ?? null,
    label: waypoint.label,
    type: waypoint.type,
    role: deriveRole(waypoint),
    graph_rev: GRAPH_REV,
    qr_deployed: waypoint.qr_deployed ?? true,
    requires_scan: waypoint.requires_scan ?? false,
    stop_radius_m: waypoint.stop_radius_m ?? 3,
    approach_latitude: waypoint.approach_latitude ?? null,
    approach_longitude: waypoint.approach_longitude ?? null,
    app_url: buildAppUrl(waypoint),
  };
}

function getQrTargets() {
  const targets = (campusData.waypoints || [])
    .filter(isQrTarget)
    .map((waypoint) => ({
      waypoint,
      category: targetCategoryFor(waypoint),
    }));

  return Array.from(new Map(targets.map((item) => [item.waypoint.id, item])).values());
}

module.exports = {
  APP_SCHEME,
  QR_NAVIGATION_ROUTE,
  QR_PAYLOAD_VERSION,
  GRAPH_REV,
  TARGET_TYPES,
  buildAppUrl,
  buildPayload,
  deriveRole,
  getQrFilename,
  getQrTargets,
  getWaypointQrId,
  isQrTarget,
};

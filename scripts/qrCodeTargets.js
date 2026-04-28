const campusData = require("../src/data/campusData.json");

const APP_SCHEME = "psuabingtonwaypoints";
const QR_NAVIGATION_ROUTE = "navigation";
const QR_PAYLOAD_VERSION = 3;
const GRAPH_REV = "2026-04-27";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasQrCode(waypoint) {
  return Boolean(waypoint && waypoint.id && waypoint.qr_code);
}

function deriveRole(waypoint) {
  const type = String(waypoint?.type || "").toLowerCase();
  if (type === "entrance") return "entrance";
  if (type === "stairs") return "stairs";
  if (type === "elevator") return "elevator";
  if (type === "exit") return "exit";
  return "anchor";
}

function isPublicEntrance(waypoint) {
  if (!hasQrCode(waypoint) || waypoint.type !== "entrance") return false;
  const label = normalize(waypoint.label);
  return !label.startsWith("room ");
}

function isElevator(waypoint) {
  return hasQrCode(waypoint) && waypoint.type === "elevator";
}

function isStairs(waypoint) {
  return hasQrCode(waypoint) && waypoint.type === "stairs";
}

function isHallwayAnchor(waypoint) {
  return hasQrCode(waypoint) && waypoint.type === "hallway";
}

function buildAppUrl(waypoint) {
  const role = deriveRole(waypoint);
  const params = [
    ["v", QR_PAYLOAD_VERSION],
    ["qr_id", waypoint.qr_code],
    ["waypoint_id", waypoint.id],
    ["building", waypoint.building],
    ["floor", waypoint.floor],
    ["x", waypoint.x ?? ""],
    ["y", waypoint.y ?? ""],
    ["lat", waypoint.latitude ?? ""],
    ["lng", waypoint.longitude ?? ""],
    ["label", waypoint.label],
    ["type", waypoint.type],
    ["role", role],
    ["graph_rev", GRAPH_REV],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}?${params}`;
}

function buildPayload(waypoint) {
  return {
    version: QR_PAYLOAD_VERSION,
    qr_id: waypoint.qr_code,
    waypoint_id: waypoint.id,
    building: waypoint.building,
    floor: waypoint.floor,
    x: waypoint.x ?? null,
    y: waypoint.y ?? null,
    latitude: waypoint.latitude ?? null,
    longitude: waypoint.longitude ?? null,
    label: waypoint.label,
    type: waypoint.type,
    role: deriveRole(waypoint),
    graph_rev: GRAPH_REV,
    app_url: buildAppUrl(waypoint),
  };
}

function getQrTargets() {
  const targets = [
    ...(campusData.waypoints || []).filter(isPublicEntrance).map((waypoint) => ({ waypoint, category: "entrance" })),
    ...(campusData.waypoints || []).filter(isElevator).map((waypoint) => ({ waypoint, category: "elevator" })),
    ...(campusData.waypoints || []).filter(isStairs).map((waypoint) => ({ waypoint, category: "stairs" })),
    ...(campusData.waypoints || []).filter(isHallwayAnchor).map((waypoint) => ({ waypoint, category: "hallway" })),
  ];

  return Array.from(new Map(targets.map((item) => [item.waypoint.id, item])).values());
}

module.exports = { buildAppUrl, buildPayload, getQrTargets };

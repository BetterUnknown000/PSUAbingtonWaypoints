const campusData = require("../src/data/campusData.json");

const APP_SCHEME = "psuabingtonwaypoints";
const QR_NAVIGATION_ROUTE = "navigation";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasQrCode(waypoint) {
  return Boolean(waypoint && waypoint.id && waypoint.qr_code);
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

function buildAppUrl(waypoint) {
  const params = [
    ["startWaypointId", waypoint.id],
    ["startQrId", waypoint.qr_code],
    ["building", waypoint.building],
    ["floor", waypoint.floor],
    ["latitude", waypoint.latitude],
    ["longitude", waypoint.longitude],
    ["label", waypoint.label],
    ["type", waypoint.type],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
    )
    .join("&");

  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}?${params}`;
}

function buildPayload(waypoint) {
  return {
    version: 2,
    qr_id: waypoint.qr_code,
    waypoint_id: waypoint.id,
    building: waypoint.building,
    floor: waypoint.floor,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    label: waypoint.label,
    type: waypoint.type,
    app_url: buildAppUrl(waypoint),
  };
}

function getQrTargets() {
  const targets = [
    ...(campusData.waypoints || [])
      .filter(isPublicEntrance)
      .map((waypoint) => ({ waypoint, category: "entrance" })),
    ...(campusData.waypoints || [])
      .filter(isElevator)
      .map((waypoint) => ({ waypoint, category: "elevator" })),
    ...(campusData.waypoints || [])
      .filter(isStairs)
      .map((waypoint) => ({ waypoint, category: "stairs" })),
  ];

  return Array.from(
    new Map(targets.map((item) => [item.waypoint.id, item])).values()
  );
}

module.exports = {
  buildAppUrl,
  buildPayload,
  getQrTargets,
};

import campusData from "../data/campusData.json";

export const APP_SCHEME = "psuabingtonwaypoints";
export const QR_NAVIGATION_ROUTE = "navigation";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function encodePart(value) {
  return encodeURIComponent(String(value ?? ""));
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildWaypointDeepLink(waypoint) {
  if (!waypoint) return "";

  const params = [
    ["startWaypointId", waypoint.waypoint_id || waypoint.id],
    ["startQrId", waypoint.qr_id || waypoint.qr_code],
    ["building", waypoint.building],
    ["floor", waypoint.floor],
    ["latitude", waypoint.latitude],
    ["longitude", waypoint.longitude],
    ["label", waypoint.label],
    ["type", waypoint.type],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodePart(key)}=${encodePart(value)}`)
    .join("&");

  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}${params ? `?${params}` : ""}`;
}

export function buildQrPayloadObject(waypoint) {
  if (!waypoint) return null;

  return {
    version: 2,
    qr_id: waypoint.qr_code || waypoint.qr_id,
    waypoint_id: waypoint.id || waypoint.waypoint_id,
    building: waypoint.building,
    floor: waypoint.floor,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    label: waypoint.label,
    type: waypoint.type,
    app_url: buildWaypointDeepLink(waypoint),
  };
}

export function parseQrDeepLink(qrData) {
  const raw = String(qrData || "").trim();
  if (!raw) return null;

  try {
    const parsedUrl = new URL(raw);
    const scheme = String(parsedUrl.protocol || "").replace(/:$/, "");
    if (scheme !== APP_SCHEME) return null;

    const routeName = normalize(parsedUrl.hostname || parsedUrl.pathname);
    if (routeName !== QR_NAVIGATION_ROUTE) return null;

    const params = parsedUrl.searchParams;

    return {
      version: 2,
      qr_id: params.get("startQrId") || params.get("qr_id") || "",
      waypoint_id:
        params.get("startWaypointId") || params.get("waypoint_id") || "",
      building: params.get("building") || "",
      floor: params.get("floor") || "",
      latitude:
        toNumberOrNull(params.get("latitude")) ??
        toNumberOrNull(params.get("lat")),
      longitude:
        toNumberOrNull(params.get("longitude")) ??
        toNumberOrNull(params.get("lng")),
      label: params.get("label") || "",
      type: params.get("type") || "",
      app_url: raw,
    };
  } catch {
    return null;
  }
}

export function parseQrPayload(qrData) {
  const raw = String(qrData || "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return parseQrDeepLink(raw);
  }
}

export function findWaypointFromQrPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const normalizedWaypointId = normalize(payload.waypoint_id);
  const normalizedQrId = normalize(payload.qr_id);

  return (
    (campusData.waypoints || []).find((waypoint) => {
      return (
        normalize(waypoint.id) === normalizedWaypointId ||
        normalize(waypoint.qr_code) === normalizedQrId
      );
    }) || null
  );
}

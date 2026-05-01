import { getAllBuildings, getAllRooms, getWaypointById, getAllEntrances } from '../utils/campusDataLoader';
 
export const APP_SCHEME = "psuabingtonwaypoints";
export const QR_NAVIGATION_ROUTE = "navigation";
export const QR_PAYLOAD_VERSION = 3;
 
// Graph revision — bump this whenever campusData.json edges change significantly
// so the app can detect stale QR codes in the future.
export const GRAPH_REV = "2026-04-28";
 
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
 
/**
 * Build a v3 deep-link URL for a waypoint.
 * Includes x/y floor-map coordinates, role, bearing hint, and graph revision.
 * These fields let the app recover an accurate indoor pose directly from the QR
 * without relying on bundled campusData — useful when data is stale.
 */
export function buildWaypointDeepLink(waypoint) {
  if (!waypoint) return "";
 
  const role = deriveRole(waypoint);
 
  const params = [
    ["v", QR_PAYLOAD_VERSION],
    ["qr_id", waypoint.qr_code || waypoint.qr_id],
    ["waypoint_id", waypoint.waypoint_id || waypoint.id],
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
    .map(([key, value]) => `${encodePart(key)}=${encodePart(value)}`)
    .join("&");
 
  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}${params ? `?${params}` : ""}`;
}
 
/**
 * Build a v3 payload object for a waypoint (used for JSON QR codes).
 */
export function buildQrPayloadObject(waypoint) {
  if (!waypoint) return null;
 
  const role = deriveRole(waypoint);
 
  return {
    version: QR_PAYLOAD_VERSION,
    qr_id: waypoint.qr_code || waypoint.qr_id,
    waypoint_id: waypoint.id || waypoint.waypoint_id,
    building: waypoint.building,
    floor: waypoint.floor,
    x: waypoint.x ?? null,
    y: waypoint.y ?? null,
    latitude: waypoint.latitude ?? null,
    longitude: waypoint.longitude ?? null,
    bearing_hint_deg: waypoint.bearing_hint_deg ?? null,
    label: waypoint.label,
    type: waypoint.type,
    role,
    graph_rev: GRAPH_REV,
    qr_deployed: waypoint.qr_deployed ?? true,
    requires_scan: waypoint.requires_scan ?? false,
    stop_radius_m: waypoint.stop_radius_m ?? 3,
    approach_latitude: waypoint.approach_latitude ?? null,
    approach_longitude: waypoint.approach_longitude ?? null,
    app_url: buildWaypointDeepLink(waypoint),
  };
}
 
/**
 * Parse a QR deep-link URL (v2 or v3).
 * v3 adds: x, y, role, graph_rev fields.
 * v2 QR codes still work — missing fields are filled from campusData.
 */
export function parseQrDeepLink(qrData) {
  const raw = String(qrData || "").trim();
  if (!raw) return null;
 
  try {
    const parsedUrl = new URL(raw);
    const scheme = String(parsedUrl.protocol || "").replace(/:$/, "");
    if (scheme !== APP_SCHEME) return null;
 
    const routeName = normalize(parsedUrl.hostname || parsedUrl.pathname);
    if (routeName !== QR_NAVIGATION_ROUTE) return null;
 
    const p = parsedUrl.searchParams;
    const version = toNumberOrNull(p.get("v")) ?? 2;
 
    return {
      version,
      qr_id: p.get("qr_id") || p.get("startQrId") || "",
      waypoint_id: p.get("waypoint_id") || p.get("startWaypointId") || "",
      building: p.get("building") || "",
      floor: p.get("floor") || "",
      // v3 fields
      x: toNumberOrNull(p.get("x")),
      y: toNumberOrNull(p.get("y")),
      latitude: toNumberOrNull(p.get("lat")) ?? toNumberOrNull(p.get("latitude")),
      longitude: toNumberOrNull(p.get("lng")) ?? toNumberOrNull(p.get("longitude")),
      bearing_hint_deg: toNumberOrNull(p.get("bearing_hint_deg")),
      label: p.get("label") || "",
      type: p.get("type") || "",
      role: p.get("role") || p.get("type") || "",
      graph_rev: p.get("graph_rev") || null,
      qr_deployed: p.get("qr_deployed"),
      requires_scan: p.get("requires_scan"),
      stop_radius_m: toNumberOrNull(p.get("stop_radius_m")),
      approach_latitude: toNumberOrNull(p.get("approach_latitude")),
      approach_longitude: toNumberOrNull(p.get("approach_longitude")),
      app_url: raw,
    };
  } catch {
    return null;
  }
}
 
/**
 * Parse any QR string — JSON object or deep-link URL.
 * Always returns a normalized payload with x/y filled from campusData
 * if not present in the QR itself (backward compat with v2).
 */
export function parseQrPayload(qrData) {
  const raw = String(qrData || "").trim();
  if (!raw) return null;
 
  let payload = null;
 
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      payload = parsed;
    }
  } catch {
    payload = parseQrDeepLink(raw);
  }
 
  if (!payload) return null;
 
  // Backfill x/y from campusData if the QR is v2 (no x/y embedded)
  if (payload.x == null || payload.y == null) {
    const wp = findWaypointFromQrPayload(payload);
    if (wp) {
      payload = {
        ...payload,
        x: wp.x ?? null,
        y: wp.y ?? null,
        latitude: payload.latitude ?? wp.latitude ?? null,
        longitude: payload.longitude ?? wp.longitude ?? null,
        type: payload.type || wp.type || "",
        role: payload.role || deriveRole(wp),
        building: payload.building || wp.building || "",
        floor: payload.floor || wp.floor || "",
        label: payload.label || wp.label || "",
      };
    }
  }
 
  const toBool = (v) => v === true || v === "true" || v === 1 || v === "1";
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    ...payload,
    version: Number(payload.version ?? QR_PAYLOAD_VERSION),
    x: toNum(payload.x),
    y: toNum(payload.y),
    bearing_hint_deg: toNum(payload.bearing_hint_deg),
    stop_radius_m: toNum(payload.stop_radius_m),
    qr_deployed: payload.qr_deployed == null ? true : toBool(payload.qr_deployed),
    requires_scan: payload.requires_scan == null ? false : toBool(payload.requires_scan),
    approach_latitude: toNum(payload.approach_latitude),
    approach_longitude: toNum(payload.approach_longitude),
  };
}
 
/**
 * Look up the waypoint object from a parsed payload.
 * Checks waypoint_id first, then qr_id/qr_code.
 */
export function findWaypointFromQrPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
 
  const normalizedWaypointId = normalize(payload.waypoint_id);
  const normalizedQrId = normalize(payload.qr_id);
 
  return (
    (getAllEntrances()).find((waypoint) => {
      return (
        (normalizedWaypointId && normalize(waypoint.id) === normalizedWaypointId) ||
        (normalizedQrId && normalize(waypoint.qr_code) === normalizedQrId)
      );
    }) || null
  );
}
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
/**
 * Derive the QR role from a waypoint's type.
 * Role is used by the nav reducer to decide what transition to make.
 */
export function deriveRole(waypoint) {
  const type = String(waypoint?.type || "").toLowerCase();
  if (type === "entrance") return "entrance";
  if (type === "stairs") return "stairs";
  if (type === "elevator") return "elevator";
  if (type === "exit") return "exit";
  return "anchor";
}

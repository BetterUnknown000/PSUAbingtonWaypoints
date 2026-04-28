/**
 * qrPayloadValidation.js
 *
 * Validates a parsed QR payload before it is used to set an indoor anchor.
 * Prevents zero x/y, stale graph revisions, and missing required fields
 * from silently corrupting the indoor pose.
 */
 
import { GRAPH_REV } from "./qrPayload";
 
/**
 * Roles that require valid non-zero indoor x/y to be useful as anchors.
 */
const INDOOR_ANCHOR_ROLES = new Set([
  "hallway",
  "stairs",
  "elevator",
  "anchor",
]);
 
/**
 * Validate a parsed QR payload.
 *
 * Returns { ok: true } if the payload is safe to use as an indoor anchor.
 * Returns { ok: false, reason: string } if it should be rejected or downgraded.
 *
 * @param {object} payload - parsed QR payload from parseQrPayload()
 * @param {string} activeGraphRev - current GRAPH_REV constant
 */
export function validateQrAnchor(payload, activeGraphRev = GRAPH_REV) {
  if (!payload) return { ok: false, reason: "empty_qr" };
 
  // Stale graph revision — data may have changed since this QR was printed
  if (
    payload.graph_rev &&
    activeGraphRev &&
    payload.graph_rev !== activeGraphRev
  ) {
    return { ok: false, reason: "stale_qr" };
  }
 
  const role = String(payload.role || payload.type || "").toLowerCase();
 
  // Entrance QRs only need GPS — they don't need indoor x/y to be useful
  // They anchor the outdoor→indoor transition, not the indoor pose itself
  if (role === "entrance") {
    if (!payload.building) {
      return { ok: false, reason: "missing_building" };
    }
    return { ok: true };
  }
 
  // All other indoor anchor roles require valid non-zero x/y
  if (INDOOR_ANCHOR_ROLES.has(role)) {
    const x = Number(payload.x);
    const y = Number(payload.y);
 
    const hasValidXY =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      !(x === 0 && y === 0);
 
    if (!payload.building) {
      return { ok: false, reason: "missing_building" };
    }
 
    if (!payload.floor) {
      return { ok: false, reason: "missing_floor" };
    }
 
    if (!hasValidXY) {
      return { ok: false, reason: "invalid_indoor_anchor" };
    }
  }
 
  return { ok: true };
}
 
/**
 * Returns a user-friendly message for a validation failure reason.
 */
export function getValidationMessage(reason) {
  switch (reason) {
    case "empty_qr":
      return "QR code could not be read. Try scanning again.";
    case "stale_qr":
      return "This QR code is outdated. Please update the QR poster.";
    case "invalid_indoor_anchor":
      return "This location is not yet mapped for indoor navigation.";
    case "missing_building":
    case "missing_floor":
      return "QR code is missing location data. Try a different QR.";
    default:
      return "QR code could not be used for navigation.";
  }
}
 

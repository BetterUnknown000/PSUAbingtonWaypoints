/**
 * qrPayloadValidation.js
 *
 * Validates a parsed QR payload before it is used to set an indoor anchor.
 * Prevents zero x/y, stale graph revisions, and missing required fields
 * from silently corrupting the indoor pose.
 */

import { GRAPH_REV } from "./qrPayload";

/**
 * Roles that require a building field to be useful.
 */
const ROLES_NEEDING_BUILDING = new Set([
  "entrance",
  "hallway",
  "hallway_anchor",
  "stairs",
  "elevator",
  "anchor",
  "exit",
]);

/**
 * Roles that require a floor field to be useful.
 */
const ROLES_NEEDING_FLOOR = new Set([
  "hallway",
  "hallway_anchor",
  "stairs",
  "elevator",
  "anchor",
  "exit",
]);

/**
 * Roles that require valid non-zero indoor x/y to be useful as anchors.
 * NOTE: "entrance" is intentionally excluded — entrances only need building/floor
 * to get the user inside; precise x/y is not required to begin indoor routing.
 */
const ROLES_NEEDING_INDOOR_XY = new Set([
  "hallway",
  "hallway_anchor",
  "stairs",
  "elevator",
  "anchor",
  "exit",
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

  if (payload.qr_deployed === false) {
    return { ok: false, reason: "inactive_qr" };
  }

  // Reject QRs whose graph_rev is strictly older than the app's current
  // revision (YYYY-MM-DD string comparison works correctly for date ordering).
  // A QR that is newer than the installed app is still valid — only stale
  // (older) revisions require a poster update.
  if (
    payload.graph_rev &&
    activeGraphRev &&
    payload.graph_rev < activeGraphRev
  ) {
    return { ok: false, reason: "stale_qr" };
  }

  const role = String(payload.role || payload.type || "").toLowerCase();

  // Building is required for all known indoor/entrance roles
  if (ROLES_NEEDING_BUILDING.has(role) && !payload.building) {
    return { ok: false, reason: "missing_building" };
  }

  // Floor is required for all routing roles (entrance is exempt —
  // the user just needs to get inside, floor can be inferred from the scan)
  if (ROLES_NEEDING_FLOOR.has(role) && !payload.floor) {
    return { ok: false, reason: "missing_floor" };
  }

  // x/y coordinates required for precise indoor anchor roles
  const needsIndoorXY =
    ROLES_NEEDING_INDOOR_XY.has(role) || payload.requires_scan === true;

  if (needsIndoorXY) {
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      (x === 0 && y === 0)
    ) {
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
    case "unsupported_qr":
      return "This QR code format is not supported. Please use a current poster.";
    case "inactive_qr":
      return "This QR code is not active. Please use a deployed poster.";
    case "stale_qr":
      return "This QR code is outdated. Please update the QR poster.";
    case "missing_xy":
    case "invalid_indoor_anchor":
      return "This location is not yet mapped for indoor navigation.";
    case "missing_building":
    case "missing_floor":
      return "QR code is missing location data. Try a different QR.";
    default:
      return "QR code could not be used for navigation.";
  }
}

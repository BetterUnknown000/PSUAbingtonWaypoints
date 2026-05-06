/**
 * routeSteps.js
 *
 * Turn-by-turn step instruction builder for indoor and outdoor navigation.
 * Also provides outdoor route-advancement helpers used by NavigationPage.jsx.
 *
 * Re-exports getNextWaypointId and isAtDestination from routeState.js for
 * backward compatibility (callers that import from here still work).
 */

import { getWaypointById } from './campusDataLoader';
import { haversineDistanceMeters } from './location';

// Re-export for backward compatibility — pathfinding.js and NavigationPage.jsx
// import these from routeSteps; the real implementations live in routeState.js
// to break the circular dependency: pathfinding → routeSteps → pathfinding.
export { getNextWaypointId, isAtDestination } from './routeState';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Bearing from `from` to `to` using floor-map x/y coordinates (degrees).
 * 0° = up on the map, 90° = right, 180° = down, 270° = left.
 */
function computeBearingDeg(from, to) {
  if (!from || !to || from.x == null || from.y == null || to.x == null || to.y == null) {
    return null;
  }
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  return Math.atan2(dx, -dy) * (180 / Math.PI);
}

/**
 * Signed angular difference b − a, normalised to (−180, 180].
 * Negative = left turn, positive = right turn.
 */
function angleDiff(a, b) {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return diff;
}

/**
 * Returns a human-readable turn label, or null when the path is straight.
 */
function turnLabel(diffDeg) {
  const d = Math.abs(diffDeg);
  if (d < 20)  return null;                                          // straight
  if (d < 70)  return diffDeg < 0 ? 'slight left'  : 'slight right';
  if (d < 120) return diffDeg < 0 ? 'left'         : 'right';
  return               diffDeg < 0 ? 'sharp left'  : 'sharp right';
}

/**
 * Build a single step instruction string for waypoint `wp`.
 * Uses the previous and next waypoints (when available) to compute turn angle.
 */
function buildStepText(prevWp, wp, nextWp) {
  if (!wp) return 'Continue to the next waypoint.';

  const type = normalize(wp.type);
  const label = wp.label || 'the next waypoint';

  if (type === 'stairs')   return `🪜 Use the stairs — ${label}.`;
  if (type === 'elevator') return `🛗 Use the elevator — ${label}.`;
  if (type === 'entrance' || type === 'exit') return `🚪 ${label}.`;

  // Compute turn angle from the incoming segment to the outgoing segment
  if (prevWp && nextWp) {
    const b1 = computeBearingDeg(prevWp, wp);
    const b2 = computeBearingDeg(wp, nextWp);
    if (b1 != null && b2 != null) {
      const diff  = angleDiff(b1, b2);
      const turn  = turnLabel(diff);
      if (turn) return `Turn ${turn} at ${label}.`;
    }
  }

  return `Continue to ${label}.`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build turn-by-turn instructions for a path of waypoint IDs.
 *
 * @param {string[]} pathIds - ordered list of waypoint IDs
 * @returns {Array<{id: string, text: string, waypointId: string}>}
 */
export function buildStepInstructions(pathIds = []) {
  if (!Array.isArray(pathIds) || pathIds.length === 0) return [];

  const waypoints = pathIds.map((id) => getWaypointById(id));
  const steps = [];

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    if (!wp) continue;

    const prevWp = i > 0 ? waypoints[i - 1] : null;
    const nextWp = i < waypoints.length - 1 ? waypoints[i + 1] : null;

    // Final destination
    if (i === waypoints.length - 1) {
      steps.push({
        id: `step-${i}`,
        text: `✅ Arrived at ${wp.label || 'your destination'}.`,
        waypointId: wp.id,
      });
      continue;
    }

    // Skip the starting waypoint (no instruction needed for where you already are)
    if (i === 0) continue;

    steps.push({
      id: `step-${i}`,
      text: buildStepText(prevWp, wp, nextWp),
      waypointId: wp.id,
    });
  }

  return steps;
}

/**
 * Outdoor GPS-based route advancement.
 * Checks whether the user is within `thresholdMeters` of the next waypoint in
 * `pathIds` and returns the advanced waypoint ID if so.
 *
 * @param {object} opts
 * @param {string}   opts.currentWaypointId
 * @param {{latitude: number, longitude: number}} opts.currentPosition
 * @param {string[]} opts.pathIds
 * @param {number}   opts.thresholdMeters  default 8
 * @returns {{ advanced: boolean, currentWaypointId: string }}
 */
export function advanceRouteIfNeeded({
  currentWaypointId,
  currentPosition,
  pathIds = [],
  thresholdMeters = 8,
}) {
  const fail = { advanced: false, currentWaypointId };

  if (!currentWaypointId || !currentPosition || pathIds.length === 0) return fail;

  const currentIndex = pathIds.indexOf(currentWaypointId);
  if (currentIndex === -1 || currentIndex >= pathIds.length - 1) return fail;

  const nextId = pathIds[currentIndex + 1];
  const nextWp = getWaypointById(nextId);

  if (!nextWp || nextWp.latitude == null || nextWp.longitude == null) return fail;

  const dist = haversineDistanceMeters(
    Number(currentPosition.latitude),
    Number(currentPosition.longitude),
    Number(nextWp.latitude),
    Number(nextWp.longitude),
  );

  if (dist <= thresholdMeters) {
    return { advanced: true, currentWaypointId: nextId };
  }

  return fail;
}

/**
 * Indoor floor-map pose-based route advancement.
 * Checks whether the PDR pose is within `thresholdPx` of the next waypoint.
 *
 * @param {object} opts
 * @param {string}   opts.currentWaypointId
 * @param {{x: number, y: number}} opts.currentPose
 * @param {string[]} opts.pathIds
 * @param {number}   opts.thresholdPx  default 20
 * @returns {{ advanced: boolean, currentWaypointId: string }}
 */
export function advanceRouteIfNeededIndoor({
  currentWaypointId,
  currentPose,
  pathIds = [],
  thresholdPx = 20,
}) {
  const fail = { advanced: false, currentWaypointId };

  if (!currentWaypointId || !currentPose || pathIds.length === 0) return fail;

  const currentIndex = pathIds.indexOf(currentWaypointId);
  if (currentIndex === -1 || currentIndex >= pathIds.length - 1) return fail;

  const nextId = pathIds[currentIndex + 1];
  const nextWp = getWaypointById(nextId);

  if (!nextWp || nextWp.x == null || nextWp.y == null) return fail;
  if (currentPose.x == null || currentPose.y == null) return fail;

  const dx = Number(nextWp.x) - Number(currentPose.x);
  const dy = Number(nextWp.y) - Number(currentPose.y);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= thresholdPx) {
    return { advanced: true, currentWaypointId: nextId };
  }

  return fail;
}

/**
 * routeState.js
 *
 * Lightweight route-state helpers that depend only on campusDataLoader.
 * Extracted from routeSteps.js to break the circular dependency:
 *   pathfinding.js → routeSteps.js → pathfinding.js
 *
 * pathfinding.js imports getNextWaypointId and isAtDestination from here
 * (no circular dep). routeSteps.js re-exports them for backward compat.
 */

import { getWaypointById } from './campusDataLoader';

/**
 * Returns the next waypoint ID the user should navigate toward.
 * Skips straight hallway waypoints and stops at turns, major types,
 * and the final destination.
 */
export function getNextWaypointId(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0 || !currentWaypointId) {
    return null;
  }

  const index = pathIds.indexOf(currentWaypointId);
  if (index === -1) return null;
  if (index >= pathIds.length - 1) return null;

  // Look ahead and skip straight hallway waypoints
  for (let i = index + 1; i < pathIds.length; i++) {
    const wp = getWaypointById(pathIds[i]);
    if (!wp) continue;

    const type = String(wp.type || '').toLowerCase();

    // Always stop at major navigation points or destination
    if (
      type === 'stairs' ||
      type === 'elevator' ||
      type === 'entrance' ||
      type === 'exit' ||
      i === pathIds.length - 1
    ) {
      return pathIds[i];
    }

    // For hallway waypoints, check if there's a turn coming
    if (type === 'hallway') {
      if (i < pathIds.length - 1) {
        const prev = getWaypointById(pathIds[i - 1]);
        const next = getWaypointById(pathIds[i + 1]);
        if (prev && wp && next) {
          const dx1 = Number(wp.x) - Number(prev.x);
          const dy1 = Number(wp.y) - Number(prev.y);
          const dx2 = Number(next.x) - Number(wp.x);
          const dy2 = Number(next.y) - Number(wp.y);
          const angle1 = Math.atan2(dx1, -dy1);
          const angle2 = Math.atan2(dx2, -dy2);
          let diff = Math.abs(angle2 - angle1) * (180 / Math.PI);
          if (diff > 180) diff = 360 - diff;
          // If turn is more than 20 degrees, stop here
          if (diff > 20) return pathIds[i];
        }
      }
      // Straight hallway — skip it
      continue;
    }

    // Stop at anything else (rooms, etc.)
    return pathIds[i];
  }

  return pathIds[index + 1];
}

/**
 * Returns true if the user is at the final waypoint in the path.
 */
export function isAtDestination(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0) return false;
  return pathIds[pathIds.length - 1] === currentWaypointId;
}

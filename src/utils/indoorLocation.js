// indoorLocation.js
// Indoor coordinate helpers for floor-map based navigation

export function distanceXY(from, to) {
  if (
    !from ||
    !to ||
    from.x == null ||
    from.y == null ||
    to.x == null ||
    to.y == null
  ) {
    return Infinity;
  }

  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);

  return Math.sqrt(dx * dx + dy * dy);
}

export function calculateBearingXY(from, to) {
  if (
    !from ||
    !to ||
    from.x == null ||
    from.y == null ||
    to.x == null ||
    to.y == null
  ) {
    return null;
  }

  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);

  // Convert floor-map x/y movement into compass-style degrees.
  // On the map: x goes right, y goes down.
  // Compass: 0 = north/up, 90 = east/right, 180 = south/down, 270 = west/left.
  let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
  angle = (angle + 360) % 360;

  return angle;
}

export function isNearIndoorWaypoint(position, waypoint, threshold = 20) {
  return distanceXY(position, waypoint) <= threshold;
}

export function normalizeAngleDegrees(angle) {
  let value = Number(angle) % 360;
  if (value < 0) value += 360;
  return value;
}

export function smallestAngleDifferenceDegrees(a, b) {
  const diff = Math.abs(
    normalizeAngleDegrees(a) - normalizeAngleDegrees(b)
  );
  return Math.min(diff, 360 - diff);
}

export function headingMatchesIndoorTarget(
  deviceHeading,
  from,
  to,
  toleranceDegrees = 60
) {
  if (deviceHeading == null) return true;

  const targetBearing = calculateBearingXY(from, to);
  if (targetBearing == null) return false;

  const diff = smallestAngleDifferenceDegrees(
    Number(deviceHeading),
    Number(targetBearing)
  );

  return diff <= toleranceDegrees;
}

export function estimatePassedIndoorWaypoint({
  currentPosition,
  nextWaypoint,
  previousDistanceToNext = null,
  deviceHeading = null,
  closeThreshold = 20,
  nearThreshold = 35,
  headingToleranceDegrees = 60,
}) {
  if (!currentPosition || !nextWaypoint) {
    return {
      passed: false,
      distanceToNext: null,
      reason: null,
    };
  }

  const distanceToNext = distanceXY(currentPosition, nextWaypoint);

  const headingOk = headingMatchesIndoorTarget(
    deviceHeading,
    currentPosition,
    nextWaypoint,
    headingToleranceDegrees
  );

  const hasPrevious = Number.isFinite(previousDistanceToNext);

  const passedByClose =
    distanceToNext <= closeThreshold && headingOk;

  const passedByCrossing =
    hasPrevious &&
    previousDistanceToNext <= nearThreshold &&
    distanceToNext > previousDistanceToNext &&
    headingOk;

  const passedWithoutHeading =
    deviceHeading == null && distanceToNext <= closeThreshold;

  const passed =
    passedByClose || passedByCrossing || passedWithoutHeading;

  return {
    passed,
    distanceToNext,
    reason: passedByCrossing
      ? "crossed_waypoint"
      : passedByClose
      ? "close_to_waypoint"
      : passedWithoutHeading
      ? "close_without_heading"
      : null,
  };
}

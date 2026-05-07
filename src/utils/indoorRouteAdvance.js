function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getIndoorTargetAdvance({
  currentWaypoint,
  targetWaypoint,
  currentPose,
  metersPerPx,
  stopRadiusM = 3,
  allowRequiredScan = false,
}) {
  if (!currentWaypoint || !targetWaypoint || !currentPose) {
    return { advanced: false, reason: null, distanceM: null };
  }

  if (targetWaypoint.requires_scan === true && allowRequiredScan !== true) {
    return { advanced: false, reason: "requires_scan", distanceM: null };
  }

  const scaleMPerPx = finiteNumber(metersPerPx);
  if (!scaleMPerPx || scaleMPerPx <= 0) {
    return { advanced: false, reason: null, distanceM: null };
  }

  const poseX = finiteNumber(currentPose.x);
  const poseY = finiteNumber(currentPose.y);
  const currentX = finiteNumber(currentWaypoint.x);
  const currentY = finiteNumber(currentWaypoint.y);
  const targetX = finiteNumber(targetWaypoint.x);
  const targetY = finiteNumber(targetWaypoint.y);

  if (
    poseX == null ||
    poseY == null ||
    currentX == null ||
    currentY == null ||
    targetX == null ||
    targetY == null
  ) {
    return { advanced: false, reason: null, distanceM: null };
  }

  const dxToTarget = targetX - poseX;
  const dyToTarget = targetY - poseY;
  const distancePx = Math.sqrt(dxToTarget * dxToTarget + dyToTarget * dyToTarget);
  const distanceM = distancePx * scaleMPerPx;

  const radiusM = Math.max(0, finiteNumber(stopRadiusM, 3));
  if (distanceM <= radiusM) {
    return { advanced: true, reason: "within_radius", distanceM };
  }

  const segmentX = targetX - currentX;
  const segmentY = targetY - currentY;
  const segmentLengthPx = Math.sqrt(segmentX * segmentX + segmentY * segmentY);
  if (!Number.isFinite(segmentLengthPx) || segmentLengthPx <= 0) {
    return { advanced: false, reason: null, distanceM };
  }

  const poseFromCurrentX = poseX - currentX;
  const poseFromCurrentY = poseY - currentY;
  const progressPx =
    (poseFromCurrentX * segmentX + poseFromCurrentY * segmentY) / segmentLengthPx;
  const lateralPx =
    Math.abs(poseFromCurrentX * segmentY - poseFromCurrentY * segmentX) /
    segmentLengthPx;

  const lateralM = lateralPx * scaleMPerPx;
  const passedTarget = progressPx >= segmentLengthPx && lateralM <= Math.max(radiusM, 1.25);

  if (passedTarget) {
    return { advanced: true, reason: "passed_target", distanceM };
  }

  return { advanced: false, reason: null, distanceM };
}

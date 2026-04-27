import { getWaypointById } from "./qrWaypointLookup";
import { isNearWaypoint, calculateBearingDegrees } from "./location";
import {
  distanceXY,
  calculateBearingXY,
  estimatePassedIndoorWaypoint,
} from "./indoorLocation";
import {
  getEdgeDistance,
  estimateTotalDistance,
  getPathWaypointObjects,
} from "./pathfinding";

function normalizeAngleDegrees(angle) {
  let value = Number(angle) % 360;
  if (value < 0) value += 360;
  return value;
}

function smallestAngleDifferenceDegrees(a, b) {
  const diff = Math.abs(
    normalizeAngleDegrees(a) - normalizeAngleDegrees(b)
  );
  return Math.min(diff, 360 - diff);
}

function normalizeType(type = "") {
  return String(type || "").trim().toLowerCase();
}

function isRoomLike(type = "") {
  const t = normalizeType(type);
  return (
    t === "classroom" ||
    t === "office" ||
    t === "lab" ||
    t === "dining" ||
    t === "recreation" ||
    t === "lounge" ||
    t === "room"
  );
}

function isMajorNavigationType(type = "") {
  const t = normalizeType(type);
  return t === "entrance" || t === "stairs" || t === "elevator";
}

function canUseIndoorXY(prev, current, next) {
  if (!prev || !current) return false;

  const sameLevelPrevCurrent =
    String(prev.building || "").trim().toLowerCase() ===
      String(current.building || "").trim().toLowerCase() &&
    String(prev.floor || "") === String(current.floor || "");

  if (!sameLevelPrevCurrent) return false;

  if (next) {
    const sameLevelCurrentNext =
      String(current.building || "").trim().toLowerCase() ===
        String(next.building || "").trim().toLowerCase() &&
      String(current.floor || "") === String(next.floor || "");

    if (!sameLevelCurrentNext) return false;
  }

  return (
    prev.x != null &&
    prev.y != null &&
    current.x != null &&
    current.y != null &&
    (!next || (next.x != null && next.y != null))
  );
}

function getTurnMeta(prev, current, next) {
  if (!prev || !current || !next) {
    return { hint: "", kind: "straight", diff: 0 };
  }

  let bearingIn = null;
  let bearingOut = null;

  if (canUseIndoorXY(prev, current, next)) {
    bearingIn = calculateBearingXY(prev, current);
    bearingOut = calculateBearingXY(current, next);
  } else if (
    prev.latitude != null &&
    prev.longitude != null &&
    current.latitude != null &&
    current.longitude != null &&
    next.latitude != null &&
    next.longitude != null
  ) {
    bearingIn = calculateBearingDegrees(
      Number(prev.latitude),
      Number(prev.longitude),
      Number(current.latitude),
      Number(current.longitude)
    );

    bearingOut = calculateBearingDegrees(
      Number(current.latitude),
      Number(current.longitude),
      Number(next.latitude),
      Number(next.longitude)
    );
  }

  if (bearingIn == null || bearingOut == null) {
    return { hint: "", kind: "straight", diff: 0 };
  }

  const diff = ((bearingOut - bearingIn + 540) % 360) - 180;
  const absDiff = Math.abs(diff);

  if (absDiff < 20) {
    return { hint: "Continue straight.", kind: "straight", diff };
  }

  if (diff >= 20 && diff < 135) {
    return { hint: "Turn right.", kind: "right", diff };
  }

  if (diff <= -20 && diff > -135) {
    return { hint: "Turn left.", kind: "left", diff };
  }

  return { hint: "Turn around.", kind: "back", diff };
}

function getTurnHint(prev, current, next) {
  return getTurnMeta(prev, current, next).hint;
}


function canUseIndoorXYForSide(prev, current) {
  return (
    prev &&
    current &&
    prev.x != null &&
    prev.y != null &&
    current.x != null &&
    current.y != null
  );
}

function getDestinationSideHint(prev, destination) {
  if (!canUseIndoorXYForSide(prev, destination)) {
    return "Your destination is ahead.";
  }

  const dx = Number(destination.x) - Number(prev.x);
  const dy = Number(destination.y) - Number(prev.y);

  // If mostly horizontal movement
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? `${destination.label || "Your destination"} will be on your right.`
      : `${destination.label || "Your destination"} will be on your left.`;
  }

  // If mostly vertical movement, we cannot confidently say left/right
  return `Continue straight to ${destination.label || "your destination"}.`;
}


function describeTransition(prev, current, next) {
  if (!current) return "";

  const type = normalizeType(current.type);
  const parts = [];

  if (type === "elevator") {
    if (prev?.type !== "elevator") {
      parts.push(`Go to ${current.label || "the elevator"} and scan its QR code.`);
    } else if (next?.type === "elevator" && next.floor !== current.floor) {
      parts.push(`Continue through the elevator to floor ${next.floor}.`);
    } else {
      parts.push(
        `Exit the elevator on floor ${current.floor} and continue toward ${next?.label || "the next waypoint"}.`
      );
    }
  } else if (type === "stairs") {
    if (prev?.type !== "stairs") {
      parts.push(`Go to ${current.label || "the stairs"} and scan its QR code.`);
    } else if (next?.type === "stairs" && next.floor !== current.floor) {
      parts.push(`Continue through the stairs to floor ${next.floor}.`);
    } else {
      parts.push(
        `Exit the stairs on floor ${current.floor} and continue toward ${next?.label || "the next waypoint"}.`
      );
    }
  } else if (type === "entrance") {
    if (!next) {
      parts.push("You have reached the entrance.");
    } else {
      parts.push(`Head toward ${current.label || "the entrance"}.`);
    }
  } else if (type === "hallway") {
    const cameFromVertical =
      prev?.type === "stairs" || prev?.type === "elevator";

    const turnHint = cameFromVertical ? "" : getTurnHint(prev, current, next);

    parts.push(`Continue through ${current.label || "the hallway"}.`);
    if (turnHint) parts.push(turnHint);
  } else if (isRoomLike(type)) {
    if (!next) {
      parts.push(getDestinationSideHint(prev, current));
    } else {
      parts.push(`Pass ${current.label || "this point"} and continue.`);
    }
  } else {
    parts.push(`Pass ${current.label || "this point"} and continue.`);
  }

  if (
    prev &&
    current.floor &&
    prev.floor &&
    String(current.floor) !== String(prev.floor)
  ) {
    parts.push(`You are now on floor ${current.floor}.`);
  }

  return parts.join(" ");
}

function buildRawStepInstructions(pathIds = []) {
  const points = getPathWaypointObjects(pathIds);

  if (points.length === 0) return [];

  if (points.length === 1) {
    return [
      {
        id: "step-0",
        waypointId: points[0].id,
        floor: points[0].floor || null,
        text: `You are already at ${points[0].label || points[0].id}.`,
        rawType: normalizeType(points[0].type),
      },
    ];
  }

  const steps = [];

  for (let i = 0; i < points.length; i++) {
    const prev = i > 0 ? points[i - 1] : null;
    const current = points[i];
    const next = i < points.length - 1 ? points[i + 1] : null;

    if (i === 0) {
      continue;
    }

    const distance = getEdgeDistance(prev.id, current.id);
    const detail = describeTransition(prev, current, next);

    steps.push({
      id: `step-${i}`,
      waypointId: current.id,
      floor: current.floor || null,
      distance,
      text: detail || `Go to ${current.label || current.id}.`,
      rawType: normalizeType(current.type),
      originalIndex: i,
      prevWaypoint: prev,
      currentWaypoint: current,
      nextWaypoint: next,
      turnMeta: getTurnMeta(prev, current, next),
    });
  }

  return steps;
}

function isImportantStep(rawSteps, index) {
  const step = rawSteps[index];
  if (!step) return false;

  const current = step.currentWaypoint || getWaypointById(step.waypointId);
  const prev = step.prevWaypoint || (index > 0 ? rawSteps[index - 1]?.currentWaypoint : null);
  const next = step.nextWaypoint || rawSteps[index + 1]?.currentWaypoint || null;

  // Always keep first and last
  if (index === 0 || index === rawSteps.length - 1) return true;

  const type = normalizeType(current?.type);

  // Always keep entrance / stairs / elevator
  if (isMajorNavigationType(type)) return true;

  // Keep destination room
  if (isRoomLike(type) && index === rawSteps.length - 1) return true;

  // Keep floor change points
  if (prev && current?.floor && prev?.floor && String(current.floor) !== String(prev.floor)) {
    return true;
  }

  // Keep meaningful turns
  const turn = getTurnMeta(prev, current, next);
  if (turn.kind !== "straight") return true;

  // Hide hallway continuation points and passed room waypoints
  if (type === "hallway") return false;
  if (isRoomLike(type)) return false;

  return false;
}

function createMergedHallwayStep(fromStep, toStep) {
  const startLabel =
    fromStep?.currentWaypoint?.label ||
    fromStep?.prevWaypoint?.label ||
    fromStep?.waypointId ||
    "current location";

  const endLabel =
    toStep?.currentWaypoint?.label ||
    toStep?.waypointId ||
    "the next turn";

  const endWp = toStep?.currentWaypoint;
  const endType = normalizeType(endWp?.type);
  const turnKind = toStep?.turnMeta?.kind || "straight";

  let text = "Continue straight down the hallway.";

  if (endType === "stairs") {
    text = `Continue down the hallway to ${endWp?.label || "the stairs"}.`;
  } else if (endType === "elevator") {
    text = `Continue down the hallway to ${endWp?.label || "the elevator"}.`;
  } else if (endType === "entrance") {
    text = `Continue down the hallway to ${endWp?.label || "the entrance"}.`;
  } else if (turnKind === "left") {
    text = `Continue straight, then turn left near ${endLabel}.`;
  } else if (turnKind === "right") {
    text = `Continue straight, then turn right near ${endLabel}.`;
  } else if (turnKind === "back") {
    text = `Continue straight until ${endLabel}, then turn around.`;
  } else if (endType && isRoomLike(endType) && !toStep?.nextWaypoint) {
    text = `Continue straight until you reach ${endWp?.label || "your destination"}.`;
  } else {
    text = `Continue straight from ${startLabel} toward ${endLabel}.`;
  }

  return {
    id: `merged-${fromStep?.id || "start"}-${toStep?.id || "end"}`,
    waypointId: toStep?.waypointId || fromStep?.waypointId || null,
    floor: toStep?.floor || fromStep?.floor || null,
    text,
    rawType: "hallway_summary",
    distance: null,
    compressed: true,
  };
}


function summarizeHiddenSegment(hiddenSteps = [], fromStep, toStep) {
  if (!Array.isArray(hiddenSteps) || hiddenSteps.length === 0) {
    return [];
  }

  const result = [];
  const lastHidden = hiddenSteps[hiddenSteps.length - 1];
  const toWp = toStep?.currentWaypoint;
  const toType = normalizeType(toWp?.type);

  const cameFromVertical =
    normalizeType(fromStep?.currentWaypoint?.type) === "stairs" ||
    normalizeType(fromStep?.currentWaypoint?.type) === "elevator";

  const hiddenRoomLabels = hiddenSteps
    .map((step) => step?.currentWaypoint?.label)
    .filter(Boolean)
    .filter((label) => /\d/.test(label));

  if (cameFromVertical) {
    result.push({
      id: `summary-exit-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: hiddenSteps[0]?.waypointId || toStep?.waypointId || null,
      floor: hiddenSteps[0]?.floor || toStep?.floor || null,
      text: "Exit and continue straight down the hallway.",
      rawType: "hallway_summary",
      compressed: true,
    });
  }

  if (hiddenSteps.length >= 3) {
    result.push({
      id: `summary-mid-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: lastHidden?.waypointId || toStep?.waypointId || null,
      floor: lastHidden?.floor || toStep?.floor || null,
      text: "Continue straight through the hallway.",
      rawType: "hallway_summary",
      compressed: true,
    });
  }

  if (toType === "stairs") {
    result.push({
      id: `summary-to-stairs-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text: `Continue straight to ${toWp?.label || "the stairs"}.`,
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  if (toType === "elevator") {
    result.push({
      id: `summary-to-elevator-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text: `Continue straight to ${toWp?.label || "the elevator"}.`,
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  if (toType === "entrance") {
    result.push({
      id: `summary-to-entrance-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text: `Continue straight to ${toWp?.label || "the entrance"}.`,
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  if (isRoomLike(toType) && !toStep?.nextWaypoint) {
    result.push({
      id: `summary-destination-approach-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text:
        hiddenRoomLabels.length >= 2
          ? `Continue past ${hiddenRoomLabels.slice(0, 2).join(" and ")}.`
          : "Continue toward your destination.",
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  const turnKind = toStep?.turnMeta?.kind || "straight";
  if (turnKind === "left") {
    result.push({
      id: `summary-turn-left-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text: "Continue straight until the next left turn.",
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  if (turnKind === "right") {
    result.push({
      id: `summary-turn-right-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
      waypointId: toStep?.waypointId || null,
      floor: toStep?.floor || null,
      text: "Continue straight until the next right turn.",
      rawType: "hallway_summary",
      compressed: true,
    });
    return result;
  }

  result.push({
    id: `summary-generic-${fromStep?.id || "x"}-${toStep?.id || "y"}`,
    waypointId: toStep?.waypointId || null,
    floor: toStep?.floor || null,
    text: "Continue straight.",
    rawType: "hallway_summary",
    compressed: true,
  });

  return result;
}


function compressStepInstructions(rawSteps = []) {
  if (!Array.isArray(rawSteps) || rawSteps.length <= 2) {
    return rawSteps.map((step) => ({
      id: step.id,
      waypointId: step.waypointId,
      floor: step.floor ?? null,
      distance: step.distance,
      text: step.text,
    }));
  }

  const importantIndexes = [];

  for (let i = 0; i < rawSteps.length; i++) {
    if (isImportantStep(rawSteps, i)) {
      importantIndexes.push(i);
    }
  }

  if (!importantIndexes.includes(0)) importantIndexes.unshift(0);
  if (!importantIndexes.includes(rawSteps.length - 1)) {
    importantIndexes.push(rawSteps.length - 1);
  }

  const uniqueImportant = [...new Set(importantIndexes)].sort((a, b) => a - b);

  const compressed = [];
  let lastKeptIndex = uniqueImportant[0];

  compressed.push({
    id: rawSteps[lastKeptIndex].id,
    waypointId: rawSteps[lastKeptIndex].waypointId,
    floor: rawSteps[lastKeptIndex].floor ?? null,
    distance: rawSteps[lastKeptIndex].distance,
    text: rawSteps[lastKeptIndex].text,
  });

  for (let i = 1; i < uniqueImportant.length; i++) {
    const currentImportantIndex = uniqueImportant[i];
    const prevImportantIndex = lastKeptIndex;

    const hiddenSteps = rawSteps.slice(prevImportantIndex + 1, currentImportantIndex);

    if (hiddenSteps.length > 0) {
      const summaries = summarizeHiddenSegment(
        hiddenSteps,
        rawSteps[prevImportantIndex],
        rawSteps[currentImportantIndex]
      );

      for (const summary of summaries) {
        compressed.push(summary);
      }
    }

    compressed.push({
      id: rawSteps[currentImportantIndex].id,
      waypointId: rawSteps[currentImportantIndex].waypointId,
      floor: rawSteps[currentImportantIndex].floor ?? null,
      distance: rawSteps[currentImportantIndex].distance,
      text: rawSteps[currentImportantIndex].text,
    });

    lastKeptIndex = currentImportantIndex;
  }

  const deduped = [];
  for (const step of compressed) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.text === step.text && prev.floor === step.floor) {
      continue;
    }
    deduped.push(step);
  }

  return deduped;
}

export function buildStepInstructions(pathIds = []) {
  const raw = buildRawStepInstructions(pathIds);
  return compressStepInstructions(raw);
}

export function buildStepsFromPath(pathIds = []) {
  return buildStepInstructions(pathIds);
}

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

    const type = String(wp.type || "").toLowerCase();

    // Always stop at major navigation points or destination
    if (
      type === "stairs" ||
      type === "elevator" ||
      type === "entrance" ||
      type === "exit" ||
      i === pathIds.length - 1
    ) {
      return pathIds[i];
    }

    // For hallway waypoints, check if there's a turn coming
    if (type === "hallway") {
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

export function getRemainingPath(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0) return [];

  const index = pathIds.indexOf(currentWaypointId);
  if (index === -1) return pathIds;

  return pathIds.slice(index);
}

export function isAtDestination(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0) return false;
  return pathIds[pathIds.length - 1] === currentWaypointId;
}

export function getCurrentLeg(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length < 2 || !currentWaypointId) {
    return null;
  }

  const index = pathIds.indexOf(currentWaypointId);

  if (index === -1) {
    return {
      fromId: pathIds[0],
      toId: pathIds[1],
      fromWaypoint: getWaypointById(pathIds[0]),
      toWaypoint: getWaypointById(pathIds[1]),
      distance: getEdgeDistance(pathIds[0], pathIds[1]),
    };
  }

  if (index >= pathIds.length - 1) return null;

  const fromId = pathIds[index];
  const toId = pathIds[index + 1];

  return {
    fromId,
    toId,
    fromWaypoint: getWaypointById(fromId),
    toWaypoint: getWaypointById(toId),
    distance: getEdgeDistance(fromId, toId),
  };
}

export function getNavigationStateForCurrentWaypoint(pathIds = [], currentWaypointId) {
  const remainingPath = getRemainingPath(pathIds, currentWaypointId);
  const nextWaypointId = getNextWaypointId(pathIds, currentWaypointId);
  const currentLeg = getCurrentLeg(pathIds, currentWaypointId);

  return {
    currentWaypoint: getWaypointById(currentWaypointId),
    nextWaypoint: nextWaypointId ? getWaypointById(nextWaypointId) : null,
    remainingPath,
    remainingDistance: estimateTotalDistance(remainingPath),
    arrived: isAtDestination(pathIds, currentWaypointId),
    currentLeg,
  };
}

// Keep this for outdoor / fallback compatibility
export function advanceRouteIfNeeded({
  currentWaypointId,
  currentPosition,
  pathIds = [],
  thresholdMeters = 8,
}) {
  if (
    !currentWaypointId ||
    !currentPosition ||
    !Array.isArray(pathIds) ||
    pathIds.length === 0
  ) {
    return {
      currentWaypointId,
      advanced: false,
    };
  }

  const nextWaypointId = getNextWaypointId(pathIds, currentWaypointId);
  if (!nextWaypointId) {
    return {
      currentWaypointId,
      advanced: false,
    };
  }

  const nextWaypoint = getWaypointById(nextWaypointId);
  if (!nextWaypoint) {
    return {
      currentWaypointId,
      advanced: false,
    };
  }

  if (isNearWaypoint(currentPosition, nextWaypoint, thresholdMeters)) {
    return {
      currentWaypointId: nextWaypointId,
      advanced: true,
    };
  }

  return {
    currentWaypointId,
    advanced: false,
  };
}

export function advanceRouteIfNeededIndoor({
  currentWaypointId,
  currentIndoorPosition,
  pathIds = [],
  deviceHeading = null,
  currentFloor = null,
  currentBuildingId = "",
  previousDistanceToNext = null,
  closeThreshold = 20,
  nearThreshold = 35,
  headingToleranceDegrees = 60,
}) {
  if (
    !currentWaypointId ||
    !currentIndoorPosition ||
    !Array.isArray(pathIds) ||
    pathIds.length < 2
  ) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId: null,
      distanceToNext: null,
      passedReason: null,
    };
  }

  const currentIndex = pathIds.indexOf(currentWaypointId);
  if (currentIndex < 0 || currentIndex >= pathIds.length - 1) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId: null,
      distanceToNext: null,
      passedReason: null,
    };
  }

  const nextWaypointId = pathIds[currentIndex + 1];
  const nextWaypoint = getWaypointById(nextWaypointId);

  if (!nextWaypoint) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId: null,
      distanceToNext: null,
      passedReason: null,
    };
  }

  if (
    currentBuildingId &&
    nextWaypoint.building &&
    String(currentBuildingId).trim().toLowerCase() !==
      String(nextWaypoint.building).trim().toLowerCase()
  ) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId,
      distanceToNext: null,
      passedReason: null,
    };
  }

  if (
    currentFloor != null &&
    nextWaypoint.floor != null &&
    String(currentFloor) !== String(nextWaypoint.floor)
  ) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId,
      distanceToNext: null,
      passedReason: null,
    };
  }

  const result = estimatePassedIndoorWaypoint({
    currentPosition: currentIndoorPosition,
    nextWaypoint,
    previousDistanceToNext,
    deviceHeading,
    closeThreshold,
    nearThreshold,
    headingToleranceDegrees,
  });

  if (!result.passed) {
    return {
      advanced: false,
      currentWaypointId,
      nextWaypointId,
      distanceToNext: result.distanceToNext,
      passedReason: result.reason,
    };
  }

  return {
    advanced: true,
    currentWaypointId: nextWaypointId,
    nextWaypointId:
      currentIndex + 2 < pathIds.length ? pathIds[currentIndex + 2] : null,
    distanceToNext: result.distanceToNext,
    passedReason: result.reason,
  };
}

export function getIndoorDistanceToNextWaypoint(currentIndoorPosition, pathIds = [], currentWaypointId) {
  const nextWaypointId = getNextWaypointId(pathIds, currentWaypointId);
  if (!nextWaypointId) return null;

  const nextWaypoint = getWaypointById(nextWaypointId);
  if (!nextWaypoint) return null;

  const d = distanceXY(currentIndoorPosition, nextWaypoint);
  return Number.isFinite(d) ? d : null;
}

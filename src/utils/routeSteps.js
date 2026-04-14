import { getWaypointById } from "./qrWaypointLookup";
import { isNearWaypoint } from "./location";
import {
  getEdgeDistance,
  estimateTotalDistance,
  getPathWaypointObjects,
} from "./pathfinding";

function describeTransition(prev, current, next) {
  const parts = [];

  if (!current) return "";

  if (current.type === "elevator") {
    if (prev?.type !== "elevator") {
      parts.push("Scan the QR code for this elevator.");
    } else if (prev.floor !== current.floor) {
      parts.push(`Elevator reached floor ${current.floor}.`);
    } else {
      parts.push("Use the elevator.");
    }
  } else if (current.type === "stairs") {
    if (prev?.type !== "stairs") {
      parts.push("Scan the QR code for these stairs.");
    } else if (prev.floor !== current.floor) {
      parts.push(`Stairs reached floor ${current.floor}.`);
    } else {
      parts.push("Use the stairs.");
    }
  } else if (current.type === "entrance") {
    parts.push("Head toward the entrance.");
  } else if (current.type === "hallway") {
    parts.push("Continue through the hallway.");
  } else if (
    current.type === "classroom" ||
    current.type === "office" ||
    current.type === "lab" ||
    current.type === "dining" ||
    current.type === "recreation" ||
    current.type === "lounge" ||
    current.type === "room"
  ) {
    if (!next) {
      parts.push("Your destination is here.");
    } else {
      parts.push("Continue past this point.");
    }
  }

  if (prev && current.floor && prev.floor && current.floor !== prev.floor) {
    parts.push(`You are now on floor ${current.floor}.`);
  }

  return parts.join(" ");
}

export function buildStepInstructions(pathIds = []) {
  const points = getPathWaypointObjects(pathIds);

  if (points.length === 0) return [];

  if (points.length === 1) {
    return [
      {
        id: "step-0",
        waypointId: points[0].id,
        floor: points[0].floor || null,
        text: `You are already at ${points[0].label || points[0].id}.`,
      },
    ];
  }

  const steps = [];

  for (let i = 0; i < points.length; i++) {
    const prev = i > 0 ? points[i - 1] : null;
    const current = points[i];
    const next = i < points.length - 1 ? points[i + 1] : null;

    if (i === 0) {
      steps.push({
        id: `step-${i}`,
        waypointId: current.id,
        floor: current.floor || null,
        text: `Start at ${current.label || current.id}.`,
      });
      continue;
    }

    const distance = getEdgeDistance(prev.id, current.id);
    const base = `Go from ${prev.label || prev.id} to ${current.label || current.id}.`;
    const detail = describeTransition(prev, current, next);

    steps.push({
      id: `step-${i}`,
      waypointId: current.id,
      floor: current.floor || null,
      distance,
      text: detail ? `${base} ${detail}` : base,
    });
  }

  return steps;
}

// Compatibility alias for older code
export function buildStepsFromPath(pathIds = []) {
  return buildStepInstructions(pathIds);
}

export function getNextWaypointId(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0 || !currentWaypointId) {
    return null;
  }

  const index = pathIds.indexOf(currentWaypointId);
  if (index === -1) return pathIds[0] || null;
  if (index >= pathIds.length - 1) return null;

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

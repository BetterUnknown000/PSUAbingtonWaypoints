import { getWaypointById } from "./qrWaypointLookup";
// distanceXY returns Infinity on missing/invalid coordinates; the heuristic
// guards with Number.isFinite() so Infinity propagates cleanly without NaN.
import { distanceXY } from "./indoorLocation";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function haversineMeters(a, b) {
  if (
    !a ||
    !b ||
    a.latitude == null ||
    a.longitude == null ||
    b.latitude == null ||
    b.longitude == null
  ) {
    return null;
  }

  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));

  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(x));
}

function sameFloor(a, b) {
  if (!a || !b) return false;
  return (
    normalize(a.building) === normalize(b.building) &&
    String(a.floor || "") === String(b.floor || "")
  );
}

function sameBuilding(a, b) {
  if (!a || !b) return false;
  return normalize(a.building) === normalize(b.building);
}

function isVerticalWaypoint(waypoint) {
  const type = normalize(waypoint?.type);
  return type === "stairs" || type === "elevator";
}

function heuristic(nodeId, goalId) {
  const node = getWaypointById(nodeId);
  const goal = getWaypointById(goalId);

  if (!node || !goal) return 0;

  // Best indoor heuristic: same floor and same building -> x/y distance
  if (sameFloor(node, goal)) {
    const xy = distanceXY(node, goal);
    if (xy != null && Number.isFinite(xy)) return xy;
  }

  // Same building but different floor:
  // use a gentle heuristic so A* still benefits without overestimating.
  if (sameBuilding(node, goal)) {
    const xy = distanceXY(node, goal);
    const floorPenalty =
      Math.abs(Number(node.floor || 0) - Number(goal.floor || 0)) * 40;

    if (xy != null && Number.isFinite(xy)) {
      return xy + floorPenalty;
    }

    return floorPenalty;
  }

  // Outdoor / fallback heuristic
  const geo = haversineMeters(node, goal);
  if (geo != null && Number.isFinite(geo)) return geo;

  return 0;
}

function reconstructPath(cameFrom, current) {
  const path = [current];

  while (cameFrom.has(current)) {
    current = cameFrom.get(current);
    path.unshift(current);
  }

  return path;
}

function popLowestFScore(openSet, fScore) {
  let bestId = null;
  let bestScore = Infinity;

  for (const id of openSet) {
    const score = fScore.get(id) ?? Infinity;
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }

  return bestId;
}

export function aStar(graph, startId, goalId) {
  if (!graph || !startId || !goalId) {
    return {
      path: [],
      distance: Infinity,
      visited: [],
    };
  }

  if (startId === goalId) {
    return {
      path: [startId],
      distance: 0,
      visited: [startId],
    };
  }

  const openSet = new Set([startId]);
  const cameFrom = new Map();

  const gScore = new Map();
  gScore.set(startId, 0);

  const fScore = new Map();
  fScore.set(startId, heuristic(startId, goalId));

  const visitedOrder = [];
  const closedSet = new Set();

  while (openSet.size > 0) {
    const current = popLowestFScore(openSet, fScore);

    if (!current) {
      break;
    }

    if (!closedSet.has(current)) {
      visitedOrder.push(current);
      closedSet.add(current);
    }

    if (current === goalId) {
      const path = reconstructPath(cameFrom, current);
      return {
        path,
        distance: gScore.get(goalId) ?? 0,
        visited: visitedOrder,
      };
    }

    openSet.delete(current);

    const neighbors = Array.isArray(graph[current]) ? graph[current] : [];

    for (const neighbor of neighbors) {
      const neighborId = neighbor?.id;
      if (!neighborId) continue;

      const weight = Number(neighbor.weight);
      const stepCost = Number.isFinite(weight) ? weight : 1;

      const tentativeG = (gScore.get(current) ?? Infinity) + stepCost;

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentativeG);
        fScore.set(neighborId, tentativeG + heuristic(neighborId, goalId));
        openSet.add(neighborId);
      }
    }
  }

  return {
    path: [],
    distance: Infinity,
    visited: visitedOrder,
  };
}

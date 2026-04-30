import campusData from "../data/campusData.json";
import { getWaypointById } from "./qrWaypointLookup";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function distanceXY(a, b) {
  if (
    !a ||
    !b ||
    a.x == null ||
    a.y == null ||
    b.x == null ||
    b.y == null
  ) {
    return null;
  }

  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  return Math.sqrt(dx * dx + dy * dy);
}

function distanceLatLonMeters(a, b) {
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

function estimateEdgeWeight(fromWp, toWp, edge = {}) {
  const explicitDistance =
    edge.distance ??
    edge.weight ??
    edge.meters ??
    edge.length ??
    null;

  if (explicitDistance != null && Number.isFinite(Number(explicitDistance))) {
    return Number(explicitDistance);
  }

  const xyDistance = distanceXY(fromWp, toWp);
  if (xyDistance != null && Number.isFinite(xyDistance)) {
    return xyDistance;
  }

  const geoDistance = distanceLatLonMeters(fromWp, toWp);
  if (geoDistance != null && Number.isFinite(geoDistance)) {
    return geoDistance;
  }

  return 1;
}

// Types that are destinations only — should never be used as through-nodes.
// A* will add a large penalty when expanding neighbors of these types,
// making it cheaper to walk the long way around via hallways.
const DESTINATION_ONLY_TYPES = new Set([
  "classroom",
  "office",
  "lab",
  "dining",
  "lounge",
  "recreation",
]);

// Cost added when a path passes THROUGH a destination-only node.
// Large enough to always prefer a hallway detour, but not Infinity
// so the pathfinder can still reach isolated rooms if truly necessary.
const ROOM_TRANSIT_PENALTY = 10000;

function transitPenalty(waypoint) {
  const type = normalize(waypoint?.type);
  return DESTINATION_ONLY_TYPES.has(type) ? ROOM_TRANSIT_PENALTY : 0;
}

function isAccessibleEdge(edge, fromWp, toWp) {
  if (edge.accessible === true) return true;
  if (edge.accessible === false) return false;

  const fromType = normalize(fromWp?.type);
  const toType = normalize(toWp?.type);

  if (fromType === "stairs" || toType === "stairs") return false;
  return true;
}

function shouldKeepWaypointForBuilding(waypoint, buildingId) {
  if (!buildingId) return true;
  return normalize(waypoint?.building) === normalize(buildingId);
}

function shouldKeepEdgeForBuilding(edge, fromWp, toWp, buildingId) {
  if (!buildingId) return true;

  const buildingNorm = normalize(buildingId);
  const fromMatches = normalize(fromWp?.building) === buildingNorm;
  const toMatches = normalize(toWp?.building) === buildingNorm;

  return fromMatches && toMatches;
}

function addDirectedEdge(graph, fromId, toId, weight, metadata = {}) {
  if (!graph[fromId]) graph[fromId] = [];

  const alreadyExists = graph[fromId].some((n) => n.id === toId);
  if (alreadyExists) return;

  graph[fromId].push({
    id: toId,
    weight,
    ...metadata,
  });
}

function getEdgeEndpoints(edge) {
  const fromId = edge.from ?? edge.source ?? edge.start ?? edge.a ?? null;
  const toId = edge.to ?? edge.target ?? edge.end ?? edge.b ?? null;
  return { fromId, toId };
}

function isBidirectionalEdge(edge) {
  if (edge.bidirectional === false) return false;
  if (edge.oneWay === true) return false;
  if (edge.directed === true) return false;
  return true;
}

export function buildGraph(options = {}) {
  const {
    buildingId = null,
    accessibleOnly = false,
    stairsOnly = false,
  } = options;

  const graph = {};
  const waypointMap = new Map(
    (campusData.waypoints || []).map((wp) => [wp.id, wp])
  );

  // Initialize graph keys for kept waypoints
  for (const waypoint of campusData.waypoints || []) {
    if (!shouldKeepWaypointForBuilding(waypoint, buildingId)) continue;
    graph[waypoint.id] = [];
  }

  for (const edge of campusData.edges || []) {
    const { fromId, toId } = getEdgeEndpoints(edge);
    if (!fromId || !toId) continue;

    const fromWp = waypointMap.get(fromId) || getWaypointById(fromId);
    const toWp = waypointMap.get(toId) || getWaypointById(toId);

    if (!fromWp || !toWp) continue;

    if (!shouldKeepEdgeForBuilding(edge, fromWp, toWp, buildingId)) {
      continue;
    }

    const fromType = normalize(fromWp.type);
    const toType = normalize(toWp.type);

    if (accessibleOnly && !isAccessibleEdge(edge, fromWp, toWp)) {
      continue;
    }

    if (stairsOnly) {
      if (fromType === "elevator" || toType === "elevator") {
        continue;
      }
    }

    const weight = estimateEdgeWeight(fromWp, toWp, edge);

    // If we are expanding OUT of a destination-only room (classroom, office, etc.)
    // add a heavy penalty so A* never routes through it as a shortcut.
    // This does not affect routing TO the room — only routing THROUGH it.
    const fromPenalty = transitPenalty(fromWp);

    addDirectedEdge(graph, fromId, toId, weight + fromPenalty, {
      accessible: isAccessibleEdge(edge, fromWp, toWp),
      type: edge.type || null,
    });

    if (isBidirectionalEdge(edge)) {
      const toPenalty = transitPenalty(toWp);
      addDirectedEdge(graph, toId, fromId, weight + toPenalty, {
        accessible: isAccessibleEdge(edge, fromWp, toWp),
        type: edge.type || null,
      });
    }
  }

  return graph;
}

export function buildSameFloorGraph(options = {}) {
  const {
    buildingId = null,
    floor = null,
    accessibleOnly = false,
    stairsOnly = false,
  } = options;

  const baseGraph = buildGraph({
    buildingId,
    accessibleOnly,
    stairsOnly,
  });

  const allowedIds = new Set(
    (campusData.waypoints || [])
      .filter((wp) => {
        if (!shouldKeepWaypointForBuilding(wp, buildingId)) return false;
        if (floor == null) return true;
        return String(wp.floor || "") === String(floor);
      })
      .map((wp) => wp.id)
  );

  const filtered = {};

  for (const [fromId, neighbors] of Object.entries(baseGraph)) {
    if (!allowedIds.has(fromId)) continue;

    filtered[fromId] = (neighbors || []).filter((neighbor) =>
      allowedIds.has(neighbor.id)
    );
  }

  return filtered;
}

export function getGraphNeighbors(waypointId, options = {}) {
  const graph = buildGraph(options);
  return graph[waypointId] || [];
}

export function edgeExists(fromId, toId, options = {}) {
  const graph = buildGraph(options);
  return (graph[fromId] || []).some((neighbor) => neighbor.id === toId);
}

export function getAllGraphWaypointIds(options = {}) {
  const graph = buildGraph(options);
  return Object.keys(graph);
}

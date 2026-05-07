/**
 * buildGraph.js
 *
 * Builds an A* adjacency graph from campus data.
 * Uses campusDataLoader for lazy per-building data — never loads all buildings at once.
 * Graphs are cached per (buildingId, accessibleOnly, stairsOnly) so they are only
 * built once per session per building.
 */

import {
  getBuildingWaypoints,
  getBuildingEdges,
  getWaypointById,
  getCachedGraph,
  setCachedGraph,
} from './campusDataLoader';
// distanceXY returns Infinity on invalid/missing coordinates, which lets
// callers use Number.isFinite() to safely detect unusable values.
import { distanceXY } from './indoorLocation';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function distanceLatLon(a, b) {
  if (!a || !b || a.latitude == null || b.latitude == null) return null;
  const toRad = v => v * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(Number(b.latitude) - Number(a.latitude));
  const dLon = toRad(Number(b.longitude) - Number(a.longitude));
  const lat1 = toRad(Number(a.latitude));
  const lat2 = toRad(Number(b.latitude));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function estimateEdgeWeight(fromWp, toWp, edge = {}) {
  const explicit = edge.distance ?? edge.weight ?? edge.meters ?? edge.length ?? null;
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);
  const xy = distanceXY(fromWp, toWp);
  if (Number.isFinite(xy)) return xy;
  const geo = distanceLatLon(fromWp, toWp);
  if (geo != null) return geo;
  return 1;
}

const DESTINATION_ONLY_TYPES = new Set(['classroom', 'office', 'lab', 'dining', 'lounge', 'recreation']);
const ROOM_TRANSIT_PENALTY = 10000;

function transitPenalty(wp) {
  return DESTINATION_ONLY_TYPES.has(normalize(wp?.type)) ? ROOM_TRANSIT_PENALTY : 0;
}

function isAccessibleEdge(edge, fromWp, toWp) {
  if (edge.accessible === true) return true;
  if (edge.accessible === false) return false;
  const ft = normalize(fromWp?.type), tt = normalize(toWp?.type);
  if (ft === 'stairs' || tt === 'stairs') return false;
  return true;
}

function isBidirectional(edge) {
  if (edge.bidirectional === false) return false;
  if (edge.oneWay === true) return false;
  if (edge.directed === true) return false;
  return true;
}

function addDirectedEdge(graph, fromId, toId, weight, meta = {}) {
  if (!graph[fromId]) graph[fromId] = [];
  if (graph[fromId].some(n => n.id === toId)) return;
  graph[fromId].push({ id: toId, weight, ...meta });
}

function getEndpoints(edge) {
  return {
    fromId: edge.from ?? edge.source ?? edge.start ?? edge.a ?? null,
    toId:   edge.to   ?? edge.target ?? edge.end   ?? edge.b ?? null,
  };
}

/**
 * Build graph from already-loaded building data.
 * buildingId MUST be provided — we never build the full campus graph.
 */
export function buildGraph(options = {}) {
  const {
    buildingId,
    accessibleOnly = false,
    stairsOnly = false,
  } = options;

  if (!buildingId) {
    console.warn('[buildGraph] buildingId is required. Pass the current building.');
    return {};
  }

  // Return cached graph if available
  const cached = getCachedGraph(buildingId, accessibleOnly, stairsOnly);
  if (cached) return cached;

  const waypoints = getBuildingWaypoints(buildingId);
  const edges     = getBuildingEdges(buildingId);

  const waypointMap = new Map(waypoints.map(wp => [wp.id, wp]));
  const graph = {};

  for (const wp of waypoints) {
    graph[wp.id] = [];
  }

  for (const edge of edges) {
    const { fromId, toId } = getEndpoints(edge);
    if (!fromId || !toId) continue;

    const fromWp = waypointMap.get(fromId) || getWaypointById(fromId);
    const toWp   = waypointMap.get(toId)   || getWaypointById(toId);
    if (!fromWp || !toWp) continue;

    if (accessibleOnly && !isAccessibleEdge(edge, fromWp, toWp)) continue;

    const ft = normalize(fromWp.type), tt = normalize(toWp.type);
    if (stairsOnly && (ft === 'elevator' || tt === 'elevator')) continue;

    const weight = estimateEdgeWeight(fromWp, toWp, edge);

    // Penalize entering a room-like destination so A* avoids routing through
    // classrooms, offices, etc. as transit nodes. The cost is on toWp (the
    // destination of each directed edge) so the penalty fires on entry, not
    // departure — this way a path that starts from a room node doesn't
    // incorrectly inherit a 10,000-unit departure penalty.
    addDirectedEdge(graph, fromId, toId, weight + transitPenalty(toWp), {
      accessible: isAccessibleEdge(edge, fromWp, toWp),
      type: edge.type || null,
    });

    if (isBidirectional(edge)) {
      addDirectedEdge(graph, toId, fromId, weight + transitPenalty(fromWp), {
        accessible: isAccessibleEdge(edge, fromWp, toWp),
        type: edge.type || null,
      });
    }
  }

  // Cache and return
  setCachedGraph(buildingId, accessibleOnly, stairsOnly, graph);
  return graph;
}

export function buildSameFloorGraph(options = {}) {
  const { buildingId, floor = null, accessibleOnly = false, stairsOnly = false } = options;

  const baseGraph = buildGraph({ buildingId, accessibleOnly, stairsOnly });

  const waypoints = getBuildingWaypoints(buildingId);
  const allowedIds = new Set(
    waypoints
      .filter(wp => floor == null || String(wp.floor || '') === String(floor))
      .map(wp => wp.id)
  );

  const filtered = {};
  for (const [fromId, neighbors] of Object.entries(baseGraph)) {
    if (!allowedIds.has(fromId)) continue;
    filtered[fromId] = neighbors.filter(n => allowedIds.has(n.id));
  }
  return filtered;
}

export function getGraphNeighbors(waypointId, options = {}) {
  const graph = buildGraph(options);
  return graph[waypointId] || [];
}

export function edgeExists(fromId, toId, options = {}) {
  return (buildGraph(options)[fromId] || []).some(n => n.id === toId);
}

export function getAllGraphWaypointIds(options = {}) {
  return Object.keys(buildGraph(options));
}

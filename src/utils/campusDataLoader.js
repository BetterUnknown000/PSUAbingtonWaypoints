/**
 * campusDataLoader.js
 *
 * Lazy-loading data layer for campus data.
 * Each building's data is loaded only when needed and cached in memory.
 * campusShared.json (buildings list, entrances, rooms) is always loaded.
 *
 * Usage:
 *   import { getWaypointById, getBuildingData } from './campusDataLoader';
 */

import campusShared from '../data/campusShared.json';

// Building data files — only the ones we have split files for
const BUILDING_LOADERS = {
  athletic:    () => import('../data/buildings/athletic.json'),
  cloverly:    () => import('../data/buildings/cloverly.json'),
  lares:       () => import('../data/buildings/lares.json'),
  rydal:       () => import('../data/buildings/rydal.json'),
  springhouse: () => import('../data/buildings/springhouse.json'),
  sutherland:  () => import('../data/buildings/sutherland.json'),
  woodland:    () => import('../data/buildings/woodland.json'),
};

// In-memory cache: buildingId → loaded data
const _buildingCache = {};

// Graph cache: key → built graph object
const _graphCache = {};

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Load and cache a single building's data.
 * Returns { building, waypoints, edges, rooms, qrAnchors }
 */
export async function getBuildingData(buildingId) {
  const key = normalize(buildingId);
  if (_buildingCache[key]) return _buildingCache[key];

  const loader = BUILDING_LOADERS[key];
  if (!loader) {
    console.warn(`[campusDataLoader] No data file for building: ${key}`);
    return null;
  }

  const module = await loader();
  const data = module.default || module;
  _buildingCache[key] = data;
  return data;
}

/**
 * Preload a building's data eagerly (call when user scans QR or enters building).
 */
export function preloadBuilding(buildingId) {
  getBuildingData(buildingId).catch(() => {});
}

/**
 * Get a waypoint by ID. Searches the cache, then shared entrances.
 * For a cold cache hit you must have called getBuildingData first.
 */
export function getWaypointById(id) {
  if (!id) return null;
  // Search all loaded buildings
  for (const data of Object.values(_buildingCache)) {
    const found = (data.waypoints || []).find(w => w.id === id);
    if (found) return found;
  }
  // Fall back to shared entrances (always loaded)
  return (campusShared.entrances || []).find(w => w.id === id) || null;
}

/**
 * Get a waypoint by ID from a specific already-loaded building (sync, fast).
 */
export function getWaypointByIdFromBuilding(id, buildingId) {
  const key = normalize(buildingId);
  const data = _buildingCache[key];
  if (!data) return null;
  return (data.waypoints || []).find(w => w.id === id) || null;
}

/**
 * Get all waypoints for a building (must be loaded first).
 */
export function getBuildingWaypoints(buildingId) {
  const data = _buildingCache[normalize(buildingId)];
  return data ? (data.waypoints || []) : [];
}

/**
 * Get all edges for a building (must be loaded first).
 */
export function getBuildingEdges(buildingId) {
  const data = _buildingCache[normalize(buildingId)];
  return data ? (data.edges || []) : [];
}

/**
 * Shared data — always available synchronously.
 */
export function getAllBuildings() {
  return campusShared.buildings || [];
}

export function getBuildingById(id) {
  return (campusShared.buildings || []).find(
    b => normalize(b.id) === normalize(id)
  ) || null;
}

export function getAllEntrances() {
  return campusShared.entrances || [];
}

export function getBuildingEntrances(buildingId) {
  const building = getBuildingById(buildingId);
  if (!building || !Array.isArray(building.entrances)) return [];
  return building.entrances
    .map(id => getAllEntrances().find(e => e.id === id))
    .filter(Boolean);
}

export function getAllRooms() {
  return campusShared.rooms || [];
}

export function findRoomByNumber(buildingId, roomNumber) {
  return (campusShared.rooms || []).find(
    r => normalize(r.building) === normalize(buildingId) &&
         normalize(r.room_number) === normalize(roomNumber)
  ) || null;
}

/**
 * Invalidate graph cache for a building (call if edges change at runtime).
 */
export function invalidateGraphCache(buildingId) {
  const prefix = normalize(buildingId) + ':';
  for (const key of Object.keys(_graphCache)) {
    if (key.startsWith(prefix)) delete _graphCache[key];
  }
}

/**
 * Get/set a cached graph object.
 * Key format: `${buildingId}:${accessibleOnly}:${stairsOnly}`
 */
export function getCachedGraph(buildingId, accessibleOnly, stairsOnly) {
  const key = `${normalize(buildingId)}:${!!accessibleOnly}:${!!stairsOnly}`;
  return _graphCache[key] || null;
}

export function setCachedGraph(buildingId, accessibleOnly, stairsOnly, graph) {
  const key = `${normalize(buildingId)}:${!!accessibleOnly}:${!!stairsOnly}`;
  _graphCache[key] = graph;
}

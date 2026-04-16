// EJ Hibbs
//
// A* shortest path algorithm
// This uses the same graph format as dijkstra.js

import campusData from "../data/campusData.json";

// Make a quick lookup so we can find waypoint info by id
function buildWaypointMap() {
  const waypointMap = {};

  for (const waypoint of campusData.waypoints || []) {
    waypointMap[waypoint.id] = waypoint;
  }

  return waypointMap;
}

// This guesses how close one node is to the end node
// If coordinates are missing, just return 0
function getHeuristic(currentId, endId, waypointMap) {
  const current = waypointMap[currentId];
  const end = waypointMap[endId];

  if (!current || !end) {
    return 0;
  }

  if (
    typeof current.latitude !== "number" ||
    typeof current.longitude !== "number" ||
    typeof end.latitude !== "number" ||
    typeof end.longitude !== "number"
  ) {
    return 0;
  }

  const latDiff = current.latitude - end.latitude;
  const lonDiff = current.longitude - end.longitude;

  // Straight-line distance formula
  return Math.sqrt((latDiff * latDiff) + (lonDiff * lonDiff));
}

export function aStar(graph, start, end) {
  // ERROR Cases. Graph empty
  if (!graph || typeof graph !== "object" || Object.keys(graph).length === 0) {
    console.warn("A* error: graph is empty or invalid.");
    return { path: [], distance: Infinity };
  }
  // ERROR Case. Start or end is missing
  if (!start || !end) {
    console.warn("A* error: start or end is missing.");
    return { path: [], distance: Infinity };
  }
  // ERROR Case. Values still exist but aren't on the graph.
  if (!graph[start] || !graph[end]) {
    console.warn("A* error: start or end node is not in the graph.");
    return { path: [], distance: Infinity };
  }

  // If start and end are the same, no pathfinding is needed
  if (start === end) {
    return { path: [start], distance: 0 };
  }

  const waypointMap = buildWaypointMap();

  // Open set = nodes we still want to check
  const openSet = new Set();
  openSet.add(start);

  // Keeps track of the best previous node
  const cameFrom = {};

  // gScore = real distance from start to that node
  const gScore = {};

  // fScore = gScore + estimated distance to end
  const fScore = {};

  // Set default values
  for (const nodeId of Object.keys(graph)) {
    cameFrom[nodeId] = null;
    gScore[nodeId] = Infinity;
    fScore[nodeId] = Infinity;
  }

  gScore[start] = 0;
  fScore[start] = getHeuristic(start, end, waypointMap);

  while (openSet.size > 0) {
    let currentNode = null;

    // Find the node in openSet with the lowest fScore
    for (const nodeId of openSet) {
      if (currentNode === null || fScore[nodeId] < fScore[currentNode]) {
        currentNode = nodeId;
      }
    }

    if (currentNode === null) {
      break;
    }

    // If we reached the end, build the path
    if (currentNode === end) {
      const path = [];
      let temp = end;

      while (temp !== null) {
        path.unshift(temp);
        temp = cameFrom[temp];
      }

      return {
        path: path,
        distance: gScore[end]
      };
    }

    openSet.delete(currentNode);

    const neighbors = Array.isArray(graph[currentNode]) ? graph[currentNode] : [];

    for (const neighbor of neighbors) {
      if (!neighbor || !neighbor.id) {
        continue;
      }

      if (!(neighbor.id in gScore)) {
        continue;
      }

      if (typeof neighbor.weight !== "number" || neighbor.weight < 0) {
        continue;
      }

      const newDistance = gScore[currentNode] + neighbor.weight;

      // If this path is better, update it
      if (newDistance < gScore[neighbor.id]) {
        cameFrom[neighbor.id] = currentNode;
        gScore[neighbor.id] = newDistance;
        fScore[neighbor.id] =
          newDistance + getHeuristic(neighbor.id, end, waypointMap);

        openSet.add(neighbor.id);
      }
    }
  }

  console.warn("A* error: no path found.");
  return { path: [], distance: Infinity };
}

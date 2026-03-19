// Code by EJ Hibbs
import campusData from "../data/campusData.json";

// building an adjacency list graph from the waypoint/edge data that was provided via campusData.json
export function buildGraph(options = {}) {
  const { accessibleOnly = false, buildingId = null } = options;

  const graph = {};
  const waypoints = campusData.waypoints || [];
  const edges = campusData.edges || [];

  // if a building is picked, only build the exact waypoints connected to said building
  // having all waypoints everytime would be expensive on the runtime
  const allowedWaypoints = buildingId
    ? waypoints.filter((wp) => wp.building === buildingId)
    : waypoints;

  const allowedIds = new Set(allowedWaypoints.map((wp) => wp.id));

  // make an empty list for each waypoint
  for (const wp of allowedWaypoints) {
    graph[wp.id] = [];
  }

  for (const edge of edges) {
    const fromAllowed = allowedIds.has(edge.from);
    const toAllowed = allowedIds.has(edge.to);

    // skip edges that are not in the building we want
    if (!fromAllowed || !toAllowed) continue;

    // if the user wants the accessible path only, skip all the bad edges
    if (accessibleOnly && edge.accessible === false) continue;

    // add both directions
    graph[edge.from].push({
      id: edge.to,
      weight: edge.distance,
      accessible: edge.accessible
    });

    graph[edge.to].push({
      id: edge.from,
      weight: edge.distance,
      accessible: edge.accessible
    });
  }

  return graph;
}

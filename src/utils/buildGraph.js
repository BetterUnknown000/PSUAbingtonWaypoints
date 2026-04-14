import campusData from "../data/campusData.json";

// Add one directed edge to the graph only if it is not already there
function addEdge(graph, from, to, weight, accessible) {
  if (!graph[from]) {
    graph[from] = [];
  }

  const exists = graph[from].some(
    (neighbor) =>
      neighbor.id === to &&
      neighbor.weight === weight &&
      neighbor.accessible === accessible
  );

  if (!exists) {
    graph[from].push({
      id: to,
      weight,
      accessible
    });
  }
}

// Build an adjacency-list graph from campusData.json
export function buildGraph(options = {}) {
  const {
    accessibleOnly = false,
    buildingId = null
  } = options;

  const graph = {};
  const waypoints = campusData.waypoints || [];
  const edges = campusData.edges || [];

  // If a building is provided, only include waypoints from that building.
  // Trim + lowercase makes matching safer if data formatting is inconsistent.
  const allowedWaypoints = buildingId
    ? waypoints.filter(
        (wp) =>
          String(wp.building || "").trim().toLowerCase() ===
          String(buildingId).trim().toLowerCase()
      )
    : waypoints;

  if (allowedWaypoints.length === 0) {
    console.warn("buildGraph warning: No waypoints found for the requested graph.");
    return {};
  }

  const allowedIds = new Set(allowedWaypoints.map((wp) => wp.id));

  // Create an empty neighbor list for every allowed waypoint
  for (const wp of allowedWaypoints) {
    graph[wp.id] = [];
  }

  for (const edge of edges) {
    const from = edge.from;
    const to = edge.to;
    const weight = Number(edge.distance);
    const accessible = edge.accessible;

    // Skip edges that do not fully belong to the selected building
    if (!allowedIds.has(from) || !allowedIds.has(to)) {
      continue;
    }

    // If accessible-only mode is on, skip inaccessible edges
    if (accessibleOnly && accessible === false) {
      continue;
    }

    // Skip bad distance values
    if (!Number.isFinite(weight) || weight < 0) {
      continue;
    }

    // Add both directions because the graph is undirected
    addEdge(graph, from, to, weight, accessible);
    addEdge(graph, to, from, weight, accessible);
  }

  return graph;
}

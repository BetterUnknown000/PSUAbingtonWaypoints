// Code by EJ Hibbs

// Dijkstra's algorithm for finding the shortest path between two waypoints.
// graph = adjacency-list object
// start = user's current waypoint
// end   = destination waypoint

export function dijkstra(graph, start, end) {
  // Fail if graph is missing or empty
  if (!graph || typeof graph !== "object" || Object.keys(graph).length === 0) {
    console.warn("Dijkstra error: Graph is empty or invalid.");
    return { path: [], distance: Infinity };
  }

  // Fail if start or end is missing
  if (!start || !end) {
    console.warn("Dijkstra error: START or END is invalid.");
    return { path: [], distance: Infinity };
  }

  // Fail if start or end does not exist in graph
  if (!graph[start] || !graph[end]) {
    console.warn("Dijkstra error: START or END waypoint was not found on the graph.");
    return { path: [], distance: Infinity };
  }

  // Easy case: already at destination
  if (start === end) {
    return { path: [start], distance: 0 };
  }

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(graph));

  // Set every node distance to infinity at first
  for (const node of unvisited) {
    distances[node] = Infinity;
    previous[node] = null;
  }

  // Starting point always has distance 0
  distances[start] = 0;

  // Main Dijkstra loop
  while (unvisited.size > 0) {
    let current = null;

    // Find the unvisited node with the smallest known distance
    for (const node of unvisited) {
      if (current === null || distances[node] < distances[current]) {
        current = node;
      }
    }

    // Fail case: no valid current node found
    if (current === null) {
      console.warn("Dijkstra error: Current node is null.");
      break;
    }

    // Fail case: remaining nodes are unreachable
    if (distances[current] === Infinity) {
      console.warn("Dijkstra error: No path could be found.");
      break;
    }

    // Mark current node as visited
    unvisited.delete(current);

    // Stop early if destination is reached
    if (current === end) {
      break;
    }

    // Safely get neighbor list
    const neighbors = Array.isArray(graph[current]) ? graph[current] : [];

    // Check each neighbor connected to current node
    for (const neighbor of neighbors) {
      // Skip bad neighbor entries
      if (!neighbor || !neighbor.id) continue;
      if (!(neighbor.id in distances)) continue;
      if (!unvisited.has(neighbor.id)) continue;
      if (typeof neighbor.weight !== "number" || neighbor.weight < 0) continue;

      const newDistance = distances[current] + neighbor.weight;

      // If this path is shorter, update it
      if (newDistance < distances[neighbor.id]) {
        distances[neighbor.id] = newDistance;
        previous[neighbor.id] = current;
      }
    }
  }

  // Build final path by walking backward from end to start
  const path = [];
  let current = end;

  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  // Fail case: path did not actually connect back to start
  if (path[0] !== start) {
    console.warn("Dijkstra error: No valid path was built.");
    return { path: [], distance: Infinity };
  }

  return {
    path,
    distance: distances[end]
  };
}

// Code by EJ Hibbs

// Dijkstra's algorithm for finding the shortest path. We will utilize this when finding waypoints.
// graph is going to be all the waypoint connections

// start = where the user is
// end   = where the user wants to go

export function dijkstra(graph, start, end) {
  // FAIL CASE: If start or end doesn't exist
  // Will output an error in case this happens
  if (!graph[start] || !graph[end]) {
    console.warn("Dijkstra error: START or END waypoint was not found on the graph.");
    return { path: [], distance: Infinity };
  }

  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(graph));

  // In Dijkstra's, we set every distance to infinity first. We don't know how far they are.
  for (const node of unvisited) {
    distances[node] = Infinity;
    previous[node] = null;
  }

  // initialize the starting waypoint as 0.
  distances[start] = 0;

  // Start the Dijkstra loop
  while (unvisited.size > 0) {
    let current = null;

    // Find unvisited node with smallest known distance
    for (const node of unvisited) {
      if (current === null || distances[node] < distances[current]) {
        current = node;
      }
    }

    // FAIL CASE: If current is still null.
    if (current === null) {
      console.warn("Dijkstra error: Current Node is still null.");
      break;
    }

    // FAIL CASE: Smallest distance is still infinity. There is no possible path.
    if (distances[current] === Infinity) {
      console.warn("Dijkstra error: No Path could be found.");
      break;
    }

    // Stop early if we reach the destination.
    if (current === end) break;

    // Current node will be marked as visited
    unvisited.delete(current);

    // Check each neighbor connected to current node
    for (const neighbor of graph[current]) {
      // if it is already visited, skip it.
      if (!unvisited.has(neighbor.id)) continue;

      const newDistance = distances[current] + neighbor.weight;

      // if going through the current node is shorter, then update the saved value's distance to the new one
      if (newDistance < distances[neighbor.id]) {
        distances[neighbor.id] = newDistance;
        previous[neighbor.id] = current;
      }
    }
  }

  // build the final path, starting from the end and going backwards
  const path = [];
  let current = end;

  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  // FAIL CASE: If the path doesn't actually start where it should, then no real path is going to be found.
  if (path[0] !== start) {
    console.warn("Dijkstra error: Finished running, however no valid path was built.");
    return { path: [], distance: Infinity };
  }

  return {
    path,
    distance: distances[end]
  };
}

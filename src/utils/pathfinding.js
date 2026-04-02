// Code by EJ Hibbs
// Puts everything together that is needed to make waypoints.
import { findRoom } from "./findRoom";
import { buildGraph } from "./buildGraph";
import { dijkstra } from "./dijkstra";

// Finds the room, makes the graph, then gets the shortest path using Dijkstra's.
export function findRouteToRoom(startWaypointId, buildingId, roomNumber, options = {}) {
  const { accessibleOnly = false } = options;

  const result = findRoom(buildingId, roomNumber);

  // FAIL CASE: If Room was not found
  if (!result || !result.waypoint) {
    console.warn("Pathfinding error: Find Room could not find a valid room.");
    return null;
  }

  const destinationWaypointId = result.waypoint.id;

  const graph = buildGraph({
    buildingId,
    accessibleOnly
  });

  const route = dijkstra(graph, startWaypointId, destinationWaypointId);

  return {
    ...result,
    route
  };
}

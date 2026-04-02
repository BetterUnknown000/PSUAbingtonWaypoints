// Code by EJ Hibbs

import campusData from "../data/campusData.json";



// Helper function to find a waypoint by its id
function getWaypointById(id) {
  return (campusData.waypoints || []).find((wp) => wp.id === id) || null;
}

// Builds the step-by-step directions from the route path
export function buildStepsFromPath(pathIds = []) {
  // If there is no path, return no steps
  if (!Array.isArray(pathIds) || pathIds.length === 0) {
    return [];
  }

  return pathIds.map((id, index) => {
    const current = getWaypointById(id);
    const prev = index > 0 ? getWaypointById(pathIds[index - 1]) : null;

    let text = "";

    // First step is where the user starts
    if (index === 0) {
      text = `Start at ${current?.label || id}.`;
    }
    // If the waypoint is stairs, say to use the stairs
    else if (current?.type === "stairs") {
      text = `Go from ${prev?.label || pathIds[index - 1]} to ${current?.label || id}. Use the stairs.`;
    }
    // If the waypoint is an elevator, say to use the elevator
    else if (current?.type === "elevator") {
      text = `Go from ${prev?.label || pathIds[index - 1]} to ${current?.label || id}. Use the elevator.`;
    }
    // If the waypoint is an entrance, mention the entrance
    else if (current?.type === "entrance") {
      text = `Go from ${prev?.label || pathIds[index - 1]} to ${current?.label || id}. Head toward the entrance.`;
    }
    // If the waypoint is a room, that is basically the destination
    else if (current?.type === "room") {
      text = `Go to ${current?.label || id}. Your destination is here.`;
    }
    // Default step for normal movement between points
    else {
      text = `Go from ${prev?.label || pathIds[index - 1]} to ${current?.label || id}.`;
    }

    // Return each step as an object
    return {
      id: `step-${index}`,
      waypointId: id,
      text,
    };
  });
}

import {
  getWaypointById,
  getBuildingWaypoints,
  getBuildingEdges,
  getAllBuildings,
  getBuildingEntrances,
  getAllRooms,
} from './campusDataLoader';
import { findRoom } from "./findRoom";

import { buildGraph, buildSameFloorGraph as buildSameFloorGraphFromModule } from "./buildGraph";
import { aStar } from "./astar";
import {
  getBuildingById,
} from "./qrWaypointLookup";
import { isNearDestinationBuilding } from "./location";

import { distanceXY } from "./indoorLocation";

import { getNextWaypointId, isAtDestination } from "./routeState";
// buildStepInstructions is imported at the top level to replace the
// dynamic require() calls that mixed CJS and ESM in the same file.
// routeSteps imports only pure utilities from pathfinding (no callbacks
// back into buildStepInstructions), so the circular reference is safe.
import { buildStepInstructions } from "./routeSteps";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
// distanceXY imported from indoorLocation.js (returns Infinity on invalid input)

function sameFloor(a, b) {
  if (!a || !b) return false;
  return (
    normalize(a.building) === normalize(b.building) &&
    String(a.floor || "") === String(b.floor || "")
  );
}

function sameBuilding(a, b) {
  if (!a || !b) return false;
  return normalize(a.building) === normalize(b.building);
}

export function getDestinationWaypoint(buildingId, roomNumber) {
  const result = findRoom(buildingId, roomNumber);
  return result?.waypoint || null;
}

export function getRoomFloor(buildingId, roomNumber) {
  const result = findRoom(buildingId, roomNumber);
  return result?.room?.floor || null;
}

export function getEdgeDistance(fromId, toId, buildingId) {
  // Auto-detect buildingId from the waypoints if the caller didn't supply it.
  // routeSteps.js calls this without buildingId, which previously caused
  // buildGraph() to bail out early and always return 0 for every step distance.
  const effectiveBuildingId =
    buildingId ||
    getWaypointById(fromId)?.building ||
    getWaypointById(toId)?.building;
  if (!effectiveBuildingId) return 0;
  const graph = buildGraph({ buildingId: effectiveBuildingId });
  const edge = (graph[fromId] || []).find((n) => n.id === toId);
  return edge ? Number(edge.weight || 0) : 0;
}

export function calculateShortestPath(startId, endId, options = {}) {
  const { buildingId = null } = options;

  if (!startId || !endId) return [];
  if (startId === endId) return [startId];

  let graph = buildGraph({
    buildingId,
    accessibleOnly: options.accessibleOnly === true,
  });

  if (options.stairsOnly === true) {
    const filteredGraph = {};

    for (const [fromId, neighbors] of Object.entries(graph)) {
      const fromWp = getWaypointById(fromId);

      if (fromWp?.type === "elevator") {
        filteredGraph[fromId] = [];
        continue;
      }

      filteredGraph[fromId] = (neighbors || []).filter((neighbor) => {
        const toWp = getWaypointById(neighbor.id);
        if (toWp?.type === "elevator") return false;
        return true;
      });
    }

    graph = filteredGraph;
  }

  const result = aStar(graph, startId, endId);
  return result.path || [];
}

export function getPathWaypointObjects(pathIds = []) {
  return pathIds.map((id) => getWaypointById(id)).filter(Boolean);
}

export function estimateTotalDistance(pathIds = []) {
  if (!Array.isArray(pathIds) || pathIds.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < pathIds.length - 1; i++) {
    total += getEdgeDistance(pathIds[i], pathIds[i + 1]);
  }

  return total;
}
// buildSameFloorGraphFromModule imported from buildGraph.js so both code paths
// stay in sync.
function buildSameFloorGraph({ buildingId, floor, accessibleOnly = false, stairsOnly = false }) {
  return buildSameFloorGraphFromModule({ buildingId, floor, accessibleOnly, stairsOnly });
}

function rerouteSameFloorFromWaypoint(
  startWaypointId,
  destinationWaypointId,
  options = {}
) {
  if (!startWaypointId || !destinationWaypointId) {
    return {
      path: [],
      steps: [],
      distance: Infinity,
      nextWaypoint: null,
      arrived: false,
    };
  }

  const startWaypoint = getWaypointById(startWaypointId);
  const destinationWaypoint = getWaypointById(destinationWaypointId);

  if (!startWaypoint || !destinationWaypoint) {
    return {
      path: [],
      steps: [],
      distance: Infinity,
      nextWaypoint: null,
      arrived: false,
    };
  }

  const buildingId =
    options.buildingId ||
    startWaypoint.building ||
    destinationWaypoint.building ||
    null;

  const floor = options.floor || startWaypoint.floor || destinationWaypoint.floor;

  const graph = buildSameFloorGraph({
    buildingId,
    floor,
    accessibleOnly: options.accessibleOnly === true,
    stairsOnly: options.stairsOnly === true,
  });

  const result = aStar(graph, startWaypointId, destinationWaypointId);
  const path = result.path || [];

  
  const steps = buildStepInstructions(path);
  const nextWaypointId =
    path.length > 1 ? path[1] : null;

  return {
    path,
    steps,
    distance: estimateTotalDistance(path),
    nextWaypoint: nextWaypointId ? getWaypointById(nextWaypointId) : null,
    arrived: path.length === 1 && path[0] === startWaypointId,
  };
}

export function isVerticalWaypoint(waypoint) {
  if (!waypoint) return false;
  return waypoint.type === "stairs" || waypoint.type === "elevator";
}

function sameVerticalGroup(a, b) {
  if (!a || !b) return false;
  return (
    a.type === b.type &&
    normalize(a.building) === normalize(b.building)
  );
}

function getContinuousVerticalTarget(pathIds = [], currentWaypointId) {
  if (!Array.isArray(pathIds) || pathIds.length === 0 || !currentWaypointId) {
    return null;
  }

  const startIndex = pathIds.indexOf(currentWaypointId);
  if (startIndex === -1 || startIndex >= pathIds.length - 1) {
    return null;
  }

  const startWaypoint = getWaypointById(currentWaypointId);
  if (!isVerticalWaypoint(startWaypoint)) {
    return null;
  }

  let lastMatch = null;

  for (let i = startIndex + 1; i < pathIds.length; i++) {
    const candidate = getWaypointById(pathIds[i]);
    if (!candidate) break;

    if (sameVerticalGroup(startWaypoint, candidate)) {
      lastMatch = candidate;
      continue;
    }

    break;
  }

  return lastMatch;
}

function findNearestPathToAnyTarget(startWaypointId, targetWaypointIds = [], options = {}) {
  let best = {
    path: [],
    steps: [],
    distance: Infinity,
    nextWaypoint: null,
    targetWaypoint: null,
  };

  for (const targetId of targetWaypointIds) {
    const result = rerouteFromWaypoint(startWaypointId, targetId, options);
    if (result.path.length > 0 && result.distance < best.distance) {
      best = {
        ...result,
        targetWaypoint: getWaypointById(targetId),
      };
    }
  }

  return best;
}

function getVerticalCandidates(buildingId, floor, accessibleOnly = false, stairsOnly = false) {
  return getBuildingWaypoints(buildingId).filter((w) => {
    if (String(w.floor || "") !== String(floor || "")) return false;

    if (stairsOnly) {
      return w.type === "stairs";
    }

    if (accessibleOnly) {
      return w.type === "elevator";
    }

    return w.type === "elevator" || w.type === "stairs";
  });
}

function findBestVerticalWaypointForDestination(
  buildingId,
  destinationFloor,
  accessibleOnly = false,
  stairsOnly = false
) {
  const candidates = getVerticalCandidates(
    buildingId,
    destinationFloor,
    accessibleOnly,
    stairsOnly
  );

  return candidates[0] || null;
}

function findNearestSameFloorVerticalTarget(
  currentWaypoint,
  destinationBuildingId,
  accessibleOnly,
  stairsOnly = false
) {
  const candidates = getVerticalCandidates(
    destinationBuildingId,
    currentWaypoint.floor,
    accessibleOnly,
    stairsOnly
  );

  const targetIds = candidates.map((w) => w.id);

  return findNearestPathToAnyTarget(currentWaypoint.id, targetIds, {
    buildingId: destinationBuildingId,
    accessibleOnly,
    stairsOnly,
  });
}

function buildUnknownIndoorAnchorInstructions(buildingId, destinationRoomNumber) {
  const anchors = getBuildingWaypoints(buildingId).filter((w) => {
    return w.type === "stairs" || w.type === "elevator" || w.type === "entrance";
  });

  const anchorLabels = anchors.slice(0, 4).map((a) => a.label).filter(Boolean);

  const anchorHint =
    anchorLabels.length > 0
      ? `Look for one of these QR points: ${anchorLabels.join(", ")}.`
      : "Look for the next stairs, elevator, or entrance QR code.";

  return [
    {
      id: "step-0",
      text: "Your exact indoor position is not known yet.",
    },
    {
      id: "step-1",
      text: "If you see a nearby QR code, scan it first.",
    },
    {
      id: "step-2",
      text: anchorHint,
    },
    {
      id: "step-3",
      text: "If there is no QR code nearby, use Help and enter a room number next to you.",
    },
    {
      id: "step-4",
      text: `After that, navigation to Room ${destinationRoomNumber} will continue automatically.`,
    },
  ];
}

function chooseBestVerticalRoute({
  currentWaypoint,
  destinationWaypoint,
  accessibleOnly = false,
  stairsOnly = false,
}) {
  const currentFloor = currentWaypoint?.floor;
  const destinationFloor = destinationWaypoint?.floor;
  const buildingId = destinationWaypoint?.building || currentWaypoint?.building;

  if (!currentWaypoint || !destinationWaypoint || !buildingId) {
    return null;
  }

  const startVerticalCandidates = getVerticalCandidates(
    buildingId,
    currentFloor,
    accessibleOnly,
    stairsOnly
  );

  const destVerticalCandidates = getVerticalCandidates(
    buildingId,
    destinationFloor,
    accessibleOnly,
    stairsOnly
  );

  if (!startVerticalCandidates.length || !destVerticalCandidates.length) {
    return null;
  }

  let best = null;

  for (const startVertical of startVerticalCandidates) {
    for (const destVertical of destVerticalCandidates) {
      if (startVertical.type !== destVertical.type) continue;

      const leg1 = rerouteSameFloorFromWaypoint(
        currentWaypoint.id,
        startVertical.id,
        {
          buildingId,
          accessibleOnly,
          stairsOnly,
        }
      );

      const leg2Path =
        startVertical.id === destVertical.id
          ? [startVertical.id]
          : calculateShortestPath(startVertical.id, destVertical.id, {
              buildingId,
              accessibleOnly,
              stairsOnly,
            });

      const leg2 = {
        path: leg2Path,
        distance: estimateTotalDistance(leg2Path),
      };

      const leg3 = rerouteSameFloorFromWaypoint(destVertical.id, destinationWaypoint.id, {
        buildingId,
        accessibleOnly,
        stairsOnly,
      });

      if (!leg1.path.length || !leg2.path.length || !leg3.path.length) continue;

      const mergedPath = mergePathSegments(leg1.path, leg2.path, leg3.path);
      const totalDistance = estimateTotalDistance(mergedPath);

      if (!best || totalDistance < best.distance) {
        best = {
          path: mergedPath,
          distance: totalDistance,
          startVertical,
          destVertical,
        };
      }
    }
  }

  return best;
}

function mergePathSegments(...segments) {
  const merged = [];

  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length === 0) continue;

    if (merged.length === 0) {
      merged.push(...segment);
      continue;
    }

    if (merged[merged.length - 1] === segment[0]) {
      merged.push(...segment.slice(1));
    } else {
      merged.push(...segment);
    }
  }

  return merged;
}

export function rerouteFromWaypoint(startWaypointId, destinationWaypointId, options = {}) {
  if (!startWaypointId || !destinationWaypointId) {
    return {
      path: [],
      steps: [],
      distance: Infinity,
      nextWaypoint: null,
      arrived: false,
    };
  }

  const startWaypoint = getWaypointById(startWaypointId);
  const destinationWaypoint = getWaypointById(destinationWaypointId);

  if (!startWaypoint || !destinationWaypoint) {
    return {
      path: [],
      steps: [],
      distance: Infinity,
      nextWaypoint: null,
      arrived: false,
    };
  }


  const buildingId =
    options.buildingId ||
    destinationWaypoint.building ||
    startWaypoint.building ||
    null;

  const accessibleOnly = options.accessibleOnly === true;
  const stairsOnly = options.stairsOnly === true;

  let path = [];

  if (sameFloor(startWaypoint, destinationWaypoint)) {
    path = calculateShortestPath(startWaypointId, destinationWaypointId, {
      buildingId,
      accessibleOnly,
      stairsOnly,
    });
  } else if (sameBuilding(startWaypoint, destinationWaypoint)) {
    // If we're already AT a vertical waypoint (stairs/elevator),
    // skip leg 1 and go straight to cross-floor path
    if (isVerticalWaypoint(startWaypoint)) {
      path = calculateShortestPath(startWaypointId, destinationWaypointId, {
        buildingId,
        accessibleOnly,
        stairsOnly,
      });
    } else {
      const verticalChoice = chooseBestVerticalRoute({
        currentWaypoint: startWaypoint,
        destinationWaypoint,
        accessibleOnly,
        stairsOnly,
      });

      path = verticalChoice?.path || [];
    }
  } else {
    path = calculateShortestPath(startWaypointId, destinationWaypointId, {
      buildingId,
      accessibleOnly,
      stairsOnly,
    });
  }

  const steps = buildStepInstructions(path);
  const nextWaypointId = getNextWaypointId(path, startWaypointId);

  return {
    path,
    steps,
    distance: estimateTotalDistance(path),
    nextWaypoint: nextWaypointId ? getWaypointById(nextWaypointId) : null,
    arrived: isAtDestination(path, startWaypointId),
  };
}

function buildIndoorNavigation({
  currentWaypoint,
  destinationWaypoint,
  destinationRoomNumber,
  accessibleOnly = false,
  stairsOnly = false,
}) {
  if (!currentWaypoint) {
    return {
      mode: "indoor_find_anchor",
      path: [],
      steps: buildUnknownIndoorAnchorInstructions(
        destinationWaypoint?.building || "",
        destinationRoomNumber || ""
      ),
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Find and scan a nearby indoor QR anchor to continue.",
    };
  }

  if (!destinationWaypoint) {
    return {
      mode: "idle",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Destination not found.",
    };
  }

  const reroute = rerouteFromWaypoint(currentWaypoint.id, destinationWaypoint.id, {
    buildingId: destinationWaypoint.building,
    accessibleOnly,
    stairsOnly,
  });

  let mode = "indoor_destination";

  const firstUsefulStep =
    reroute.steps.find((step) => step.waypointId === reroute.nextWaypoint?.id) ||
    reroute.steps.find((step) => step.waypointId && step.waypointId !== currentWaypoint.id) ||
    reroute.steps[1] ||
    reroute.steps[0] ||
    null;

  let message =
    firstUsefulStep?.text ||
    "Continue toward your destination.";

  const currentVerticalTarget = getContinuousVerticalTarget(reroute.path, currentWaypoint.id);
  if (currentVerticalTarget) {
    mode = "vertical_transfer";
    message =
      currentVerticalTarget.type === "stairs"
        ? `Continue through the stairs until Floor ${currentVerticalTarget.floor}.`
        : `Continue through the elevator until Floor ${currentVerticalTarget.floor}.`;
  }

  return {
    mode,
    path: reroute.path,
    steps: reroute.steps,
    nextWaypoint: reroute.nextWaypoint,
    distance: reroute.distance,
    arrived: reroute.arrived,
    transportMode: "arrow",
    message,
  };
}

function buildOutdoorGuidance({
  destinationBuildingId,
  destinationBuilding,
  destinationWaypoint,
  destinationRoomNumber,
  currentWaypoint,
  currentBuildingId,
  userGps,
  accessibleOnly = false,
}) {
  if (!destinationBuildingId || !destinationBuilding) {
    return {
      mode: "idle",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Destination building not available.",
    };
  }

  if (currentWaypoint && normalize(currentWaypoint.building) === normalize(destinationBuildingId)) {
    return buildIndoorNavigation({
      currentWaypoint,
      destinationWaypoint,
      destinationRoomNumber,
      accessibleOnly,
    });
  }

  if (currentWaypoint && currentBuildingId && normalize(currentBuildingId) !== normalize(destinationBuildingId)) {
    const exitRoute = findNearestExitRoute(currentWaypoint.id, currentBuildingId, {
      accessibleOnly: false,
      stairsOnly: false,
    });

    return {
      mode: "exit_current_building",
      path: exitRoute.path,
      steps: exitRoute.steps.length
        ? exitRoute.steps
        : [
            {
              id: "step-0",
              text: "Find the closest entrance or exit QR code and leave the current building.",
            },
          ],
      nextWaypoint: exitRoute.nextWaypoint,
      distance: exitRoute.distance,
      arrived: false,
      transportMode: "arrow",
      message: `Leave ${getBuildingById(currentBuildingId)?.name || "the current building"} and continue toward ${destinationBuilding.name}.`,
    };
  }

  const nearDestinationBuilding = isNearDestinationBuilding(userGps, destinationBuilding, 40);

  return {
    mode: "outdoor_guidance",
    path: [],
    steps: nearDestinationBuilding
      ? [
          {
            id: "step-0",
            text: `You are near ${destinationBuilding.name}. Scan an entrance QR code to continue indoors.`,
          },
        ]
      : [
          {
            id: "step-0",
            text: `Follow outdoor guidance to ${destinationBuilding.name}.`,
          },
        ],
    nextWaypoint: null,
    distance: Infinity,
    arrived: false,
    transportMode: "arrow",
    message: nearDestinationBuilding
      ? `You are near ${destinationBuilding.name}. Scan an entrance QR code to continue indoors.`
      : `Follow outdoor guidance to ${destinationBuilding.name}.`,
  };
}

export function buildStageNavigation({
  currentWaypointId,
  currentBuildingId,
  destinationBuildingId,
  destinationRoomNumber,
  userGps,
  accessibleOnly = false,
}) {
  const currentWaypoint = currentWaypointId ? getWaypointById(currentWaypointId) : null;
  const destinationBuilding = destinationBuildingId
    ? getBuildingById(destinationBuildingId)
    : null;
  const destinationWaypoint =
    destinationBuildingId && destinationRoomNumber
      ? getDestinationWaypoint(destinationBuildingId, destinationRoomNumber)
      : null;

  if (!destinationBuildingId && !destinationRoomNumber) {
    return {
      mode: "idle",
      path: [],
      steps: [
        {
          id: "step-0",
          text: "Choose a destination to begin navigation.",
        },
      ],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Choose a destination to begin navigation.",
    };
  }

  if (destinationBuildingId && destinationRoomNumber) {
    if (currentWaypoint && normalize(currentWaypoint.building) === normalize(destinationBuildingId)) {
      return buildIndoorNavigation({
        currentWaypoint,
        destinationWaypoint,
        destinationRoomNumber,
        accessibleOnly,
      });
    }

    return buildOutdoorGuidance({
      destinationBuildingId,
      destinationBuilding,
      destinationWaypoint,
      destinationRoomNumber,
      currentWaypoint,
      currentBuildingId,
      userGps,
      accessibleOnly,
    });
  }

  if (destinationBuildingId && !destinationRoomNumber) {
    if (currentWaypoint && normalize(currentWaypoint.building) === normalize(destinationBuildingId)) {
      const entrances = getBuildingEntrances(destinationBuildingId);
      const entranceIds = entrances.map((w) => w.id);
      const bestExit = findNearestPathToAnyTarget(currentWaypoint.id, entranceIds, {
        buildingId: destinationBuildingId,
        accessibleOnly: false,
        stairsOnly: false,
      });

      return {
        mode: "indoor_destination",
        path: bestExit.path,
        steps: bestExit.steps.length
          ? bestExit.steps
          : [
              {
                id: "step-0",
                text: "Head toward the nearest entrance.",
              },
            ],
        nextWaypoint: bestExit.nextWaypoint,
        distance: bestExit.distance,
        arrived: false,
        transportMode: "arrow",
        message: `Head toward the nearest entrance of ${destinationBuilding?.name || destinationBuildingId}.`,
      };
    }

    return buildOutdoorGuidance({
      destinationBuildingId,
      destinationBuilding,
      destinationWaypoint: null,
      destinationRoomNumber: "",
      currentWaypoint,
      currentBuildingId,
      userGps,
      accessibleOnly,
    });
  }

  return {
    mode: "idle",
    path: [],
    steps: [
      {
        id: "step-0",
        text: "Navigation is waiting for valid destination data.",
      },
    ],
    nextWaypoint: null,
    distance: Infinity,
    arrived: false,
    transportMode: "arrow",
    message: "Navigation is waiting for valid destination data.",
  };
}

export function findNearestExitRoute(currentWaypointId, currentBuildingId, options = {}) {
  const entrances = getBuildingEntrances(currentBuildingId);
  const entranceIds = entrances.map((w) => w.id);


  if (!currentWaypointId || !currentBuildingId || entranceIds.length === 0) {
    return {
      path: [],
      steps: [],
      distance: Infinity,
      nextWaypoint: null,
      arrived: false,
    };
  }

  let bestPath = [];
  let bestDistance = Infinity;

  for (const entranceId of entranceIds) {
    const path = calculateShortestPath(currentWaypointId, entranceId, {
      buildingId: currentBuildingId,
      accessibleOnly: options.accessibleOnly === true,
      stairsOnly: options.stairsOnly === true,
    });

    if (path.length > 0) {
      const distance = estimateTotalDistance(path);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestPath = path;
      }
    }
  }

  const steps = buildStepInstructions(bestPath);
  const nextWaypointId = getNextWaypointId(bestPath, currentWaypointId);

  return {
    path: bestPath,
    steps,
    distance: bestDistance,
    nextWaypoint: nextWaypointId ? getWaypointById(nextWaypointId) : null,
    arrived: isAtDestination(bestPath, currentWaypointId),
  };
}

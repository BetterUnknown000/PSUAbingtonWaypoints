import campusData from "../data/campusData.json";
import { findRoom } from "./findRoom";
import { buildGraph } from "./buildGraph";
import { dijkstra } from "./dijkstra";
import {
  getBuildingById,
  getBuildingEntrances,
  getWaypointById,
  isAtBuildingEntrance,
} from "./qrWaypointLookup";
import { isNearDestinationBuilding } from "./location";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function getDestinationWaypoint(buildingId, roomNumber) {
  const result = findRoom(buildingId, roomNumber);
  return result?.waypoint || null;
}

export function getRoomFloor(buildingId, roomNumber) {
  const result = findRoom(buildingId, roomNumber);
  return result?.room?.floor || null;
}

export function getEdgeDistance(fromId, toId) {
  const graph = buildGraph();
  const edge = (graph[fromId] || []).find((n) => n.id === toId);
  return edge ? Number(edge.weight || 0) : 0;
}

export function calculateShortestPath(startId, endId, options = {}) {
  const { accessibleOnly = false, buildingId = null } = options;

  if (!startId || !endId) return [];
  if (startId === endId) return [startId];

  const graph = buildGraph({
    buildingId,
    accessibleOnly,
  });

  const result = dijkstra(graph, startId, endId);
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

function sameVerticalGroup(a, b) {
  if (!a || !b) return false;
  return a.type === b.type && a.building === b.building;
}

export function isVerticalWaypoint(waypoint) {
  if (!waypoint) return false;
  return waypoint.type === "stairs" || waypoint.type === "elevator";
}

function findBestVerticalWaypointForDestination(
  buildingId,
  destinationFloor,
  accessibleOnly = true
) {
  const candidates = (campusData.waypoints || []).filter((w) => {
    if (normalize(w.building) !== normalize(buildingId)) return false;
    if (String(w.floor || "") !== String(destinationFloor || "")) return false;
    if (accessibleOnly) {
      return w.type === "elevator";
    }
    return w.type === "elevator" || w.type === "stairs";
  });

  return candidates[0] || null;
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

function buildUnknownIndoorAnchorInstructions(buildingId, destinationRoomNumber) {
  const anchors = (campusData.waypoints || []).filter((w) => {
    return (
      normalize(w.building) === normalize(buildingId) &&
      (w.type === "stairs" || w.type === "elevator" || w.type === "entrance")
    );
  });

  const anchorLabels = anchors.slice(0, 4).map((a) => a.label).filter(Boolean);

  const anchorHint =
    anchorLabels.length > 0
      ? `Look for one of these QR points: ${anchorLabels.join(", ")}.`
      : "Look for the next stairs, elevator, or entrance QR code.";

  return [
    {
      id: "step-0",
      text: "You are in the correct building, but your exact indoor position is not known.",
    },
    {
      id: "step-1",
      text: "Continue down the hallway until you find a stairs, elevator, or entrance QR code.",
    },
    {
      id: "step-2",
      text: anchorHint,
    },
    {
      id: "step-3",
      text: `After scanning that QR code, navigation to Room ${destinationRoomNumber} will continue automatically.`,
    },
  ];
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
    startWaypoint.building ||
    destinationWaypoint.building ||
    null;

  const graph = buildGraph({
    buildingId,
    accessibleOnly: options.accessibleOnly === true,
  });

  const result = dijkstra(graph, startWaypointId, destinationWaypointId);
  const path = result.path || [];

  const { buildStepInstructions, getNextWaypointId, isAtDestination } = require("./routeSteps");

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

export function findNearestExitRoute(startWaypointId, buildingId, options = {}) {
  if (!startWaypointId || !buildingId) {
    return {
      exitWaypoint: null,
      path: [],
      steps: [],
      distance: Infinity,
    };
  }

  const entrances = getBuildingEntrances(buildingId);

  if (entrances.length === 0) {
    return {
      exitWaypoint: null,
      path: [],
      steps: [],
      distance: Infinity,
    };
  }

  let best = {
    exitWaypoint: null,
    path: [],
    steps: [],
    distance: Infinity,
  };

  for (const entrance of entrances) {
    const result = rerouteFromWaypoint(startWaypointId, entrance.id, {
      buildingId,
      accessibleOnly: options.accessibleOnly === true,
    });

    if (result.path.length > 0 && result.distance < best.distance) {
      best = {
        exitWaypoint: entrance,
        path: result.path,
        steps: result.steps || [],
        distance: result.distance,
      };
    }
  }

  return best;
}

function buildIndoorRouteWithVerticalHandling({
  currentWaypointId,
  destinationBuildingId,
  destinationRoomNumber,
  accessibleOnly,
}) {
  const currentWaypoint = getWaypointById(currentWaypointId);
  const destinationFloor = getRoomFloor(destinationBuildingId, destinationRoomNumber);

  if (!currentWaypoint || !destinationFloor) {
    return {
      mode: "indoor_destination",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Continue toward your destination.",
    };
  }

  const destinationResult = findRoom(destinationBuildingId, destinationRoomNumber);
  const destinationWaypointId = destinationResult?.waypoint?.id || null;

  if (!destinationWaypointId) {
    return {
      mode: "indoor_destination",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Destination room could not be found.",
    };
  }

  if (String(currentWaypoint.floor || "") === String(destinationFloor)) {
    const route = rerouteFromWaypoint(currentWaypointId, destinationWaypointId, {
      buildingId: destinationBuildingId,
      accessibleOnly,
    });

    const { getNavigationStateForCurrentWaypoint } = require("./routeSteps");
    const navState = getNavigationStateForCurrentWaypoint(route.path, currentWaypointId);

    return {
      mode: "indoor_destination",
      path: route.path,
      steps: route.steps,
      nextWaypoint: navState.nextWaypoint || route.nextWaypoint || null,
      distance: navState.remainingDistance ?? route.distance,
      arrived: navState.arrived || route.arrived,
      transportMode: "arrow",
      message: navState.arrived
        ? `You have arrived at Room ${destinationRoomNumber}.`
        : route.steps.find((step) => step.waypointId === navState.nextWaypoint?.id)?.text ||
          "Continue toward your destination.",
    };
  }

  if (isVerticalWaypoint(currentWaypoint)) {
    const destinationFloorTransport = findBestVerticalWaypointForDestination(
      destinationBuildingId,
      destinationFloor,
      currentWaypoint.type === "elevator"
    );

    if (
      destinationFloorTransport &&
      sameVerticalGroup(currentWaypoint, destinationFloorTransport)
    ) {
      return {
        mode: "vertical_transfer",
        path: [currentWaypoint.id, destinationFloorTransport.id],
        steps: [
          {
            id: "step-0",
            waypointId: currentWaypoint.id,
            floor: currentWaypoint.floor || null,
            text: `You are at ${currentWaypoint.label}.`,
          },
          {
            id: "step-1",
            waypointId: destinationFloorTransport.id,
            floor: destinationFloorTransport.floor || null,
            text:
              currentWaypoint.type === "elevator"
                ? `Take the elevator and scan the QR code for the elevator on floor ${destinationFloor}.`
                : `Take the stairs and scan the QR code for the stairs on floor ${destinationFloor}.`,
          },
        ],
        nextWaypoint: destinationFloorTransport,
        distance: 0,
        arrived: false,
        transportMode: currentWaypoint.type,
        message:
          currentWaypoint.type === "elevator"
            ? `Take the elevator and scan the elevator QR on floor ${destinationFloor}.`
            : `Take the stairs and scan the stairs QR on floor ${destinationFloor}.`,
      };
    }
  }

  const currentFloorVerticalCandidates = (campusData.waypoints || []).filter((w) => {
    if (normalize(w.building) !== normalize(destinationBuildingId)) return false;
    if (String(w.floor || "") !== String(currentWaypoint.floor || "")) return false;

    if (accessibleOnly) {
      return w.type === "elevator";
    }
    return w.type === "elevator" || w.type === "stairs";
  });

  const targetIds = currentFloorVerticalCandidates.map((w) => w.id);

  const bestVerticalRoute = findNearestPathToAnyTarget(currentWaypointId, targetIds, {
    buildingId: destinationBuildingId,
    accessibleOnly,
  });

  if (bestVerticalRoute.path.length > 0 && bestVerticalRoute.targetWaypoint) {
    const { buildStepInstructions, getNavigationStateForCurrentWaypoint } = require("./routeSteps");

    const transport = bestVerticalRoute.targetWaypoint.type;

    const customSteps = [
      ...buildStepInstructions(bestVerticalRoute.path),
      {
        id: `step-${bestVerticalRoute.path.length}`,
        waypointId: bestVerticalRoute.targetWaypoint.id,
        floor: bestVerticalRoute.targetWaypoint.floor || null,
        text:
          transport === "elevator"
            ? `Scan the QR code for the elevator on floor ${bestVerticalRoute.targetWaypoint.floor}.`
            : `Scan the QR code for the stairs on floor ${bestVerticalRoute.targetWaypoint.floor}.`,
      },
    ];

    const navState = getNavigationStateForCurrentWaypoint(
      bestVerticalRoute.path,
      currentWaypointId
    );

    return {
      mode: "go_to_vertical_anchor",
      path: bestVerticalRoute.path,
      steps: customSteps,
      nextWaypoint: navState.nextWaypoint || bestVerticalRoute.targetWaypoint,
      distance: navState.remainingDistance ?? bestVerticalRoute.distance,
      arrived: false,
      transportMode: "arrow",
      message:
        transport === "elevator"
          ? `Go to the elevator on floor ${bestVerticalRoute.targetWaypoint.floor} and scan its QR code.`
          : `Go to the stairs on floor ${bestVerticalRoute.targetWaypoint.floor} and scan their QR code.`,
    };
  }

  return {
    mode: "indoor_destination",
    path: [],
    steps: [],
    nextWaypoint: null,
    distance: Infinity,
    arrived: false,
    transportMode: "arrow",
    message: "No indoor route could be found.",
  };
}

export function buildStageNavigation({
  currentWaypointId,
  currentBuildingId,
  destinationBuildingId,
  destinationRoomNumber,
  userGps = null,
  accessibleOnly = true,
}) {
  const destinationBuilding = getBuildingById(destinationBuildingId);

  if (!destinationBuildingId || !destinationRoomNumber) {
    return {
      mode: "idle",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: "Choose a destination first.",
    };
  }

  if (!currentWaypointId) {
    if (
      currentBuildingId &&
      normalize(currentBuildingId) === normalize(destinationBuildingId)
    ) {
      const steps = buildUnknownIndoorAnchorInstructions(
        destinationBuildingId,
        destinationRoomNumber
      );

      return {
        mode: "indoor_find_anchor",
        path: [],
        steps,
        nextWaypoint: null,
        distance: Infinity,
        arrived: false,
        transportMode: "arrow",
        message:
          "Go down the hallway until you find a stairs, elevator, or entrance QR code.",
      };
    }

    return {
      mode: "outdoor_guidance",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: isNearDestinationBuilding(userGps, destinationBuilding)
        ? `You are near ${destinationBuilding?.name || destinationBuildingId}. Scan an entrance QR to continue.`
        : `Head toward ${destinationBuilding?.name || destinationBuildingId}.`,
    };
  }

  const sameBuilding =
    normalize(currentBuildingId) === normalize(destinationBuildingId);

  if (!sameBuilding) {
    const exitRoute = findNearestExitRoute(currentWaypointId, currentBuildingId, {
      accessibleOnly,
    });

    const alreadyAtExit = isAtBuildingEntrance(currentWaypointId, currentBuildingId);

    if (!alreadyAtExit) {
      return {
        mode: "exit_current_building",
        path: exitRoute.path || [],
        steps: exitRoute.steps || [],
        nextWaypoint: exitRoute.exitWaypoint || null,
        distance: exitRoute.distance,
        arrived: false,
        transportMode: "arrow",
        message: "Proceed to the nearest exit of your current building.",
      };
    }

    return {
      mode: "outdoor_guidance",
      path: [],
      steps: [],
      nextWaypoint: null,
      distance: Infinity,
      arrived: false,
      transportMode: "arrow",
      message: isNearDestinationBuilding(userGps, destinationBuilding)
        ? `You are near ${destinationBuilding?.name || destinationBuildingId}. Scan an entrance QR to continue.`
        : `Head toward ${destinationBuilding?.name || destinationBuildingId}.`,
    };
  }

  return buildIndoorRouteWithVerticalHandling({
    currentWaypointId,
    destinationBuildingId,
    destinationRoomNumber,
    accessibleOnly,
  });
}

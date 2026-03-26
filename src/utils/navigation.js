import campusData from "../data/campusData.json";

function getWaypointById(id) {
  return (campusData.waypoints || []).find((w) => w.id === id) || null;
}

function buildAdjacencyList() {
  const adjacency = {};

  (campusData.waypoints || []).forEach((w) => {
    adjacency[w.id] = [];
  });

  (campusData.edges || []).forEach((edge) => {
    const from = edge.from;
    const to = edge.to;
    const distance = Number(edge.distance || 1);

    if (!adjacency[from]) adjacency[from] = [];
    if (!adjacency[to]) adjacency[to] = [];

    adjacency[from].push({
      to,
      distance,
      accessible: edge.accessible !== false,
    });

    adjacency[to].push({
      to: from,
      distance,
      accessible: edge.accessible !== false,
    });
  });

  return adjacency;
}

export function calculateShortestPath(startId, endId) {
  if (!startId || !endId) return [];
  if (startId === endId) return [startId];

  const adjacency = buildAdjacencyList();
  const distances = {};
  const previous = {};
  const unvisited = new Set(Object.keys(adjacency));

  Object.keys(adjacency).forEach((node) => {
    distances[node] = Infinity;
    previous[node] = null;
  });

  distances[startId] = 0;

  while (unvisited.size > 0) {
    let current = null;
    let smallest = Infinity;

    unvisited.forEach((node) => {
      if (distances[node] < smallest) {
        smallest = distances[node];
        current = node;
      }
    });

    if (current === null) break;
    if (current === endId) break;

    unvisited.delete(current);

    for (const neighbor of adjacency[current] || []) {
      if (!unvisited.has(neighbor.to)) continue;

      const alt = distances[current] + neighbor.distance;
      if (alt < distances[neighbor.to]) {
        distances[neighbor.to] = alt;
        previous[neighbor.to] = current;
      }
    }
  }

  const path = [];
  let current = endId;

  while (current) {
    path.unshift(current);
    current = previous[current];
  }

  if (path[0] !== startId) return [];
  return path;
}

export function getPathWaypointObjects(pathIds = []) {
  return pathIds
    .map((id) => getWaypointById(id))
    .filter(Boolean);
}

export function estimateTotalDistance(pathIds = []) {
  if (!Array.isArray(pathIds) || pathIds.length < 2) return 0;

  const adjacency = buildAdjacencyList();
  let total = 0;

  for (let i = 0; i < pathIds.length - 1; i++) {
    const from = pathIds[i];
    const to = pathIds[i + 1];
    const edge = (adjacency[from] || []).find((n) => n.to === to);
    if (edge) total += Number(edge.distance || 0);
  }

  return total;
}

export function buildStepInstructions(pathIds = []) {
  const points = getPathWaypointObjects(pathIds);

  if (points.length === 0) return [];
  if (points.length === 1) {
    return [
      {
        id: "step-0",
        text: `You are already at ${points[0].label || points[0].id}.`,
      },
    ];
  }

  const steps = [];

  for (let i = 0; i < points.length; i++) {
    const current = points[i];

    if (i === 0) {
      steps.push({
        id: `step-${i}`,
        text: `Start at ${current.label || current.id}.`,
      });
      continue;
    }

    const prev = points[i - 1];

    let text = `Go from ${prev.label || prev.id} to ${current.label || current.id}.`;

    if (current.type === "stairs") {
      text += " Use the stairs.";
    } else if (current.type === "elevator") {
      text += " Use the elevator.";
    } else if (current.type === "entrance") {
      text += " Head toward the entrance.";
    } else if (current.type === "room") {
      text += " Your destination is here.";
    }

    steps.push({
      id: `step-${i}`,
      text,
    });
  }

  return steps;
}

export function findWaypointByQrData(qrData) {
  const normalized = String(qrData || "").trim().toLowerCase();

  return (
    (campusData.waypoints || []).find((w) => {
      const idMatch = String(w.id || "").trim().toLowerCase() === normalized;
      const qrMatch =
        String(w.qr_code || "").trim().toLowerCase() === normalized;
      return idMatch || qrMatch;
    }) || null
  );
}
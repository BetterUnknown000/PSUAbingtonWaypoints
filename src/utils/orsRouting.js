// orsRouting.js
// Calls OpenRouteService directly from the app — no proxy server needed.
// The API key is embedded via EXPO_PUBLIC_ORS_API_KEY in .env

const ORS_BASE = "https://api.heigit.org/openrouteservice/v2";
const ORS_KEY  = process.env.EXPO_PUBLIC_ORS_API_KEY || "";

function describeStep(instruction = "", distanceMeters = 0) {
  const dist = distanceMeters > 0 ? `${Math.round(distanceMeters)} m` : "";
  return instruction
    ? dist ? `${instruction} (${dist})` : instruction
    : dist ? `Continue ${dist}` : "Continue straight";
}

export async function fetchOrsRoute(originGps, destinationGps) {
  if (!originGps || !destinationGps) {
    throw new Error("fetchOrsRoute: origin and destination GPS are required");
  }

  if (!ORS_KEY) {
    throw new Error(
      "Missing EXPO_PUBLIC_ORS_API_KEY in .env — add your ORS API key to enable outdoor routing"
    );
  }

  const body = {
    coordinates: [
      [Number(originGps.longitude),      Number(originGps.latitude)],
      [Number(destinationGps.longitude), Number(destinationGps.latitude)],
    ],
    instructions: true,
    language: "en",
    units: "m",
  };

  const response = await fetch(
    `${ORS_BASE}/directions/foot-walking/geojson`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/geo+json, application/json",
        "Authorization": ORS_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 403 || response.status === 429) {
      throw new Error(`ORS quota exceeded (${response.status}) — try again later.`);
    }
    throw new Error(`ORS directions failed: ${response.status} — ${text}`);
  }

  const json = await response.json();

  let geometryCoords = [];
  let segments = [];
  let summary = {};

  if (json?.features?.[0]) {
    const feature = json.features[0];
    geometryCoords = feature.geometry?.coordinates || [];
    segments = feature.properties?.segments || [];
    summary = feature.properties?.summary || {};
  } else if (json?.routes?.[0]) {
    const route = json.routes[0];
    geometryCoords = route.geometry?.coordinates || [];
    segments = route.segments || [];
    summary = route.summary || {};
  } else {
    throw new Error("ORS returned no routes");
  }

  const coordinates = geometryCoords.map(([lng, lat]) => ({
    latitude: Number(lat),
    longitude: Number(lng),
  }));

  const steps = [];
  for (const segment of segments) {
    for (const step of segment.steps || []) {
      steps.push({
        instruction: describeStep(step.instruction, step.distance),
        rawInstruction: step.instruction || "",
        distance: step.distance ?? 0,
        duration: step.duration ?? 0,
        waypointIndex: step.way_points?.[0] ?? 0,
      });
    }
  }

  const totalMeters =
    Number(summary.distance) ||
    segments.reduce((sum, s) => sum + Number(s.distance || 0), 0) ||
    null;

  const totalSeconds =
    Number(summary.duration) ||
    segments.reduce((sum, s) => sum + Number(s.duration || 0), 0) ||
    0;

  return { coordinates, steps, totalMeters, totalSeconds };
}

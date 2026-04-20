// orsRouting.js
// Fetches a walking route from OpenRouteService and returns
// coordinates + turn-by-turn steps for outdoor navigation.
//
// Usage:
//   import { fetchOrsRoute } from "../utils/orsRouting";
//   const result = await fetchOrsRoute(
//     { latitude: 40.1, longitude: -75.1 },   // origin
//     { latitude: 40.11, longitude: -75.11 }  // destination
//   );
//   result.coordinates  — [{ latitude, longitude }, ...]
//   result.steps        — [{ instruction, distance, duration }, ...]
//   result.totalMeters  — number
//   result.totalSeconds — number

const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjRiZWNmNzRjNmU3ZDQ3MTM5NmM0NDc0NzljOTI4YWEzIiwiaCI6Im11cm11cjY0In0="; // <-- replace with your key
const ORS_ENDPOINT = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
// Fallback step text when ORS instruction is missing
function describeStep(instruction = "", distanceMeters = 0) {
  const dist =
    distanceMeters > 0
      ? distanceMeters >= 100
        ? `${Math.round(distanceMeters)} m`
        : `${Math.round(distanceMeters)} m`
      : "";
  return instruction
    ? dist
      ? `${instruction} (${dist})`
      : instruction
    : dist
    ? `Continue ${dist}`
    : "Continue straight";
}

export async function fetchOrsRoute(originGps, destinationGps) {
  if (!originGps || !destinationGps) {
    throw new Error("fetchOrsRoute: origin and destination GPS are required");
  }

  const body = {
    coordinates: [
      [Number(originGps.longitude), Number(originGps.latitude)],
      [Number(destinationGps.longitude), Number(destinationGps.latitude)],
    ],
    instructions: true,
    language: "en",
    units: "m",
  };

  const response = await fetch(ORS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/geo+json, application/json",
      Authorization: ORS_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `ORS request failed: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const json = await response.json();
  
  /* Support BOTH ORS response formats:
     1. { routes:[...] }
     2. GeoJSON { features:[...] }
  */

  let geometryCoords = [];
  let segments = [];
  let summary = {};

  if (json?.routes?.[0]) {
    const route = json.routes[0];

    geometryCoords = route.geometry?.coordinates || [];
    segments = route.segments || [];
    summary = route.summary || {};
  } else if (json?.features?.[0]) {
    const feature = json.features[0];

    geometryCoords = feature.geometry?.coordinates || [];
    segments = feature.properties?.segments || [];
    summary = feature.properties?.summary || {};
  } else {
    throw new Error("ORS returned no routes");
  }

  /* Convert [lng, lat] => { latitude, longitude } */
  const coordinates = geometryCoords.map(([lng, lat]) => ({
    latitude: Number(lat),
    longitude: Number(lng),
  }));

  /* Build step list */
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
    segments.reduce((sum, segment) => sum + Number(segment.distance || 0), 0) ||
    null;

  const totalSeconds =
    Number(summary.duration) ||
    segments.reduce((sum, segment) => sum + Number(segment.duration || 0), 0) ||
    0;

  return {
  coordinates,
  steps,
  totalMeters,
  totalSeconds,
  };
}

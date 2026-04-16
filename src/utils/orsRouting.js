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
const ORS_ENDPOINT = "https://api.openrouteservice.org/v2/directions/foot-walking";

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
      Accept:
        "application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8",
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

  const route = json?.routes?.[0];
  if (!route) {
    throw new Error("ORS returned no routes");
  }

  // Decode geometry — ORS returns encoded polyline by default.
  // We request JSON so geometry comes as GeoJSON LineString.
  const geometryCoords = route.geometry?.coordinates || [];
  const coordinates = geometryCoords.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));

  // Build step list
  const segments = route.segments || [];
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

  const summary = route.summary || {};
  return {
    coordinates,
    steps,
    totalMeters: summary.distance ?? 0,
    totalSeconds: summary.duration ?? 0,
  };
}
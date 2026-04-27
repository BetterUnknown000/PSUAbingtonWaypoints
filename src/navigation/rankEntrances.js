/**
 * rankEntrances.js
 *
 * Ranks all valid building entrances by real walking distance/duration
 * using ORS directions API (one call per entrance, parallelized).
 *
 * Replaces the old selectedDestinationEntrance which just picked the
 * nearest entrance by straight-line GPS distance — which is wrong when
 * buildings have entrances on opposite sides or accessible-only entrances
 * that aren't the closest.
 *
 * Usage:
 *   const ranked = await rankEntrances({
 *     userGps,
 *     entrances,         // array of waypoint objects with lat/lon
 *     accessibilityMode, // boolean
 *     orsApiKey,         // string
 *   });
 *   // returns array sorted by walking duration, closest first
 */
 
const ORS_BASE = "https://api.openrouteservice.org/v2/directions/foot-walking";
 
// ─── Main export ─────────────────────────────────────────────────────────────
 
export async function rankEntrances({
  userGps,
  entrances = [],
  accessibilityMode = false,
  orsApiKey,
  timeoutMs = 8000,
}) {
  if (!userGps || entrances.length === 0) return [];
 
  // Filter to entrances that have GPS coordinates
  const valid = entrances.filter(
    (e) =>
      e.latitude != null &&
      e.longitude != null &&
      Number.isFinite(Number(e.latitude)) &&
      Number.isFinite(Number(e.longitude))
  );
 
  if (valid.length === 0) return [];
 
  // If accessibility mode, prefer accessible entrances.
  // If none are marked accessible, fall back to all.
  let candidates = valid;
  if (accessibilityMode) {
    const accessible = valid.filter((e) => e.accessible === true);
    if (accessible.length > 0) candidates = accessible;
  }
 
  // If only one candidate, skip the ORS calls
  if (candidates.length === 1) {
    return [{ ...candidates[0], walkingDistanceM: null, walkingDurationS: null }];
  }
 
  // Fire parallel ORS requests for each entrance
  const results = await Promise.allSettled(
    candidates.map((entrance) =>
      fetchWalkingRoute({
        userGps,
        destinationGps: {
          latitude: Number(entrance.latitude),
          longitude: Number(entrance.longitude),
        },
        orsApiKey,
        timeoutMs,
      }).then((route) => ({
        ...entrance,
        walkingDistanceM: route?.distanceM ?? null,
        walkingDurationS: route?.durationS ?? null,
      }))
    )
  );
 
  // Collect successful results
  const ranked = results
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value);
 
  // Sort by walking duration (shortest first), fall back to haversine
  ranked.sort((a, b) => {
    const aDur = a.walkingDurationS ?? haversineMeters(
      userGps.latitude, userGps.longitude,
      Number(a.latitude), Number(a.longitude)
    );
    const bDur = b.walkingDurationS ?? haversineMeters(
      userGps.latitude, userGps.longitude,
      Number(b.latitude), Number(b.longitude)
    );
    return aDur - bDur;
  });
 
  return ranked;
}
 
// ─── ORS single route fetch ───────────────────────────────────────────────────
 
async function fetchWalkingRoute({ userGps, destinationGps, orsApiKey, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
 
  try {
    const body = {
      coordinates: [
        [Number(userGps.longitude), Number(userGps.latitude)],
        [Number(destinationGps.longitude), Number(destinationGps.latitude)],
      ],
    };
 
    const headers = { "Content-Type": "application/json" };
    if (orsApiKey) headers["Authorization"] = orsApiKey;
 
    const response = await fetch(`${ORS_BASE}/geojson`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
 
    if (!response.ok) return null;
 
    const data = await response.json();
    const summary = data?.features?.[0]?.properties?.summary;
 
    return {
      distanceM: summary?.distance ?? null,
      durationS: summary?.duration ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
 
// ─── Haversine fallback ───────────────────────────────────────────────────────
 
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
 
// ─── Proximity check ─────────────────────────────────────────────────────────
 
/**
 * Returns true if the user is within thresholdMeters of any entrance in the list.
 * Used to trigger NEAR_ENTRANCE_CANDIDATE in the nav reducer.
 */
export function isNearAnyEntrance(userGps, entrances, thresholdMeters = 20) {
  if (!userGps || !Array.isArray(entrances)) return false;
 
  return entrances.some((e) => {
    if (e.latitude == null || e.longitude == null) return false;
    const dist = haversineMeters(
      Number(userGps.latitude),
      Number(userGps.longitude),
      Number(e.latitude),
      Number(e.longitude)
    );
    return dist <= thresholdMeters;
  });
}
 
/**
 * Returns the nearest entrance waypoint to userGps, or null.
 */
export function getNearestEntrance(userGps, entrances) {
  if (!userGps || !Array.isArray(entrances) || entrances.length === 0) return null;
 
  let nearest = null;
  let nearestDist = Infinity;
 
  for (const e of entrances) {
    if (e.latitude == null || e.longitude == null) continue;
    const dist = haversineMeters(
      Number(userGps.latitude),
      Number(userGps.longitude),
      Number(e.latitude),
      Number(e.longitude)
    );
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = e;
    }
  }
 
  return nearest;
}
 

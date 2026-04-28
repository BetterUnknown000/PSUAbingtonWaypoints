/**
 * rankEntrances.js
 *
 * Ranks all valid building entrances by real walking duration
 * using the ORS Matrix endpoint — one request for all entrances.
 * Falls back to haversine if ORS is unavailable or unauthenticated.
 */

const ORS_MATRIX = "https://api.openrouteservice.org/v2/matrix/foot-walking";

// ─── Main export ─────────────────────────────────────────────────────────────

export async function rankEntrances({
  userGps,
  entrances = [],
  accessibilityMode = false,
  orsApiKey,
  timeoutMs = 8000,
}) {
  if (!userGps || entrances.length === 0) return [];

  // Filter to entrances with GPS coordinates
  const valid = entrances.filter(
    (e) =>
      e.latitude != null &&
      e.longitude != null &&
      Number.isFinite(Number(e.latitude)) &&
      Number.isFinite(Number(e.longitude))
  );

  if (valid.length === 0) return [];

  // Accessibility filter — fall back to all if none marked accessible
  let candidates = valid;
  if (accessibilityMode) {
    const accessible = valid.filter((e) => e.accessible === true);
    if (accessible.length > 0) candidates = accessible;
  }

  // Single candidate — skip ORS entirely
  if (candidates.length === 1) {
    return [{ ...candidates[0], walkingDistanceM: null, walkingDurationS: null }];
  }

  // Use approach coordinates if available, else fall back to doorway GPS
  const candidatesWithCoords = candidates.map((e) => ({
    ...e,
    _routeLat: Number(e.approach_latitude ?? e.latitude),
    _routeLng: Number(e.approach_longitude ?? e.longitude),
  }));

  try {
    const ranked = await fetchOrsMatrix({
      userGps,
      candidates: candidatesWithCoords,
      orsApiKey,
      timeoutMs,
    });
    if (ranked) {
      // Debug log so bad rankings are visible during QA
      console.log(
        "[rankEntrances] ORS ranked:",
        ranked.map((e) => ({
          id: e.id,
          label: e.label,
          durationS: e.walkingDurationS,
          distanceM: e.walkingDistanceM,
        }))
      );
      return ranked;
    }
  } catch {
    // Fall through to haversine
  }

  // Haversine fallback
  return [...candidatesWithCoords].sort((a, b) =>
    haversineMeters(userGps.latitude, userGps.longitude, a._routeLat, a._routeLng) -
    haversineMeters(userGps.latitude, userGps.longitude, b._routeLat, b._routeLng)
  );
}

// ─── ORS Matrix fetch ─────────────────────────────────────────────────────────

async function fetchOrsMatrix({ userGps, candidates, orsApiKey, timeoutMs }) {
  if (!orsApiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Matrix: user is source (index 0), entrances are destinations (indices 1..N)
    const locations = [
      [Number(userGps.longitude), Number(userGps.latitude)],
      ...candidates.map((e) => [e._routeLng, e._routeLat]),
    ];

    const body = {
      locations,
      sources: [0],
      destinations: candidates.map((_, i) => i + 1),
      metrics: ["duration", "distance"],
    };

    const response = await fetch(ORS_MATRIX, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: orsApiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const data = await response.json();
    const durations = data?.durations?.[0];
    const distances = data?.distances?.[0];

    if (!durations) return null;

    const ranked = candidates.map((entrance, idx) => ({
      ...entrance,
      walkingDurationS: durations[idx] ?? null,
      walkingDistanceM: distances?.[idx] ?? null,
    }));

    ranked.sort((a, b) => {
      const aDur = a.walkingDurationS ?? Infinity;
      const bDur = b.walkingDurationS ?? Infinity;
      return aDur - bDur;
    });

    return ranked;
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

// ─── Proximity helpers ────────────────────────────────────────────────────────

export function isNearAnyEntrance(userGps, entrances, thresholdMeters = 20) {
  if (!userGps || !Array.isArray(entrances)) return false;
  return entrances.some((e) => {
    if (e.latitude == null || e.longitude == null) return false;
    return haversineMeters(
      Number(userGps.latitude), Number(userGps.longitude),
      Number(e.latitude), Number(e.longitude)
    ) <= thresholdMeters;
  });
}

export function getNearestEntrance(userGps, entrances) {
  if (!userGps || !Array.isArray(entrances) || entrances.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of entrances) {
    if (e.latitude == null || e.longitude == null) continue;
    const dist = haversineMeters(
      Number(userGps.latitude), Number(userGps.longitude),
      Number(e.latitude), Number(e.longitude)
    );
    if (dist < nearestDist) { nearestDist = dist; nearest = e; }
  }
  return nearest;
}

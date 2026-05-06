/**
 * rankEntrances.js
 *
 * Ranks all valid building entrances by real walking duration
 * using the ORS Matrix endpoint through the app proxy.
 * Falls back to haversine if the proxy is unavailable.
 */

const ORS_BASE = "https://api.heigit.org/openrouteservice/v2";
const ORS_KEY  = process.env.EXPO_PUBLIC_ORS_API_KEY || "";

export async function rankEntrances({
  userGps,
  entrances = [],
  apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "",
  accessibilityMode = false,
  timeoutMs = 8000,
}) {
  if (!userGps || !Array.isArray(entrances) || entrances.length === 0) {
    return [];
  }

  const valid = entrances
    .filter((e) =>
      Number.isFinite(Number(e?.latitude)) &&
      Number.isFinite(Number(e?.longitude))
    )
    .filter((e) => e.public !== false)
    .filter((e) => e.qr_deployed !== false)
    .filter((e) => {
      const label = normalizeLabel(e?.label);
      // If explicit public metadata is absent, exclude obvious room-only doors.
      return e.public === true ? true : !label.startsWith("room ");
    })
    .map((e) => ({
      ...e,
      _routeLat: Number(e.approach_latitude ?? e.latitude),
      _routeLng: Number(e.approach_longitude ?? e.longitude),
    }))
    .filter((e) =>
      Number.isFinite(e._routeLat) &&
      Number.isFinite(e._routeLng)
    );

  if (valid.length === 0) {
    return [];
  }

  let candidates = valid;
  if (accessibilityMode) {
    const accessible = valid.filter((e) => e.accessible === true);
    if (accessible.length > 0) {
      candidates = accessible;
    }
  }

  if (candidates.length === 1) {
    const only = candidates[0];
    return [
      {
        ...only,
        walkingDistanceM: haversineMeters(
          Number(userGps.latitude),
          Number(userGps.longitude),
          only._routeLat,
          only._routeLng
        ),
        walkingDurationS: null,
      },
    ];
  }

  const normalizedBase = String(apiBaseUrl || "").replace(/\/$/, "");
  if (!normalizedBase) {
    return sortByHaversine(userGps, candidates);
  }

  const ranked = await fetchOrsMatrix({
    userGps,
    candidates,
    apiBaseUrl: normalizedBase,
    timeoutMs,
  });

  return ranked || sortByHaversine(userGps, candidates);
}

async function fetchOrsMatrix({ userGps, candidates, apiBaseUrl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const body = {
      profile: "foot-walking",
      locations: [
        [Number(userGps.longitude), Number(userGps.latitude)],
        ...candidates.map((e) => [e._routeLng, e._routeLat]),
      ],
      sources: [0],
      destinations: candidates.map((_, i) => i + 1),
      metrics: ["distance", "duration"],
    };

    const response = await fetch(`${apiBaseUrl}/ors/matrix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    const json = await response.json();
    const durations = json?.durations?.[0];
    const distances = json?.distances?.[0];

    if (!Array.isArray(durations)) return null;

    return candidates
      .map((e, idx) => ({
        ...e,
        walkingDurationS: durations[idx] ?? Infinity,
        walkingDistanceM: distances?.[idx] ?? Infinity,
      }))
      .sort((a, b) => (a.walkingDurationS ?? Infinity) - (b.walkingDurationS ?? Infinity));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sortByHaversine(userGps, entrances) {
  return [...entrances]
    .map((e) => ({
      ...e,
      walkingDistanceM: haversineMeters(
        Number(userGps.latitude),
        Number(userGps.longitude),
        e._routeLat,
        e._routeLng
      ),
      walkingDurationS: Infinity,
    }))
    .sort((a, b) => (a.walkingDistanceM ?? Infinity) - (b.walkingDistanceM ?? Infinity));
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

export function isNearAnyEntrance(userGps, entrances, thresholdMeters = 20) {
  if (!userGps || !Array.isArray(entrances)) return false;
  return entrances.some((e) => {
    if (e.latitude == null || e.longitude == null) return false;
    return haversineMeters(
      Number(userGps.latitude),
      Number(userGps.longitude),
      Number(e.latitude),
      Number(e.longitude)
    ) <= thresholdMeters;
  });
}

export function getNearestEntrance(userGps, entrances) {
  if (!userGps || !Array.isArray(entrances) || entrances.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const e of entrances) {
    const lat = Number(e.approach_latitude ?? e.latitude);
    const lng = Number(e.approach_longitude ?? e.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const dist = haversineMeters(
      Number(userGps.latitude),
      Number(userGps.longitude),
      lat,
      lng
    );
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = e;
    }
  }

  return nearest;
}

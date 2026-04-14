import * as Location from "expo-location";

// Request foreground GPS permission from the user
export async function requestForegroundLocationPermission() {
  const result = await Location.requestForegroundPermissionsAsync();
  return result;
}

// Get the user's current GPS location once
export async function getCurrentUserLocation() {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude
  };
}

// Watch the user's GPS location continuously
export async function watchUserLocation(callback) {
  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 3000,
      distanceInterval: 3
    },
    (position) => {
      callback({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
    }
  );
}

// Calculate straight-line distance between two GPS points in meters
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
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

// Calculate compass bearing from one GPS point to another
export function calculateBearingDegrees(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const lambda1 = toRad(lon1);
  const lambda2 = toRad(lon2);

  const y = Math.sin(lambda2 - lambda1) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda2 - lambda1);

  let bearing = toDeg(Math.atan2(y, x));
  bearing = (bearing + 360) % 360;

  return bearing;
}

// Get bearing from current user position to a waypoint/building
export function getBearingToWaypoint(fromPosition, toWaypoint) {
  if (
    !fromPosition ||
    fromPosition.latitude == null ||
    fromPosition.longitude == null ||
    !toWaypoint ||
    toWaypoint.latitude == null ||
    toWaypoint.longitude == null
  ) {
    return null;
  }

  return calculateBearingDegrees(
    Number(fromPosition.latitude),
    Number(fromPosition.longitude),
    Number(toWaypoint.latitude),
    Number(toWaypoint.longitude)
  );
}

// Check if user is close enough to a waypoint
export function isNearWaypoint(position, waypoint, thresholdMeters = 8) {
  if (
    !position ||
    position.latitude == null ||
    position.longitude == null ||
    !waypoint ||
    waypoint.latitude == null ||
    waypoint.longitude == null
  ) {
    return false;
  }

  const distance = haversineDistanceMeters(
    Number(position.latitude),
    Number(position.longitude),
    Number(waypoint.latitude),
    Number(waypoint.longitude)
  );

  return distance <= thresholdMeters;
}

// Check if user is near the destination building
export function isNearDestinationBuilding(
  userGps,
  destinationBuilding,
  thresholdMeters = 40
) {
  if (
    !userGps ||
    userGps.latitude == null ||
    userGps.longitude == null ||
    !destinationBuilding ||
    destinationBuilding.latitude == null ||
    destinationBuilding.longitude == null
  ) {
    return false;
  }

  const distance = haversineDistanceMeters(
    Number(userGps.latitude),
    Number(userGps.longitude),
    Number(destinationBuilding.latitude),
    Number(destinationBuilding.longitude)
  );

  return distance <= thresholdMeters;
}

// Format distance for UI display
export function formatDistanceMeters(meters = 0) {
  const m = Number(meters || 0);
  const ft = m * 3.28084;

  return {
    metersText: `${m.toFixed(1)} m`,
    feetText: `${ft.toFixed(0)} ft`
  };
}

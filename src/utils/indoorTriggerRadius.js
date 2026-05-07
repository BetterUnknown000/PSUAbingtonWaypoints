export const INDOOR_TRIGGER_RADIUS_MULTIPLIER = 1.25;
export const INDOOR_SCAN_FALLBACK_RADIUS_M = 3;
export const INDOOR_PASSIVE_FALLBACK_RADIUS_M = 5;
export const INDOOR_VERTICAL_TRIGGER_MIN_M = 11;

export function getIndoorTriggerRadiusM(rawRadius, fallbackRadius, minimumRadius = 0) {
  const numeric = Number(rawRadius);
  const baseRadius = Number.isFinite(numeric) && numeric > 0
    ? numeric
    : fallbackRadius;

  return Math.max(minimumRadius, baseRadius * INDOOR_TRIGGER_RADIUS_MULTIPLIER);
}

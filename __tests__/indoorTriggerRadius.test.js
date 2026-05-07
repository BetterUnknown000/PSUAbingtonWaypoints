import {
  getIndoorTriggerRadiusM,
  INDOOR_PASSIVE_FALLBACK_RADIUS_M,
  INDOOR_SCAN_FALLBACK_RADIUS_M,
  INDOOR_VERTICAL_TRIGGER_MIN_M,
} from "../src/utils/indoorTriggerRadius";

describe("getIndoorTriggerRadiusM", () => {
  test("expands explicit waypoint radius", () => {
    expect(getIndoorTriggerRadiusM(4, INDOOR_SCAN_FALLBACK_RADIUS_M)).toBe(5);
  });

  test("expands fallback radius when waypoint radius is missing", () => {
    expect(getIndoorTriggerRadiusM(undefined, INDOOR_PASSIVE_FALLBACK_RADIUS_M)).toBe(6.25);
  });

  test("uses vertical minimum when expanded radius is still too small", () => {
    expect(getIndoorTriggerRadiusM(3, INDOOR_SCAN_FALLBACK_RADIUS_M, INDOOR_VERTICAL_TRIGGER_MIN_M)).toBe(11);
  });
});

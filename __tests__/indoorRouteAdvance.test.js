import { getIndoorTargetAdvance } from "../src/utils/indoorRouteAdvance";

describe("getIndoorTargetAdvance", () => {
  const currentWaypoint = { id: "a", x: 0, y: 0 };
  const targetWaypoint = { id: "b", x: 10, y: 0, requires_scan: false };

  test("advances passive waypoint inside its radius", () => {
    const result = getIndoorTargetAdvance({
      currentWaypoint,
      targetWaypoint,
      currentPose: { x: 9, y: 0 },
      metersPerPx: 1,
      stopRadiusM: 2,
    });

    expect(result).toMatchObject({
      advanced: true,
      reason: "within_radius",
    });
  });

  test("advances passive waypoint after the user crosses it between updates", () => {
    const result = getIndoorTargetAdvance({
      currentWaypoint,
      targetWaypoint,
      currentPose: { x: 14, y: 1 },
      metersPerPx: 1,
      stopRadiusM: 2,
    });

    expect(result).toMatchObject({
      advanced: true,
      reason: "passed_target",
    });
  });

  test("does not auto-advance required-scan anchors", () => {
    const result = getIndoorTargetAdvance({
      currentWaypoint,
      targetWaypoint: { ...targetWaypoint, requires_scan: true },
      currentPose: { x: 10, y: 0 },
      metersPerPx: 1,
      stopRadiusM: 2,
    });

    expect(result).toMatchObject({
      advanced: false,
      reason: "requires_scan",
    });
  });
});

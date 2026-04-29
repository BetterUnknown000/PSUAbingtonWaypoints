const { isNearAnyEntrance, getNearestEntrance } =
  require("../src/navigation/rankEntrances");

const USER_GPS = { latitude: 40.1160, longitude: -75.1100 };

const ENTRANCES = [
  {
    id: "main",
    latitude: 40.1161,
    longitude: -75.1101,
  },
  {
    id: "side",
    latitude: 40.1165,
    longitude: -75.1108,
    approach_latitude: 40.1164,
    approach_longitude: -75.1107,
  },
];

describe("isNearAnyEntrance", () => {
  test("returns true when within threshold", () => {
    const near = { latitude: 40.11611, longitude: -75.11011 };
    expect(isNearAnyEntrance(near, ENTRANCES, 20)).toBe(true);
  });

  test("returns false when outside threshold", () => {
    const far = { latitude: 40.1200, longitude: -75.1200 };
    expect(isNearAnyEntrance(far, ENTRANCES, 20)).toBe(false);
  });
});

describe("getNearestEntrance", () => {
  test("prefers nearest entrance using approach coordinates when present", () => {
    const nearest = getNearestEntrance(USER_GPS, ENTRANCES);
    expect(nearest.id).toBe("main");
  });

  test("returns null for empty entrances", () => {
    expect(getNearestEntrance(USER_GPS, [])).toBeNull();
  });
});

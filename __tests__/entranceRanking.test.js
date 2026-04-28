/**
 * entranceRanking.test.js
 *
 * Tests for entrance ranking logic — verifies that real walking distance
 * is used when ORS is available, and haversine is used as fallback.
 */

// Mock fetch so we don't make real network calls
global.fetch = jest.fn();

const { rankEntrances, isNearAnyEntrance, getNearestEntrance } =
  require("../src/navigation/rankEntrances");

const USER_GPS = { latitude: 40.1160, longitude: -75.1100 };

const ENTRANCES = [
  {
    id: "main",
    latitude: 40.1161,
    longitude: -75.1101,
    accessible: true,
  },
  {
    id: "side",
    latitude: 40.1165,
    longitude: -75.1108,
    accessible: false,
  },
  {
    id: "back",
    latitude: 40.1170,
    longitude: -75.1115,
    accessible: true,
  },
];

beforeEach(() => {
  fetch.mockReset();
});

describe("rankEntrances", () => {
  test("returns empty array if no userGps", async () => {
    const result = await rankEntrances({ userGps: null, entrances: ENTRANCES });
    expect(result).toEqual([]);
  });

  test("returns empty array if no entrances", async () => {
    const result = await rankEntrances({ userGps: USER_GPS, entrances: [] });
    expect(result).toEqual([]);
  });

  test("sorts by ORS walking duration when fetch succeeds", async () => {
    // Mock ORS returning different durations for each entrance
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ properties: { summary: { distance: 120, duration: 90 } } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ properties: { summary: { distance: 300, duration: 240 } } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [{ properties: { summary: { distance: 500, duration: 400 } } }],
        }),
      });

    const result = await rankEntrances({ userGps: USER_GPS, entrances: ENTRANCES });
    expect(result[0].id).toBe("main"); // shortest duration = 90s
    expect(result[1].id).toBe("side"); // 240s
    expect(result[2].id).toBe("back"); // 400s
  });

  test("falls back to haversine order when ORS fails", async () => {
    fetch.mockRejectedValue(new Error("Network error"));

    const result = await rankEntrances({ userGps: USER_GPS, entrances: ENTRANCES });
    // Should still return results, sorted by haversine
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe("main"); // closest by haversine
  });

  test("filters to accessible only when accessibilityMode is true", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{ properties: { summary: { distance: 100, duration: 80 } } }],
      }),
    });

    const result = await rankEntrances({
      userGps: USER_GPS,
      entrances: ENTRANCES,
      accessibilityMode: true,
    });

    const ids = result.map((e) => e.id);
    expect(ids).not.toContain("side"); // side is not accessible
  });
});

describe("isNearAnyEntrance", () => {
  test("returns true when within threshold", () => {
    const near = { latitude: 40.11611, longitude: -75.11011 }; // ~10m from main
    expect(isNearAnyEntrance(near, ENTRANCES, 20)).toBe(true);
  });

  test("returns false when outside threshold", () => {
    const far = { latitude: 40.1200, longitude: -75.1200 }; // far away
    expect(isNearAnyEntrance(far, ENTRANCES, 20)).toBe(false);
  });

  test("returns false with no userGps", () => {
    expect(isNearAnyEntrance(null, ENTRANCES, 20)).toBe(false);
  });
});

describe("getNearestEntrance", () => {
  test("returns the nearest entrance", () => {
    const nearest = getNearestEntrance(USER_GPS, ENTRANCES);
    expect(nearest.id).toBe("main");
  });

  test("returns null for empty entrances", () => {
    expect(getNearestEntrance(USER_GPS, [])).toBeNull();
  });
});

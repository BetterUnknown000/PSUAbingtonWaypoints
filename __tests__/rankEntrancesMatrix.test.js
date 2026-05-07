global.fetch = jest.fn();

const { rankEntrances } = require("../src/navigation/rankEntrances");

test("ranks entrances by matrix duration and prefers approach coordinates", async () => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      durations: [[90, 220]],
      distances: [[120, 300]],
    }),
  });

  const entrances = [
    {
      id: "side",
      latitude: 40.1169,
      longitude: -75.1110,
      approach_latitude: 40.1168,
      approach_longitude: -75.1111,
      public: true,
      qr_deployed: true,
    },
    {
      id: "main",
      latitude: 40.1167,
      longitude: -75.1109,
      public: true,
      qr_deployed: true,
    },
  ];

  const ranked = await rankEntrances({
    userGps: { latitude: 40.1160, longitude: -75.1100 },
    entrances,
    apiBaseUrl: "https://example-proxy.test",
  });

  expect(ranked[0].id).toBe("side");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe("https://example-proxy.test/ors/matrix");

  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.locations[0]).toEqual([-75.11, 40.116]);
  expect(body.locations[1]).toEqual([-75.1111, 40.1168]); // approach point
  expect(body.locations[2]).toEqual([-75.1109, 40.1167]); // doorway fallback
});

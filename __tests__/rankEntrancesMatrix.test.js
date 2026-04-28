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
});

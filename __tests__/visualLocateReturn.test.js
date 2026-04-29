test("visual locate return preserves route key and destination params", () => {
  const route = {
    params: {
      returnRouteKey: "route-123",
      returnScreen: "NavigationPage",
      returnParams: {
        destination: {
          room: { building: "woodland", room_number: "205" },
        },
        accessibilityMode: true,
      },
    },
  };

  const payload = {
    waypointId: "wp_wood_f1_hall_a",
    label: "Woodland Hallway A",
    building: "woodland",
    floor: "1",
  };

  const navigateArg = {
    key: route.params.returnRouteKey,
    name: route.params.returnScreen || "Navigation",
    params: {
      ...(route.params.returnParams || {}),
      visualLocateResult: payload,
    },
    merge: true,
    pop: true,
  };

  expect(navigateArg.key).toBe("route-123");
  expect(navigateArg.name).toBe("NavigationPage");
  expect(navigateArg.params.destination.room.room_number).toBe("205");
  expect(navigateArg.params.visualLocateResult.waypointId).toBe("wp_wood_f1_hall_a");
  expect(navigateArg.merge).toBe(true);
  expect(navigateArg.pop).toBe(true);
});

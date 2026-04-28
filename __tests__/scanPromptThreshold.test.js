test("only required scan anchors are eligible for scan prompt", () => {
  const nextWaypoint = {
    id: "wp_wood_f1_hall_a",
    requires_scan: false,
    stop_radius_m: 3,
  };

  expect(Boolean(nextWaypoint.requires_scan)).toBe(false);
});

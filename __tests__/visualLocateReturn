test("linked start anchor is consumed only once", () => {
  const applied = { current: false };

  function consume(linkedStartWaypoint) {
    if (!linkedStartWaypoint) return null;
    if (applied.current) return null;
    applied.current = true;
    return linkedStartWaypoint.id;
  }

  expect(consume({ id: "wp_wood_main_entrance" })).toBe("wp_wood_main_entrance");
  expect(consume({ id: "wp_wood_main_entrance" })).toBeNull();
});

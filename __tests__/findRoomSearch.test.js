const {
  findRoom,
  findRoomByQuery,
} = require("../src/utils/findRoom");

describe("keyword room search", () => {
  test("Cafe resolves to the Lares dining room waypoint", () => {
    const result = findRoomByQuery("Cafe");

    expect(result?.room?.building).toBe("lares");
    expect(result?.room?.waypoint_id).toBe("wp_dining_room");
    expect(result?.waypoint?.id).toBe("wp_dining_room");
  });

  test("Lost and Found resolves to Rydal 106", () => {
    const result = findRoomByQuery("Lost and Found");

    expect(result?.room?.building).toBe("rydal");
    expect(result?.room?.waypoint_id).toBe("wp_rydal_106");
    expect(result?.waypoint?.id).toBe("wp_rydal_106");
  });

  test("Library resolves to the Woodland library waypoint", () => {
    const result = findRoomByQuery("Library");

    expect(result?.room?.building).toBe("woodland");
    expect(result?.room?.waypoint_id).toBe("wp_wood_library_f1");
    expect(result?.waypoint?.id).toBe("wp_wood_library_f1");
  });

  test("building-scoped alias still works during navigation rebuilds", () => {
    const result = findRoom("woodland", "Library");

    expect(result?.room?.waypoint_id).toBe("wp_wood_library_f1");
  });

  test("ordinary room number search still works", () => {
    const result = findRoom("sutherland", "218");

    expect(result?.room?.building).toBe("sutherland");
    expect(result?.room?.room_number).toBe("218");
  });
});

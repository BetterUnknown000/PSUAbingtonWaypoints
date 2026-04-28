/**
 * navReducer.test.js
 *
 * Tests for the navigation state machine.
 * Verifies that indoor mode only activates after a real QR scan,
 * and that scan prompts appear at the right time.
 */

const {
  navReducer,
  initialNavState,
  NavEvent,
  NavMode,
  isIndoorMode,
  isOutdoorMode,
  shouldShowArrow,
  shouldShowScanPrompt,
  getScanPromptMessage,
} = require("../src/navigation/navReducer");

describe("navReducer — destination", () => {
  test("starts in IDLE mode", () => {
    expect(initialNavState.mode).toBe(NavMode.IDLE);
  });

  test("SET_DESTINATION moves to OUTDOOR_ROUTE", () => {
    const state = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
      destinationRoomNumber: "205",
    });
    expect(state.mode).toBe(NavMode.OUTDOOR_ROUTE);
    expect(state.destinationBuildingId).toBe("woodland");
  });

  test("RESET returns to IDLE", () => {
    let state = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    state = navReducer(state, { type: NavEvent.RESET });
    expect(state.mode).toBe(NavMode.IDLE);
  });
});

describe("navReducer — outdoor to indoor transition", () => {
  test("does NOT switch indoors from GPS alone", () => {
    const outdoor = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    // Simulate GPS building guess — should be ignored
    const stillOutdoor = navReducer(outdoor, {
      type: "GPS_BUILDING_GUESS",
      buildingId: "woodland",
    });
    expect(isIndoorMode(stillOutdoor)).toBe(false);
    expect(isOutdoorMode(stillOutdoor)).toBe(true);
  });

  test("NEAR_ENTRANCE_CANDIDATE moves to AWAIT_ENTRY_QR", () => {
    const outdoor = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    const waiting = navReducer(outdoor, {
      type: NavEvent.NEAR_ENTRANCE_CANDIDATE,
    });
    expect(waiting.mode).toBe(NavMode.AWAIT_ENTRY_QR);
  });

  test("LEFT_ENTRANCE_AREA goes back to OUTDOOR_ROUTE", () => {
    let state = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    state = navReducer(state, { type: NavEvent.NEAR_ENTRANCE_CANDIDATE });
    state = navReducer(state, { type: NavEvent.LEFT_ENTRANCE_AREA });
    expect(state.mode).toBe(NavMode.OUTDOOR_ROUTE);
  });

  test("valid entrance QR scan moves to INDOOR_ANCHORED", () => {
    let state = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    state = navReducer(state, { type: NavEvent.NEAR_ENTRANCE_CANDIDATE });
    state = navReducer(state, {
      type: NavEvent.SCAN_QR,
      qr: {
        role: "entrance",
        type: "entrance",
        building: "woodland",
        buildingId: "woodland",
        floor: "1",
        waypointId: "wp_wood_main_entrance",
        x: 80,
        y: 140,
      },
    });
    expect(state.mode).toBe(NavMode.INDOOR_ANCHORED);
    expect(state.currentWaypointId).toBe("wp_wood_main_entrance");
    expect(state.anchorPose.x).toBe(80);
    expect(state.anchorPose.y).toBe(140);
  });

  test("wrong building entrance QR does not trigger indoor mode", () => {
    let state = navReducer(initialNavState, {
      type: NavEvent.SET_DESTINATION,
      destinationBuildingId: "woodland",
    });
    state = navReducer(state, { type: NavEvent.NEAR_ENTRANCE_CANDIDATE });
    state = navReducer(state, {
      type: NavEvent.SCAN_QR,
      qr: {
        role: "entrance",
        type: "entrance",
        building: "sutherland",
        buildingId: "sutherland",
        floor: "1",
        waypointId: "wp_suth_main_entrance",
        x: 0,
        y: 0,
      },
    });
    expect(state.mode).toBe(NavMode.AWAIT_ENTRY_QR);
  });
});

describe("navReducer — indoor progression", () => {
  const indoorState = {
    ...initialNavState,
    mode: NavMode.INDOOR_ANCHORED,
    destinationBuildingId: "woodland",
    currentBuildingId: "woodland",
    currentWaypointId: "wp_wood_f1_hall_a",
    anchorPose: { x: 100, y: 200, floor: "1", building: "woodland", source: "qr" },
  };

  test("NEAR_REQUIRED_ANCHOR moves to AWAIT_SCAN_ANCHOR", () => {
    const state = navReducer(indoorState, {
      type: NavEvent.NEAR_REQUIRED_ANCHOR,
      anchorWaypointId: "wp_wood_f1_stairs_a",
      anchorType: "stairs",
    });
    expect(state.mode).toBe(NavMode.AWAIT_SCAN_ANCHOR);
    expect(shouldShowScanPrompt(state)).toBe(true);
  });

  test("scanning stairs from AWAIT_SCAN_ANCHOR moves to VERTICAL_TRANSFER", () => {
    let state = navReducer(indoorState, {
      type: NavEvent.NEAR_REQUIRED_ANCHOR,
      anchorWaypointId: "wp_wood_f1_stairs_a",
      anchorType: "stairs",
    });
    state = navReducer(state, {
      type: NavEvent.SCAN_QR,
      qr: {
        role: "stairs",
        type: "stairs",
        building: "woodland",
        buildingId: "woodland",
        floor: "1",
        waypointId: "wp_wood_f1_stairs_a",
        x: 494,
        y: 435,
      },
    });
    expect(state.mode).toBe(NavMode.VERTICAL_TRANSFER);
  });

  test("DESTINATION_REACHED moves to ARRIVED", () => {
    const state = navReducer(indoorState, {
      type: NavEvent.DESTINATION_REACHED,
    });
    expect(state.mode).toBe(NavMode.ARRIVED);
  });

  test("QR scan updates anchor pose", () => {
    const state = navReducer(indoorState, {
      type: NavEvent.SCAN_QR,
      qr: {
        role: "hallway",
        type: "hallway",
        building: "woodland",
        buildingId: "woodland",
        floor: "1",
        waypointId: "wp_wood_f1_hall_b",
        x: 300,
        y: 400,
      },
    });
    expect(state.anchorPose.x).toBe(300);
    expect(state.anchorPose.y).toBe(400);
    expect(state.currentWaypointId).toBe("wp_wood_f1_hall_b");
  });
});

describe("navReducer — selectors", () => {
  test("isIndoorMode returns true for INDOOR_ANCHORED", () => {
    const state = { ...initialNavState, mode: NavMode.INDOOR_ANCHORED };
    expect(isIndoorMode(state)).toBe(true);
  });

  test("isIndoorMode returns true for AWAIT_SCAN_ANCHOR", () => {
    const state = { ...initialNavState, mode: NavMode.AWAIT_SCAN_ANCHOR };
    expect(isIndoorMode(state)).toBe(true);
  });

  test("isOutdoorMode returns true for OUTDOOR_ROUTE", () => {
    const state = { ...initialNavState, mode: NavMode.OUTDOOR_ROUTE };
    expect(isOutdoorMode(state)).toBe(true);
  });

  test("shouldShowArrow only when INDOOR_ANCHORED with valid pose", () => {
    const withPose = {
      ...initialNavState,
      mode: NavMode.INDOOR_ANCHORED,
      anchorPose: { x: 100, y: 200, source: "qr" },
    };
    expect(shouldShowArrow(withPose)).toBe(true);

    const noPose = { ...initialNavState, mode: NavMode.INDOOR_ANCHORED };
    expect(shouldShowArrow(noPose)).toBe(false);
  });

  test("shouldShowScanPrompt for AWAIT_ENTRY_QR", () => {
    const state = { ...initialNavState, mode: NavMode.AWAIT_ENTRY_QR };
    expect(shouldShowScanPrompt(state)).toBe(true);
  });

  test("getScanPromptMessage for AWAIT_ENTRY_QR mentions entrance", () => {
    const state = { ...initialNavState, mode: NavMode.AWAIT_ENTRY_QR };
    expect(getScanPromptMessage(state)).toMatch(/entrance/i);
  });

  test("getScanPromptMessage for AWAIT_SCAN_ANCHOR stairs", () => {
    const state = {
      ...initialNavState,
      mode: NavMode.AWAIT_SCAN_ANCHOR,
      expectedQrRole: "stairs",
    };
    expect(getScanPromptMessage(state)).toMatch(/staircase/i);
  });
});

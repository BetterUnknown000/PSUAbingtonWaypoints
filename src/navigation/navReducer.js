
/**
 * navReducer.js
 *
 * Explicit navigation state machine for PSU Abington Waypoints.
 * Replaces the implicit viewMode / stageMode / forceIndoorAfterScan tangle
 * in NavigationPage.jsx with a single reducer that owns all mode transitions.
 *
 * Modes:
 *   IDLE               — no destination set yet
 *   OUTDOOR_ROUTE      — routing outdoors toward destination building
 *   AWAIT_ENTRY_QR     — user is near an entrance, waiting for them to scan it
 *   INDOOR_ANCHORED    — inside, have a known position, arrow is active
 *   AWAIT_SCAN_ANCHOR  — user needs to scan a required waypoint (stairs/elevator/entrance)
 *   VERTICAL_TRANSFER  — user is between floors, climbing stairs or in elevator
 *   AWAIT_EXIT_QR      — user needs to scan an exit QR to resume outdoor routing
 *   ARRIVED            — destination reached
 *   EMERGENCY_IDLE     — emergency mode, waiting for QR scan
 *   EMERGENCY_ROUTING  — emergency mode, routing to nearest exit
 */
 
export const NavMode = {
  IDLE: "IDLE",
  OUTDOOR_ROUTE: "OUTDOOR_ROUTE",
  AWAIT_ENTRY_QR: "AWAIT_ENTRY_QR",
  INDOOR_ANCHORED: "INDOOR_ANCHORED",
  AWAIT_SCAN_ANCHOR: "AWAIT_SCAN_ANCHOR",
  VERTICAL_TRANSFER: "VERTICAL_TRANSFER",
  AWAIT_EXIT_QR: "AWAIT_EXIT_QR",
  ARRIVED: "ARRIVED",
  EMERGENCY_IDLE: "EMERGENCY_IDLE",
  EMERGENCY_ROUTING: "EMERGENCY_ROUTING",
};
 
export const NavEvent = {
  // Destination
  SET_DESTINATION: "SET_DESTINATION",
  CLEAR_DESTINATION: "CLEAR_DESTINATION",
 
  // Outdoor
  NEAR_ENTRANCE_CANDIDATE: "NEAR_ENTRANCE_CANDIDATE",
  LEFT_ENTRANCE_AREA: "LEFT_ENTRANCE_AREA",
 
  // QR Scans
  SCAN_QR: "SCAN_QR",
 
  // Indoor
  NEAR_REQUIRED_ANCHOR: "NEAR_REQUIRED_ANCHOR",
  VERTICAL_TRANSFER_COMPLETE: "VERTICAL_TRANSFER_COMPLETE",
 
  // Arrival
  DESTINATION_REACHED: "DESTINATION_REACHED",
 
  // Emergency
  ACTIVATE_EMERGENCY: "ACTIVATE_EMERGENCY",
  DEACTIVATE_EMERGENCY: "DEACTIVATE_EMERGENCY",
 
  // Manual
  RESET: "RESET",
  FORCE_OUTDOOR: "FORCE_OUTDOOR",
};
 
export const initialNavState = {
  mode: NavMode.IDLE,
 
  // Destination
  destinationBuildingId: null,
  destinationRoomNumber: null,
  destinationWaypointId: null,
 
  // Current indoor position anchor (set only from QR scans)
  currentWaypointId: null,
  currentBuildingId: null,
  currentFloor: null,
  anchorPose: null, // { x, y, floor, building, source: "qr" }
 
  // Route
  pathIds: [],
  nextPathWaypointId: null,       // next waypoint for arrow geometry
  nextRequiredAnchorId: null,     // next waypoint the user MUST scan
 
  // Transition
  expectedQrRole: null,           // "entrance" | "stairs" | "elevator" | null
  pendingFloorTarget: null,       // floor number we're heading to
 
  // Emergency
  emergencyMode: false,
};
 
/**
 * Pure reducer — no side effects, no async.
 * All state transitions live here.
 */
export function navReducer(state, event) {
  switch (event.type) {
 
    // ─── Destination ────────────────────────────────────────────────────────
 
    case NavEvent.SET_DESTINATION: {
      return {
        ...initialNavState,
        mode: NavMode.OUTDOOR_ROUTE,
        destinationBuildingId: event.destinationBuildingId || null,
        destinationRoomNumber: event.destinationRoomNumber || null,
        destinationWaypointId: event.destinationWaypointId || null,
        emergencyMode: false,
      };
    }
 
    case NavEvent.CLEAR_DESTINATION:
    case NavEvent.RESET: {
      return { ...initialNavState };
    }
 
    // ─── Outdoor ────────────────────────────────────────────────────────────
 
    case NavEvent.NEAR_ENTRANCE_CANDIDATE: {
      if (state.mode !== NavMode.OUTDOOR_ROUTE) return state;
      return {
        ...state,
        mode: NavMode.AWAIT_ENTRY_QR,
        expectedQrRole: "entrance",
      };
    }
 
    case NavEvent.LEFT_ENTRANCE_AREA: {
      if (state.mode !== NavMode.AWAIT_ENTRY_QR) return state;
      return {
        ...state,
        mode: NavMode.OUTDOOR_ROUTE,
        expectedQrRole: null,
      };
    }
 
    // ─── QR Scan ────────────────────────────────────────────────────────────
 
    case NavEvent.SCAN_QR: {
      const { qr } = event;
      if (!qr) return state;
 
      const scannedBuildingId = qr.building || qr.buildingId || null;
      const scannedType = String(qr.type || "").toLowerCase();
      const scannedRole = qr.role || scannedType;
      const isEntrance = scannedRole === "entrance" ||
        scannedType === "entrance";
      const isStairs = scannedRole === "stairs" ||
        scannedType === "stairs";
      const isElevator = scannedRole === "elevator" ||
        scannedType === "elevator";
      const isVertical = isStairs || isElevator;
      const isCorrectBuilding =
        !state.destinationBuildingId ||
        scannedBuildingId === state.destinationBuildingId;
 
      // ── Awaiting entry QR ──
      if (state.mode === NavMode.AWAIT_ENTRY_QR) {
        if (isEntrance && isCorrectBuilding) {
          return {
            ...state,
            mode: NavMode.INDOOR_ANCHORED,
            currentWaypointId: qr.waypointId || qr.waypoint_id,
            currentBuildingId: scannedBuildingId,
            currentFloor: qr.floor,
            anchorPose: buildAnchorPose(qr),
            expectedQrRole: null,
          };
        }
        // Wrong building entrance — ignore or reroute
        return state;
      }
 
      // ── Already indoors — anchor update ──
      if (
        state.mode === NavMode.INDOOR_ANCHORED ||
        state.mode === NavMode.AWAIT_SCAN_ANCHOR
      ) {
        // Scanning an exit — go back outdoors
        if (
          isEntrance &&
          scannedBuildingId !== state.destinationBuildingId
        ) {
          return {
            ...state,
            mode: NavMode.OUTDOOR_ROUTE,
            currentWaypointId: null,
            currentBuildingId: null,
            currentFloor: null,
            anchorPose: null,
            expectedQrRole: null,
            nextRequiredAnchorId: null,
          };
        }
 
        // Scanning a vertical waypoint — start floor transfer
        if (isVertical) {
          return {
            ...state,
            mode: NavMode.VERTICAL_TRANSFER,
            currentWaypointId: qr.waypointId || qr.waypoint_id,
            currentFloor: qr.floor,
            anchorPose: buildAnchorPose(qr),
            expectedQrRole: null,
            nextRequiredAnchorId: null,
          };
        }
 
        // Normal indoor anchor update (hallway, room, etc.)
        return {
          ...state,
          mode: NavMode.INDOOR_ANCHORED,
          currentWaypointId: qr.waypointId || qr.waypoint_id,
          currentBuildingId: scannedBuildingId || state.currentBuildingId,
          currentFloor: qr.floor || state.currentFloor,
          anchorPose: buildAnchorPose(qr),
          nextRequiredAnchorId: null,
          expectedQrRole: null,
        };
      }
 
      // ── Vertical transfer — waiting for floor QR ──
      if (state.mode === NavMode.VERTICAL_TRANSFER) {
        if (isVertical || isEntrance) {
          return {
            ...state,
            mode: NavMode.INDOOR_ANCHORED,
            currentWaypointId: qr.waypointId || qr.waypoint_id,
            currentBuildingId: scannedBuildingId || state.currentBuildingId,
            currentFloor: qr.floor || state.currentFloor,
            anchorPose: buildAnchorPose(qr),
            expectedQrRole: null,
            nextRequiredAnchorId: null,
          };
        }
        return state;
      }
 
      // ── Outdoor scanner ──
      if (state.mode === NavMode.OUTDOOR_ROUTE) {
        if (isEntrance && isCorrectBuilding) {
          return {
            ...state,
            mode: NavMode.INDOOR_ANCHORED,
            currentWaypointId: qr.waypointId || qr.waypoint_id,
            currentBuildingId: scannedBuildingId,
            currentFloor: qr.floor,
            anchorPose: buildAnchorPose(qr),
            expectedQrRole: null,
          };
        }
        return state;
      }
 
      return state;
    }
 
    // ─── Indoor ─────────────────────────────────────────────────────────────
 
    case NavEvent.NEAR_REQUIRED_ANCHOR: {
      if (state.mode !== NavMode.INDOOR_ANCHORED) return state;
      return {
        ...state,
        mode: NavMode.AWAIT_SCAN_ANCHOR,
        nextRequiredAnchorId: event.anchorWaypointId,
        expectedQrRole: event.anchorType || null,
        pendingFloorTarget: event.targetFloor || null,
      };
    }
 
    case NavEvent.VERTICAL_TRANSFER_COMPLETE: {
      if (state.mode !== NavMode.VERTICAL_TRANSFER) return state;
      return {
        ...state,
        mode: NavMode.AWAIT_SCAN_ANCHOR,
        expectedQrRole: "stairs",
        pendingFloorTarget: event.targetFloor || null,
      };
    }
 
    // ─── Arrival ────────────────────────────────────────────────────────────
 
    case NavEvent.DESTINATION_REACHED: {
      return {
        ...state,
        mode: NavMode.ARRIVED,
        nextPathWaypointId: null,
        nextRequiredAnchorId: null,
      };
    }
 
    // ─── Emergency ──────────────────────────────────────────────────────────
 
    case NavEvent.ACTIVATE_EMERGENCY: {
      return {
        ...initialNavState,
        mode: NavMode.EMERGENCY_IDLE,
        emergencyMode: true,
        currentWaypointId: state.currentWaypointId,
        currentBuildingId: state.currentBuildingId,
        currentFloor: state.currentFloor,
        anchorPose: state.anchorPose,
      };
    }
 
    case NavEvent.DEACTIVATE_EMERGENCY: {
      return { ...initialNavState };
    }
 
    case NavEvent.FORCE_OUTDOOR: {
      return {
        ...state,
        mode: NavMode.OUTDOOR_ROUTE,
        currentWaypointId: null,
        currentBuildingId: null,
        currentFloor: null,
        anchorPose: null,
        expectedQrRole: null,
        nextRequiredAnchorId: null,
      };
    }
 
    default:
      return state;
  }
}
 
// ─── Helpers ────────────────────────────────────────────────────────────────
 
function buildAnchorPose(qr) {
  const x = qr.x != null ? Number(qr.x) : null;
  const y = qr.y != null ? Number(qr.y) : null;
  return {
    x,
    y,
    floor: qr.floor || null,
    building: qr.building || qr.buildingId || null,
    headingDeg: qr.bearing_hint_deg != null
      ? Number(qr.bearing_hint_deg)
      : null,
    source: "qr",
    accuracyM: 0.5,
    timestamp: Date.now(),
  };
}
 
/**
 * Selector helpers — use these in components instead of reading state directly.
 */
 
export function isIndoorMode(navState) {
  return (
    navState.mode === NavMode.INDOOR_ANCHORED ||
    navState.mode === NavMode.AWAIT_SCAN_ANCHOR ||
    navState.mode === NavMode.VERTICAL_TRANSFER
  );
}
 
export function isOutdoorMode(navState) {
  return (
    navState.mode === NavMode.OUTDOOR_ROUTE ||
    navState.mode === NavMode.AWAIT_ENTRY_QR
  );
}
 
export function shouldShowArrow(navState) {
  return (
    navState.mode === NavMode.INDOOR_ANCHORED &&
    navState.anchorPose?.x != null &&
    navState.anchorPose?.y != null
  );
}
 
export function shouldShowScanPrompt(navState) {
  return (
    navState.mode === NavMode.AWAIT_SCAN_ANCHOR ||
    navState.mode === NavMode.AWAIT_ENTRY_QR ||
    navState.mode === NavMode.VERTICAL_TRANSFER
  );
}
 
export function getScanPromptMessage(navState) {
  switch (navState.mode) {
    case NavMode.AWAIT_ENTRY_QR:
      return "📷 Scan the QR code at the entrance to begin indoor navigation.";
    case NavMode.AWAIT_SCAN_ANCHOR: {
      const type = navState.expectedQrRole || "";
      if (type === "stairs") return "🪜 You're at the staircase. Scan its QR code to continue.";
      if (type === "elevator") return "🛗 You're at the elevator. Scan its QR code to continue.";
      return "📷 Scan the QR code here to continue.";
    }
    case NavMode.VERTICAL_TRANSFER: {
      const target = navState.pendingFloorTarget;
      if (target) {
        return `🪜 Climb to floor ${target} — scan the QR code at each staircase landing on the way up.`;
      }
      return `🪜 Climb the stairs and scan the QR code at each landing to continue.`;
    }
    default:
      return null;
  }
}

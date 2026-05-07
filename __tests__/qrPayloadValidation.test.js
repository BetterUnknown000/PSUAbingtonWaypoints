/**
 * qrPayloadValidation.test.js
 *
 * Tests for QR anchor validation — ensures zero x/y, stale graph revisions,
 * and missing fields are correctly rejected before corrupting indoor pose.
 */

// Mock the qrPayload module so we don't need campusData.json in tests
jest.mock("../src/utils/qrPayload", () => ({
  GRAPH_REV: "2026-04-27",
}));

const {
  validateQrAnchor,
  getValidationMessage,
} = require("../src/utils/qrPayloadValidation");

const ACTIVE_REV = "2026-04-27";

describe("validateQrAnchor", () => {
  // ── Empty / null ──────────────────────────────────────────────────────────

  test("rejects null payload", () => {
    expect(validateQrAnchor(null, ACTIVE_REV)).toEqual({
      ok: false,
      reason: "empty_qr",
    });
  });

  test("rejects undefined payload", () => {
    expect(validateQrAnchor(undefined, ACTIVE_REV)).toEqual({
      ok: false,
      reason: "empty_qr",
    });
  });

  // ── Stale graph revision ──────────────────────────────────────────────────

  test("rejects stale graph_rev", () => {
    const result = validateQrAnchor(
      {
        role: "stairs",
        building: "woodland",
        floor: "2",
        x: 100,
        y: 200,
        graph_rev: "2026-03-01",
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("stale_qr");
  });

  test("accepts matching graph_rev", () => {
    const result = validateQrAnchor(
      {
        role: "stairs",
        building: "woodland",
        floor: "2",
        x: 100,
        y: 200,
        graph_rev: ACTIVE_REV,
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(true);
  });

  test("accepts payload with no graph_rev (v2 backward compat)", () => {
    const result = validateQrAnchor(
      {
        role: "stairs",
        building: "woodland",
        floor: "2",
        x: 100,
        y: 200,
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(true);
  });

  // ── Entrance QRs ──────────────────────────────────────────────────────────

  test("accepts entrance QR with no x/y — only needs building", () => {
    const result = validateQrAnchor(
      {
        role: "entrance",
        building: "woodland",
        floor: "1",
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(true);
  });

  test("rejects entrance QR with no building", () => {
    const result = validateQrAnchor(
      { role: "entrance", floor: "1" },
      ACTIVE_REV
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_building");
  });

  // ── Indoor anchor roles ───────────────────────────────────────────────────

  test("accepts valid hallway anchor with non-zero x/y", () => {
    const result = validateQrAnchor(
      {
        role: "hallway",
        building: "woodland",
        floor: "2",
        x: 124,
        y: 318,
        graph_rev: ACTIVE_REV,
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(true);
  });

  test("rejects hallway anchor with zero x/y", () => {
    const result = validateQrAnchor(
      {
        role: "hallway",
        building: "sutherland",
        floor: "1",
        x: 0,
        y: 0,
        graph_rev: ACTIVE_REV,
      },
      ACTIVE_REV
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("invalid_indoor_anchor");
  });

  test("rejects stairs anchor with missing building", () => {
    const result = validateQrAnchor(
      { role: "stairs", floor: "2", x: 100, y: 200 },
      ACTIVE_REV
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_building");
  });

  test("rejects elevator anchor with missing floor", () => {
    const result = validateQrAnchor(
      { role: "elevator", building: "woodland", x: 100, y: 200 },
      ACTIVE_REV
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_floor");
  });

  test("accepts payload with unknown role (treated as passthrough)", () => {
    const result = validateQrAnchor(
      { role: "office", building: "woodland", floor: "1" },
      ACTIVE_REV
    );
    expect(result.ok).toBe(true);
  });
});

describe("getValidationMessage", () => {
  test("returns message for empty_qr", () => {
    expect(getValidationMessage("empty_qr")).toMatch(/could not be read/i);
  });

  test("returns message for stale_qr", () => {
    expect(getValidationMessage("stale_qr")).toMatch(/outdated/i);
  });

  test("returns message for invalid_indoor_anchor", () => {
    expect(getValidationMessage("invalid_indoor_anchor")).toMatch(/not yet mapped/i);
  });

  test("returns fallback for unknown reason", () => {
    expect(getValidationMessage("unknown_thing")).toBeTruthy();
  });
});

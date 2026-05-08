const {
  buildPayload,
  getQrFilename,
  getQrTargets,
} = require("../scripts/qrCodeTargets");

const ALLOWED_TYPES = new Set(["entrance", "stairs", "hallway", "hall"]);
const ALLOWED_CATEGORIES = new Set(["entrance", "stairs", "hall"]);

describe("QR code targets", () => {
  test("only includes current entrance, stair, and hall waypoints", () => {
    const targets = getQrTargets();

    expect(targets.length).toBeGreaterThan(0);
    for (const { waypoint, category } of targets) {
      expect(ALLOWED_TYPES.has(String(waypoint.type).toLowerCase())).toBe(true);
      expect(ALLOWED_CATEGORIES.has(category)).toBe(true);
      expect(waypoint.qr_deployed).not.toBe(false);
    }
  });

  test("uses waypoint IDs for QR filenames and payload identifiers", () => {
    const targets = getQrTargets();
    const seen = new Set();

    for (const { waypoint } of targets) {
      const payload = buildPayload(waypoint);

      expect(seen.has(waypoint.id)).toBe(false);
      seen.add(waypoint.id);
      expect(getQrFilename(waypoint)).toBe(`${waypoint.id}.png`);
      expect(payload.qr_id).toBe(waypoint.id);
      expect(payload.waypoint_id).toBe(waypoint.id);
      expect(payload.app_url).toContain(`waypoint_id=${encodeURIComponent(waypoint.id)}`);
    }
  });
});

import campusData from "../data/campusData.json";
import { findWaypointFromQrPayload, parseQrPayload } from "./qrPayload";

export function findWaypointByQrData(qrData) {
  const payload = parseQrPayload(qrData);
  const payloadMatch = findWaypointFromQrPayload(payload);
  if (payloadMatch) return payloadMatch;

  const normalized = String(qrData || "").trim().toLowerCase();

  return (
    (campusData.waypoints || []).find((w) => {
      const idMatch = String(w.id || "").trim().toLowerCase() === normalized;
      const qrMatch =
        String(w.qr_code || "").trim().toLowerCase() === normalized;
      return idMatch || qrMatch;
    }) || null
  );
}

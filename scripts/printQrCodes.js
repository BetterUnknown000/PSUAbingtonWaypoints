const QRCode = require("qrcode");
const campusData = require("../src/data/campusData.json");

const APP_SCHEME = "psuabingtonwaypoints";
const QR_NAVIGATION_ROUTE = "navigation";

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function getMainEntranceWaypoints() {
  return (campusData.waypoints || []).filter((waypoint) => {
    if (waypoint.type !== "entrance") return false;

    const label = normalizeLabel(waypoint.label);
    if (label.startsWith("room ")) return false;

    return (
      label.includes("main entrance") ||
      label === "springhouse main entrance" ||
      label === "athletic building main entrance"
    );
  });
}

function getElevatorWaypoints() {
  return (campusData.waypoints || []).filter((waypoint) => waypoint.type === "elevator");
}

function getStairWaypoints() {
  return (campusData.waypoints || [])
    .filter((waypoint) => waypoint.type === "stairs")
    .filter((waypoint) => {
      const label = normalizeLabel(waypoint.label);
      return label.includes("main") || waypoint.building === "lares";
    });
}

function buildPayload(waypoint) {
  return {
    version: 2,
    qr_id: waypoint.qr_code,
    waypoint_id: waypoint.id,
    building: waypoint.building,
    floor: waypoint.floor,
    latitude: waypoint.latitude,
    longitude: waypoint.longitude,
    label: waypoint.label,
    type: waypoint.type,
    app_url: buildAppUrl(waypoint),
  };
}

function buildAppUrl(waypoint) {
  const params = [
    ["startWaypointId", waypoint.id],
    ["startQrId", waypoint.qr_code],
    ["building", waypoint.building],
    ["floor", waypoint.floor],
    ["latitude", waypoint.latitude],
    ["longitude", waypoint.longitude],
    ["label", waypoint.label],
    ["type", waypoint.type],
  ]
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return `${APP_SCHEME}://${QR_NAVIGATION_ROUTE}?${params}`;
}

function getTargets() {
  const targets = [
    ...getMainEntranceWaypoints().map((waypoint) => ({ waypoint, category: "Entrance" })),
    ...getElevatorWaypoints().map((waypoint) => ({ waypoint, category: "Elevator" })),
    ...getStairWaypoints().map((waypoint) => ({ waypoint, category: "Stairs" })),
  ];

  return Array.from(new Map(targets.map((item) => [item.waypoint.id, item])).values());
}

async function main() {
  const targets = getTargets();

  for (let index = 0; index < targets.length; index += 1) {
    const { waypoint, category } = targets[index];
    const payload = buildPayload(waypoint);
    const qr = await QRCode.toString(payload.app_url, {
      type: "terminal",
      small: true,
    });

    process.stdout.write("\n");
    process.stdout.write("=".repeat(72) + "\n");
    process.stdout.write(`${category}: ${waypoint.label}\n`);
    process.stdout.write(
      `Building: ${waypoint.building} | Floor: ${waypoint.floor} | QR ID: ${waypoint.qr_code}\n`
    );
    process.stdout.write(
      `Coordinates: ${waypoint.latitude}, ${waypoint.longitude}\n`
    );
    process.stdout.write("-".repeat(72) + "\n");
    process.stdout.write(qr);
    process.stdout.write("-".repeat(72) + "\n");
    process.stdout.write(`App Link: ${payload.app_url}\n`);
    process.stdout.write(`Payload: ${JSON.stringify(payload)}\n`);

    if (index < targets.length - 1) {
      process.stdout.write("\f\n");
    }
  }

  process.stdout.write("\n" + "=".repeat(72) + "\n");
  process.stdout.write(`Printed ${targets.length} QR codes.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

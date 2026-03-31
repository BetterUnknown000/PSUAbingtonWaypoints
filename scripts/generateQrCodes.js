const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const campusData = require("../src/data/campusData.json");

const outputDir = path.join(__dirname, "..", "src", "assets", "qrcodes");
const APP_SCHEME = "psuabingtonwaypoints";
const QR_NAVIGATION_ROUTE = "navigation";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getMainEntranceWaypoints() {
  return (campusData.waypoints || []).filter((waypoint) => {
    if (waypoint.type !== "entrance") return false;

    const label = String(waypoint.label || "").toLowerCase();
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
  const stairs = (campusData.waypoints || []).filter((waypoint) => waypoint.type === "stairs");

  return stairs.filter((waypoint) => {
    const label = String(waypoint.label || "").toLowerCase();
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

async function writeQrFile(waypoint, category) {
  const buildingDir = path.join(outputDir, waypoint.building);
  ensureDir(buildingDir);

  const filename = `${category}-${slugify(waypoint.label)}.png`;
  const filePath = path.join(buildingDir, filename);
  const payload = buildPayload(waypoint);

  await QRCode.toFile(filePath, payload.app_url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 480,
    color: {
      dark: "#0b1f33",
      light: "#ffffff",
    },
  });

  return {
    ...payload,
    category,
    encoded_value: payload.app_url,
    file: path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/"),
  };
}

async function main() {
  ensureDir(outputDir);

  const targets = [
    ...getMainEntranceWaypoints().map((waypoint) => ({ waypoint, category: "entrance" })),
    ...getElevatorWaypoints().map((waypoint) => ({ waypoint, category: "elevator" })),
    ...getStairWaypoints().map((waypoint) => ({ waypoint, category: "stairs" })),
  ];

  const uniqueTargets = Array.from(
    new Map(targets.map((item) => [item.waypoint.id, item])).values()
  );

  const manifest = [];

  for (const { waypoint, category } of uniqueTargets) {
    const entry = await writeQrFile(waypoint, category);
    manifest.push(entry);
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(
    JSON.stringify(
      {
        generated: manifest.length,
        manifest: path.relative(path.join(__dirname, ".."), manifestPath).replace(/\\/g, "/"),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * validateCampusData.js
 *
 * Validates campusData.json for common issues that cause silent navigation failures.
 * Run with: node scripts/validateCampusData.js
 *
 * Checks:
 * 1. Every waypoint referenced in edges exists
 * 2. Every building entrance waypoint has GPS coordinates
 * 3. Every stairs/elevator waypoint has a qr_code field
 * 4. Every qrAnchor references a valid waypoint
 * 5. Every room has a valid waypoint_id
 * 6. Woodland waypoints used for indoor nav have non-zero x/y
 * 7. Isolated waypoints (no edges) are reported
 */
 
const fs = require("fs");
const path = require("path");
 
const dataPath = path.join(__dirname, "../src/data/campusData.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
 
const { waypoints, edges, rooms, qrAnchors, buildings } = data;
 
let errors = 0;
let warnings = 0;
 
function error(msg) {
  console.error(`❌ ERROR: ${msg}`);
  errors++;
}
 
function warn(msg) {
  console.warn(`⚠️  WARN:  ${msg}`);
  warnings++;
}
 
function info(msg) {
  console.log(`✅ OK:    ${msg}`);
}
 
// Build lookup maps
const waypointMap = new Map(waypoints.map((w) => [w.id, w]));
const qrIdMap = new Map((qrAnchors || []).map((q) => [q.qr_id, q]));
 
console.log("\n=== PSU Abington Campus Data Validation ===\n");
 
// ─── 1. Edge references ───────────────────────────────────────────────────────
console.log("--- Checking edge references ---");
let badEdges = 0;
for (const edge of edges || []) {
  if (!waypointMap.has(edge.from)) {
    error(`Edge references missing waypoint: ${edge.from}`);
    badEdges++;
  }
  if (!waypointMap.has(edge.to)) {
    error(`Edge references missing waypoint: ${edge.to}`);
    badEdges++;
  }
}
if (badEdges === 0) info("All edge waypoint references are valid");
 
// ─── 2. Building entrance GPS ─────────────────────────────────────────────────
console.log("\n--- Checking building entrance GPS coordinates ---");
let missingGps = 0;
for (const building of buildings || []) {
  for (const entranceId of building.entrances || []) {
    const wp = waypointMap.get(entranceId);
    if (!wp) {
      error(`Building ${building.id} entrance ${entranceId} not found in waypoints`);
      missingGps++;
      continue;
    }
    if (wp.latitude == null || wp.longitude == null) {
      error(`Entrance ${entranceId} (${building.id}) missing GPS coordinates`);
      missingGps++;
    }
  }
}
if (missingGps === 0) info("All building entrances have GPS coordinates");
 
// ─── 3. Stairs/elevator QR codes ─────────────────────────────────────────────
console.log("\n--- Checking stairs/elevator QR codes ---");
let missingQr = 0;
for (const wp of waypoints) {
  if (wp.type === "stairs" || wp.type === "elevator") {
    if (!wp.qr_code) {
      error(`${wp.type} waypoint ${wp.id} has no qr_code field`);
      missingQr++;
    } else if (!qrIdMap.has(wp.qr_code)) {
      warn(`${wp.type} waypoint ${wp.id} has qr_code ${wp.qr_code} but no matching qrAnchor entry`);
      missingQr++;
    }
  }
}
if (missingQr === 0) info("All stairs/elevator waypoints have QR codes");
 
// ─── 4. qrAnchor references ───────────────────────────────────────────────────
console.log("\n--- Checking qrAnchor waypoint references ---");
let badAnchors = 0;
for (const anchor of qrAnchors || []) {
  if (!waypointMap.has(anchor.waypoint_id)) {
    error(`qrAnchor ${anchor.qr_id} references missing waypoint: ${anchor.waypoint_id}`);
    badAnchors++;
  }
}
if (badAnchors === 0) info("All qrAnchors reference valid waypoints");
 
// ─── 5. Room waypoint references ─────────────────────────────────────────────
console.log("\n--- Checking room waypoint references ---");
let badRooms = 0;
for (const room of rooms || []) {
  if (!waypointMap.has(room.waypoint_id)) {
    error(`Room ${room.room_number} (${room.building}) references missing waypoint: ${room.waypoint_id}`);
    badRooms++;
  }
}
if (badRooms === 0) info("All rooms reference valid waypoints");
 
// ─── 6. Woodland indoor x/y coordinates ──────────────────────────────────────
console.log("\n--- Checking Woodland indoor x/y coordinates ---");
const woodlandIndoor = waypoints.filter(
  (w) =>
    w.building === "woodland" &&
    w.type !== "entrance" &&
    w.type !== "outdoor" &&
    w.type !== "external"
);
const zeroXY = woodlandIndoor.filter(
  (w) => !w.x || !w.y || Number(w.x) === 0 || Number(w.y) === 0
);
if (zeroXY.length > 0) {
  for (const wp of zeroXY) {
    warn(`Woodland waypoint ${wp.id} (${wp.type}) has zero x/y coordinates — arrow will not work`);
  }
} else {
  info("All Woodland indoor waypoints have non-zero x/y coordinates");
}
 
// ─── 7. Isolated waypoints ────────────────────────────────────────────────────
console.log("\n--- Checking for isolated waypoints (no edges) ---");
const connectedIds = new Set();
for (const edge of edges || []) {
  connectedIds.add(edge.from);
  connectedIds.add(edge.to);
}
const isolated = waypoints.filter(
  (w) =>
    !connectedIds.has(w.id) &&
    w.type !== "outdoor" &&
    w.type !== "external"
);
if (isolated.length > 0) {
  for (const wp of isolated) {
    warn(`Isolated waypoint (no edges): ${wp.id} (${wp.building}, ${wp.type})`);
  }
} else {
  info("No isolated waypoints found");
}
 
// ─── 8. Entrance waypoints in buildings array ─────────────────────────────────
console.log("\n--- Checking entrance waypoint types ---");
let wrongType = 0;
for (const building of buildings || []) {
  for (const entranceId of building.entrances || []) {
    const wp = waypointMap.get(entranceId);
    if (wp && wp.type !== "entrance") {
      warn(`Building ${building.id} lists ${entranceId} as entrance but its type is "${wp.type}"`);
      wrongType++;
    }
  }
}
if (wrongType === 0) info("All building entrance waypoints have type 'entrance'");
 
// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n=== Summary ===");
console.log(`Total waypoints:  ${waypoints.length}`);
console.log(`Total edges:      ${(edges || []).length}`);
console.log(`Total rooms:      ${(rooms || []).length}`);
console.log(`Total qrAnchors:  ${(qrAnchors || []).length}`);
console.log(`Isolated nodes:   ${isolated.length}`);
console.log(`Zero x/y (Woodland): ${zeroXY.length}`);
console.log(`\n❌ Errors:   ${errors}`);
console.log(`⚠️  Warnings: ${warnings}`);
 
if (errors > 0) {
  console.log("\n❌ Validation FAILED — fix errors before deploying\n");
  process.exit(1);
} else if (warnings > 0) {
  console.log("\n⚠️  Validation passed with warnings\n");
  process.exit(0);
} else {
  console.log("\n✅ Validation PASSED\n");
  process.exit(0);
}
 

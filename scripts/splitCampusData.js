/**
 * scripts/splitCampusData.js
 * Run from project root: node scripts/splitCampusData.js
 * Splits src/data/campusData.json into per-building files and a shared index.
 */

const fs   = require('fs');
const path = require('path');

const DATA_PATH    = path.join(__dirname, '..', 'src', 'data', 'campusData.json');
const OUT_DIR      = path.join(__dirname, '..', 'src', 'data', 'buildings');
const SHARED_PATH  = path.join(__dirname, '..', 'src', 'data', 'campusShared.json');

const campus = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const wps     = campus.waypoints || [];
const edges   = campus.edges     || [];
const rooms   = campus.rooms     || [];
const qrs     = campus.qrAnchors || [];
const buildings = campus.buildings || [];

// Index waypoints by id
const wpById = {};
for (const w of wps) wpById[w.id] = w;

// Group by building
const wpsByBuilding    = {};
const edgesByBuilding  = {};
const roomsByBuilding  = {};
const qrsByBuilding    = {};

for (const w of wps) {
  const b = w.building;
  if (!wpsByBuilding[b]) wpsByBuilding[b] = [];
  wpsByBuilding[b].push(w);
}

for (const e of edges) {
  const aB = wpById[e.from]?.building;
  const bB = wpById[e.to]?.building;
  const addTo = (b) => {
    if (!b) return;
    if (!edgesByBuilding[b]) edgesByBuilding[b] = [];
    // Avoid exact duplicates
    if (!edgesByBuilding[b].some(x => x.from === e.from && x.to === e.to)) {
      edgesByBuilding[b].push(e);
    }
  };
  if (aB === bB) { addTo(aB); }
  else { addTo(aB); addTo(bB); } // cross-building (vertical connections)
}

for (const r of rooms) {
  const b = r.building;
  if (!roomsByBuilding[b]) roomsByBuilding[b] = [];
  roomsByBuilding[b].push(r);
}

for (const q of qrs) {
  const b = wpById[q.waypoint_id]?.building || q.building;
  if (!b) continue;
  if (!qrsByBuilding[b]) qrsByBuilding[b] = [];
  qrsByBuilding[b].push(q);
}

const buildingsById = {};
for (const b of buildings) buildingsById[b.id] = b;

// Write per-building files
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

for (const bld of Object.keys(wpsByBuilding).sort()) {
  const out = {
    building:  buildingsById[bld] || { id: bld },
    waypoints: wpsByBuilding[bld]    || [],
    edges:     edgesByBuilding[bld]  || [],
    rooms:     roomsByBuilding[bld]  || [],
    qrAnchors: qrsByBuilding[bld]   || [],
  };
  const outPath = path.join(OUT_DIR, `${bld}.json`);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`  ${bld}.json — ${out.waypoints.length} waypoints, ${out.edges.length} edges, ${kb}KB`);
}

// Write shared index (buildings list + entrances + rooms for search)
const entrances = wps.filter(w => w.type === 'entrance');
const shared = {
  buildings,
  entrances,
  rooms,
};
fs.writeFileSync(SHARED_PATH, JSON.stringify(shared, null, 2) + '\n');
const sharedKb = Math.round(fs.statSync(SHARED_PATH).size / 1024);
console.log(`\ncampusShared.json — ${buildings.length} buildings, ${entrances.length} entrances, ${rooms.length} rooms, ${sharedKb}KB`);
console.log('\nDone. Files written to src/data/buildings/ and src/data/campusShared.json');

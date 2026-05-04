/**
 * scripts/buildConnectivityDiagrams.js
 * Usage: node scripts/buildConnectivityDiagrams.js
 * Opens: diagrams/index.html  (no server needed)
 *
 * Modes: View | Move nodes | Edit edges | Add waypoint
 * Save downloads updated campusData.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_PATH     = path.join(__dirname, '..', 'src', 'data', 'campusData.json');
const FLOORPLAN_DIR = path.join(__dirname, '..', 'src', 'assets', 'floorplans');
const OUTPUT_DIR    = path.join(__dirname, '..', 'diagrams');
const OUTPUT_FILE   = path.join(OUTPUT_DIR, 'index.html');

// ── Load data ─────────────────────────────────────────────────────────────────
const campus   = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const allWps   = campus.waypoints || [];
const allEdges = campus.edges     || [];
const wpById   = {};
for (const w of allWps) wpById[w.id] = w;

// ── Safe JSON embed — escapes < so </script> can never appear ─────────────────
function safeJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// ── Floorplan loader ──────────────────────────────────────────────────────────
// Filename aliases: some buildings use non-standard names for certain floors.
const FLOOR_ALIASES = {
  'rydal__ground':      'rydal_basement_with_outline.svg',
  'sutherland__ground': 'sutherland_floor1_with_outline.svg', // no ground SVG — use floor1 as proxy
  'athletic__ground':   'athletic_ground_with_outline.svg',
  'athletic__mezzanine':'athletic_mezzanine_with_outline.svg',
};

function getFloorplanInner(building, floor) {
  const aliasKey = building + '__' + floor;
  const aliased  = FLOOR_ALIASES[aliasKey];
  const key      = floor === 'ground' ? 'ground' : ('floor' + floor);
  const names    = aliased
    ? [aliased, building + '_' + key + '_with_outline.svg', building + '_' + key + '.svg']
    : [building + '_' + key + '_with_outline.svg', building + '_' + key + '.svg'];
  for (const name of names) {
    const p = path.join(FLOORPLAN_DIR, name);
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8')
        .replace(/<\?xml[^>]*\?>/gi, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<svg[^>]*>/i, '')
        .replace(/<\/svg>\s*$/i, '')
        .trim();
    }
  }
  return null;
}

function hasFloorplan(building, floor) {
  const aliasKey = building + '__' + floor;
  const aliased  = FLOOR_ALIASES[aliasKey];
  const key      = floor === 'ground' ? 'ground' : ('floor' + floor);
  const names    = aliased
    ? [aliased, building + '_' + key + '_with_outline.svg', building + '_' + key + '.svg']
    : [building + '_' + key + '_with_outline.svg', building + '_' + key + '.svg'];
  return names.some(function(n) { return fs.existsSync(path.join(FLOORPLAN_DIR, n)); });
}

// ── Force layout ──────────────────────────────────────────────────────────────
function forceLayout(nodes, edgePairs, W, H, iters) {
  iters = iters || 600;
  const k = Math.sqrt((W * H) / Math.max(nodes.length, 1)) * 1.8;
  const pos = {};
  nodes.forEach(function(n, i) {
    const a = (2 * Math.PI * i) / nodes.length;
    pos[n.id] = { x: W/2 + W*0.38*Math.cos(a), y: H/2 + H*0.38*Math.sin(a), vx: 0, vy: 0 };
  });
  for (let it = 0; it < iters; it++) {
    const cool = 1 - it / iters;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i+1; j < nodes.length; j++) {
        const a = pos[nodes[i].id], b = pos[nodes[j].id];
        const dx = b.x-a.x||0.01, dy = b.y-a.y||0.01;
        const d = Math.sqrt(dx*dx+dy*dy)||0.01, f = (k*k)/d;
        a.vx -= (dx/d)*f; a.vy -= (dy/d)*f;
        b.vx += (dx/d)*f; b.vy += (dy/d)*f;
      }
    }
    for (let i = 0; i < edgePairs.length; i++) {
      const aid = edgePairs[i][0], bid = edgePairs[i][1];
      if (!pos[aid] || !pos[bid]) continue;
      const a = pos[aid], b = pos[bid];
      const dx = b.x-a.x, dy = b.y-a.y;
      const d = Math.sqrt(dx*dx+dy*dy)||0.01, f = (d*d)/(k*2.2);
      a.vx += (dx/d)*f; a.vy += (dy/d)*f;
      b.vx -= (dx/d)*f; b.vy -= (dy/d)*f;
    }
    for (let i = 0; i < nodes.length; i++) {
      const p = pos[nodes[i].id];
      p.x = Math.max(50, Math.min(W-50, p.x + p.vx*cool));
      p.y = Math.max(50, Math.min(H-50, p.y + p.vy*cool));
      p.vx *= 0.82; p.vy *= 0.82;
    }
  }
  return pos;
}

// ── Type colours ──────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  entrance: '#185FA5', stairs: '#854F0B', elevator: '#3B6D11',
  hallway:  '#5f5e5a', classroom: '#533AB7', office: '#2c2c2a',
  lab:      '#0F6E56', dining: '#993C1D',  lounge: '#993556',
  recreation: '#185FA5', hall: '#5f5e5a'
};
const W = 1000, H = 1000;

// ── Build per-floor positions ─────────────────────────────────────────────────
const floorGroups = {};
for (const w of allWps) {
  const key = w.building + '__' + w.floor;
  if (!floorGroups[key]) floorGroups[key] = [];
  floorGroups[key].push(w);
}

const floorData = {};
for (const key of Object.keys(floorGroups)) {
  const nodes    = floorGroups[key];
  const parts    = key.split('__');
  const building = parts[0], floor = parts[1];
  const hasXY    = nodes.some(function(n) { return n.x && Number(n.x) !== 0; });
  const fEdges   = allEdges.filter(function(e) {
    const ids = new Set(nodes.map(function(n) { return n.id; }));
    return ids.has(e.from) && ids.has(e.to);
  });
  const pairs = fEdges.map(function(e) { return [e.from, e.to]; });

  let positions = {};
  if (hasXY) {
    nodes.forEach(function(n) {
      positions[n.id] = { x: Number(n.x) || 500, y: Number(n.y) || 500 };
    });
  } else {
    const raw = forceLayout(nodes, pairs, W, H);
    for (const id of Object.keys(raw)) {
      positions[id] = {
        x: Math.round(raw[id].x * 10) / 10,
        y: Math.round(raw[id].y * 10) / 10
      };
    }
  }
  floorData[key] = { building: building, floor: floor, hasRealXY: hasXY,
                     nodeIds: nodes.map(function(n) { return n.id; }),
                     positions: positions };
}

const sortedKeys = Object.keys(floorData).sort(function(a, b) {
  const ap = a.split('__'), bp = b.split('__');
  return ap[0].localeCompare(bp[0]) || String(ap[1]).localeCompare(String(bp[1]));
});

// ── Build output ──────────────────────────────────────────────────────────────
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const out = fs.openSync(OUTPUT_FILE, 'w');

function w(s) { fs.writeSync(out, s); }

// ── Write HTML head ───────────────────────────────────────────────────────────
w('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n');
w('<title>PSU Abington - Campus Editor</title>\n');
w('<style>\n');
w('*{box-sizing:border-box;margin:0;padding:0}\n');
w('body{font-family:system-ui,sans-serif;background:#f1efe8;color:#2c2c2a;display:flex;flex-direction:column;height:100vh;overflow:hidden}\n');
w('#header{padding:8px 14px;background:#fff;border-bottom:.5px solid #d3d1c7;display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap}\n');
w('#header h1{font-size:14px;font-weight:500}\n');
w('.stat{font-size:11px;color:#5f5e5a;padding:2px 7px;background:#f1efe8;border-radius:4px}\n');
w('.stat b{color:#2c2c2a}\n');
w('#save-btn{margin-left:auto;padding:5px 14px;background:#185FA5;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500;white-space:nowrap}\n');
w('#save-btn:hover{background:#0d4a8a}\n');
w('#save-btn.dirty{background:#854F0B}\n');
w('#changes-lbl{font-size:11px;color:#854F0B;display:none}\n');
w('#floor-bar{padding:5px 14px;background:#fafaf8;border-bottom:.5px solid #d3d1c7;display:flex;gap:3px;flex-wrap:wrap;flex-shrink:0}\n');
w('.floor-btn{font-size:11px;padding:3px 8px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer;white-space:nowrap}\n');
w('.floor-btn.active{background:#185FA5;color:#fff;border-color:#185FA5;font-weight:500}\n');
w('#mode-bar{padding:5px 14px;background:#fff;border-bottom:.5px solid #d3d1c7;display:flex;gap:5px;align-items:center;flex-shrink:0;flex-wrap:wrap}\n');
w('.mode-btn{font-size:11px;padding:3px 11px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer}\n');
w('.mode-btn.active{background:#2c2c2a;color:#fff;border-color:#2c2c2a}\n');
w('#mode-hint{font-size:11px;color:#888780;margin-left:6px;flex:1}\n');
w('#zoom-lbl{font-size:11px;color:#888780}\n');
w('#reset-btn{font-size:11px;padding:3px 8px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer}\n');
w('#main{display:flex;flex:1;overflow:hidden;min-height:0}\n');
w('#canvas-wrap{flex:1;overflow:hidden;cursor:grab;position:relative;background:#e8e6e0;min-width:0}\n');
w('#canvas-wrap.grabbing{cursor:grabbing}\n');
w('#zoom-root{transform-origin:0 0;will-change:transform;position:absolute;top:0;left:0}\n');
w('#side{width:230px;flex-shrink:0;background:#fff;border-left:.5px solid #d3d1c7;overflow-y:auto}\n');
w('#side-inner{padding:12px}\n');
w('#side h3{font-size:11px;font-weight:500;margin-bottom:8px;color:#888780;text-transform:uppercase;letter-spacing:.04em}\n');
w('.lbl{font-size:10px;color:#888780;margin-bottom:1px;margin-top:6px}\n');
w('.val{font-size:12px;margin-bottom:4px;word-break:break-all}\n');
w('.badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;margin:1px}\n');
w('.bg{background:#EAF3DE;color:#27500A}.br{background:#FCEBEB;color:#791F1F}.bb{background:#f1efe8;color:#2c2c2a}\n');
w('.conn-row{padding:3px 0;border-bottom:.5px solid #f4f4f2;display:flex;justify-content:space-between;align-items:center;font-size:11px;gap:4px}\n');
w('.conn-row:last-child{border-bottom:none}\n');
w('.xb{font-size:10px;padding:1px 5px;border:.5px solid #F7C1C1;border-radius:3px;background:#FCEBEB;color:#791F1F;cursor:pointer;flex-shrink:0}\n');
w('.xb:hover{background:#f5c6c6}\n');
w('#pending-box{padding:7px;background:#FFF8E6;border:.5px solid #F5D78E;border-radius:5px;font-size:11px;color:#633806;margin-top:8px;display:none}\n');
w('#modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:100;align-items:center;justify-content:center}\n');
w('#modal-overlay.open{display:flex}\n');
w('#modal{background:#fff;border-radius:10px;padding:20px;width:340px;box-shadow:0 8px 32px rgba(0,0,0,0.18)}\n');
w('#modal h2{font-size:14px;font-weight:500;margin-bottom:14px}\n');
w('.field{margin-bottom:10px}\n');
w('.field label{display:block;font-size:11px;color:#5f5e5a;margin-bottom:3px}\n');
w('.field input,.field select{width:100%;padding:5px 8px;border:.5px solid #d3d1c7;border-radius:5px;font-size:12px;font-family:inherit}\n');
w('.field input:focus,.field select:focus{outline:none;border-color:#185FA5}\n');
w('.modal-btns{display:flex;gap:8px;margin-top:14px}\n');
w('.modal-btns button{flex:1;padding:7px;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:500}\n');
w('#mc{background:#185FA5;color:#fff} #mc:hover{background:#0d4a8a}\n');
w('#mx{background:#f1efe8;color:#2c2c2a} #mx:hover{background:#e3e1da}\n');
w('#modal-coords{font-size:10px;color:#888780;margin-top:4px}\n');
w('.leg-row{display:flex;align-items:center;gap:5px;font-size:11px;padding:2px 0}\n');
w('.leg-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}\n');
w('</style>\n</head>\n<body>\n');

// ── Floorplan divs (hidden, read by JS at runtime) ────────────────────────────
w('<!-- floorplan backgrounds -->\n');
for (const key of sortedKeys) {
  const d = floorData[key];
  const inner = getFloorplanInner(d.building, d.floor);
  if (inner) {
    w('<div id="fp-' + key + '" style="display:none">');
    w('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">');
    w(inner);
    w('</svg></div>\n');
  }
}

// ── Static HTML structure ─────────────────────────────────────────────────────
w('<div id="header">');
w('<h1>PSU Abington \u2014 Campus Editor</h1>');
w('<div class="stat">Waypoints: <b id="s-wps">' + allWps.length + '</b></div>');
w('<div class="stat">Edges: <b id="s-edges">' + allEdges.length + '</b></div>');
w('<div class="stat">Disconnected: <b id="s-dc">\u2014</b></div>');
w('<span id="changes-lbl">\u25cf unsaved changes</span>');
w('<button id="save-btn" onclick="saveData()">Download campusData.json</button>');
w('</div>\n');

w('<div id="floor-bar">\n');
for (const key of sortedKeys) {
  const d = floorData[key];
  const icon = hasFloorplan(d.building, d.floor) ? (d.hasRealXY ? ' \uD83D\uDDFA' : ' \uD83D\uDDFA~') : '';
  w('<button class="floor-btn" onclick="showFloor(\'' + key + '\')" id="btn-' + key + '" data-key="' + key + '">');
  w(d.building + ' F' + d.floor + icon);
  w('</button>\n');
}
w('</div>\n');

w('<div id="mode-bar">');
w('<button class="mode-btn active" onclick="setMode(\'view\')"   id="btn-mode-view">\uD83D\uDC41 View</button>');
w('<button class="mode-btn"        onclick="setMode(\'move\')"   id="btn-mode-move">\u2735 Move</button>');
w('<button class="mode-btn"        onclick="setMode(\'edge\')"   id="btn-mode-edge">\u27F7 Edges</button>');
w('<button class="mode-btn"        onclick="setMode(\'add\')"    id="btn-mode-add">\uFF0B Add waypoint</button>');
w('<span id="mode-hint">Hover nodes to inspect</span>');
w('<span id="zoom-lbl">100%</span>');
w('<button id="reset-btn" onclick="resetZoom()">Reset view</button>');
w('</div>\n');

w('<div id="main">');
w('<div id="canvas-wrap"><div id="zoom-root"></div></div>');
w('<div id="side"><div id="side-inner">');
w('<div id="node-info"><h3>Node info</h3><div style="color:#888780;font-size:11px;margin-top:4px">Select a floor to begin</div></div>');
w('<div id="pending-box">Click a second node to connect \u2014 or same node to cancel.</div>');
w('<div style="margin-top:14px"><h3>Legend</h3><div id="legend"></div></div>');
w('</div></div>');
w('</div>\n');

w('<div id="modal-overlay">');
w('<div id="modal"><h2>Add waypoint</h2>');
w('<div class="field"><label>ID (unique, no spaces)</label><input id="m-id" placeholder="wp_suth_f1_room_205"/></div>');
w('<div class="field"><label>Label</label><input id="m-label" placeholder="Room 205"/></div>');
w('<div class="field"><label>Type</label><select id="m-type">');
for (const t of Object.keys(TYPE_COLOR)) {
  w('<option value="' + t + '">' + t + '</option>');
}
w('</select></div>');
w('<div class="field"><label>Building</label><input id="m-building" readonly/></div>');
w('<div class="field"><label>Floor</label><input id="m-floor" readonly/></div>');
w('<div id="modal-coords">Click on the map to set position</div>');
w('<div class="modal-btns"><button id="mx" onclick="closeModal()">Cancel</button><button id="mc" onclick="confirmAdd()">Add waypoint</button></div>');
w('</div></div>\n');

// ── Embedded data ─────────────────────────────────────────────────────────────
w('<script>\n');
w('var FLOOR_DATA = '  + safeJson(floorData)   + ';\n');
w('var TYPE_COLOR = '  + safeJson(TYPE_COLOR)  + ';\n');
w('var FULL_CAMPUS = ' + safeJson(campus)       + ';\n');

// ── Browser-side JavaScript ───────────────────────────────────────────────────
w(fs.readFileSync(path.join(__dirname, 'editorRuntime.js'), 'utf8'));
w('\n</script>\n</body>\n</html>\n');

fs.closeSync(out);

const kb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
console.log('\nCampus Editor built');
console.log('===================');
console.log('Waypoints : ' + allWps.length);
console.log('Edges     : ' + allEdges.length);
console.log('Floors    : ' + sortedKeys.length);
console.log('Output    : ' + OUTPUT_FILE + ' (' + kb + ' KB)');
console.log('\nModes: View | Move | Edges | Add waypoint');
console.log('Open diagrams/index.html in any browser.\n');

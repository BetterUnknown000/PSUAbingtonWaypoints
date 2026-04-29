/**
 * scripts/buildConnectivityDiagrams.js
 *
 * Generates an interactive HTML connectivity report for every building/floor
 * in campusData.json. Open diagrams/index.html in any browser — no server needed.
 *
 * Usage:
 *   node scripts/buildConnectivityDiagrams.js
 *
 * Output:
 *   diagrams/index.html   — full interactive report with all floors
 *
 * Features:
 *   - Waypoints with real x/y (Woodland) are drawn at true pixel positions
 *   - Waypoints without x/y get a force-directed layout automatically
 *   - Disconnected waypoints highlighted in red
 *   - Hover any node to see its ID, label, type
 *   - Color-coded by waypoint type
 *   - BFS connectivity analysis printed per floor
 */

const fs   = require("fs");
const path = require("path");

const DATA_PATH   = path.join(__dirname, "..", "src", "data", "campusData.json");
const OUTPUT_DIR  = path.join(__dirname, "..", "diagrams");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "index.html");

// ─── Load data ────────────────────────────────────────────────────────────────

const raw       = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const allWps    = raw.waypoints || [];
const allEdges  = raw.edges     || [];

const wpById = {};
for (const w of allWps) wpById[w.id] = w;

// ─── Build adjacency ──────────────────────────────────────────────────────────

const adj = {};
for (const w of allWps) adj[w.id] = [];

for (const e of allEdges) {
  if (wpById[e.from] && wpById[e.to]) {
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }
}

// ─── BFS reachability per floor ───────────────────────────────────────────────

function bfsReachable(startId, allowedSet) {
  const visited = new Set();
  const queue   = [startId];
  while (queue.length) {
    const node = queue.shift();
    if (visited.has(node)) continue;
    visited.add(node);
    for (const nb of (adj[node] || [])) {
      if (allowedSet.has(nb) && !visited.has(nb)) queue.push(nb);
    }
  }
  return visited;
}

// ─── Group waypoints by building + floor ─────────────────────────────────────

const floors = {};
for (const w of allWps) {
  const key = `${w.building}__${w.floor}`;
  if (!floors[key]) floors[key] = [];
  floors[key].push(w);
}

// ─── Force-directed layout (for floors without x/y) ──────────────────────────

function forceLayout(nodes, edgePairs, width, height, iterations = 600) {
  const k     = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 1.8;
  const pos   = {};

  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    pos[n.id] = {
      x: width  / 2 + (width  * 0.38) * Math.cos(angle),
      y: height / 2 + (height * 0.38) * Math.sin(angle),
      vx: 0,
      vy: 0,
    };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos[nodes[i].id];
        const b = pos[nodes[j].id];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        a.vx -= (dx / dist) * force;
        a.vy -= (dy / dist) * force;
        b.vx += (dx / dist) * force;
        b.vy += (dy / dist) * force;
      }
    }

    // Attraction along edges
    for (const [aid, bid] of edgePairs) {
      if (!pos[aid] || !pos[bid]) continue;
      const a = pos[aid];
      const b = pos[bid];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / (k * 2.2);
      a.vx += (dx / dist) * force;
      a.vy += (dy / dist) * force;
      b.vx -= (dx / dist) * force;
      b.vy -= (dy / dist) * force;
    }

    // Apply velocity with cooling, clamp to canvas
    for (const n of nodes) {
      const p = pos[n.id];
      p.x = Math.max(60, Math.min(width  - 60, p.x + p.vx * cooling));
      p.y = Math.max(60, Math.min(height - 60, p.y + p.vy * cooling));
      p.vx *= 0.82;
      p.vy *= 0.82;
    }
  }

  return pos;
}

// ─── SVG builder per floor ────────────────────────────────────────────────────

const TYPE_COLOR = {
  entrance:    "#185FA5",
  stairs:      "#854F0B",
  elevator:    "#3B6D11",
  hallway:     "#888780",
  classroom:   "#533AB7",
  office:      "#444441",
  lab:         "#0F6E56",
  dining:      "#993C1D",
  lounge:      "#993556",
  recreation:  "#185FA5",
  hall:        "#888780",
};
const DEFAULT_COLOR = "#888780";

function typeColor(type) {
  return TYPE_COLOR[String(type || "").toLowerCase()] || DEFAULT_COLOR;
}

function buildFloorSVG(key, nodes) {
  const [building, floor] = key.split("__");
  const W = 1800, H = 1200;

  // Determine if we have real x/y
  const hasRealXY = nodes.some(n => n.x && n.y && Number(n.x) !== 0);

  // Build edge pairs for this floor
  const nodeSet    = new Set(nodes.map(n => n.id));
  const floorEdges = allEdges.filter(e => nodeSet.has(e.from) && nodeSet.has(e.to));
  const edgePairs  = floorEdges.map(e => [e.from, e.to]);

  // BFS to find disconnected nodes
  const startNode = nodes.find(n => (adj[n.id] || []).some(nb => nodeSet.has(nb))) || nodes[0];
  const reachable = startNode ? bfsReachable(startNode.id, nodeSet) : new Set();
  const disconnectedIds = new Set(nodes.filter(n => !reachable.has(n.id)).map(n => n.id));

  // Compute positions
  let posMap = {};

  if (hasRealXY) {
    // Scale real x/y to fit SVG canvas
    const xs = nodes.map(n => Number(n.x)).filter(Boolean);
    const ys = nodes.map(n => Number(n.y)).filter(Boolean);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad  = 50;
    const scaleX = (W - pad * 2) / (maxX - minX || 1);
    const scaleY = (H - pad * 2) / (maxY - minY || 1);
    const scale  = Math.min(scaleX, scaleY);

    for (const n of nodes) {
      posMap[n.id] = {
        x: pad + (Number(n.x) - minX) * scale,
        y: pad + (Number(n.y) - minY) * scale,
      };
    }
  } else {
    posMap = forceLayout(nodes, edgePairs, W, H);
  }

  // Draw SVG — nodes carry data-* attrs for the JS hover panel
  let svg = `<svg id="svg-${key}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#f8f7f4;border-radius:8px;display:block;max-width:100%">`;

  // Title
  svg += `<text x="16" y="22" font-size="13" font-family="system-ui,sans-serif" font-weight="500" fill="#2c2c2a">${building} · floor ${floor}</text>`;

  // Stats
  const dcCount = disconnectedIds.size;
  const statusColor = dcCount === 0 ? "#3B6D11" : "#A32D2D";
  const statusText  = dcCount === 0 ? `fully connected (${nodes.length} waypoints, ${floorEdges.length} edges)` : `${dcCount} disconnected of ${nodes.length} waypoints`;
  svg += `<text x="16" y="40" font-size="11" font-family="system-ui,sans-serif" fill="${statusColor}">${statusText}</text>`;

  // Edges — carry data attrs so JS can highlight on hover
  for (const [aid, bid] of edgePairs) {
    const a = posMap[aid], b = posMap[bid];
    if (!a || !b) continue;
    svg += `<line class="edge" data-a="${aid}" data-b="${bid}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#ccc" stroke-width="1.5"/>`;
  }

  // Nodes — data-* attrs carry all info for the hover panel
  for (const n of nodes) {
    const p  = posMap[n.id];
    if (!p) continue;
    const dc = disconnectedIds.has(n.id);
    const fill   = dc ? "#ffffff" : typeColor(n.type);
    const stroke = dc ? "#E24B4A" : typeColor(n.type);
    const sw     = dc ? 2.5 : 1;
    const r      = 9;

    const nbIds  = (adj[n.id] || []).filter(nb => nodeSet.has(nb));
    const nbData = JSON.stringify(nbIds.map(nb => ({
      id: nb, label: wpById[nb]?.label || nb, type: wpById[nb]?.type || "?"
    }))).replace(/"/g, "&quot;");

    const safeLabel = String(n.label || n.id).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const shortLabel = (() => {
      const m = String(n.label || "").match(/\d{3,}/);
      if (m) return m[0];
      return String(n.type || "?").slice(0,2).toUpperCase();
    })();

    const textFill = dc ? "#E24B4A" : "#fff";
    svg += `<g class="wp-node" data-id="${n.id}" data-label="${safeLabel}" data-type="${n.type||'?'}" data-nb="${nbData}" data-dc="${dc}" style="cursor:pointer">`;
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" font-size="8" font-family="system-ui,sans-serif" fill="${textFill}" pointer-events="none">${shortLabel}</text>`;
    svg += `</g>`;
  }

  svg += `</svg>`;
  return { svg, disconnected: [...disconnectedIds].map(id => ({ id, ...wpById[id] })), nodeCount: nodes.length, edgeCount: floorEdges.length };
}

// ─── Connectivity report ──────────────────────────────────────────────────────

const floorReports = [];
for (const [key, nodes] of Object.entries(floors)) {
  const [building, floor] = key.split("__");
  const result = buildFloorSVG(key, nodes);
  floorReports.push({ key, building, floor, ...result });
}

floorReports.sort((a, b) =>
  a.building.localeCompare(b.building) || String(a.floor).localeCompare(String(b.floor))
);

const totalDisconnected = floorReports.reduce((s, r) => s + r.disconnected.length, 0);
const floorsOk          = floorReports.filter(r => r.disconnected.length === 0).length;

// ─── Build HTML ───────────────────────────────────────────────────────────────

const legendEntries = Object.entries(TYPE_COLOR).map(([type, color]) =>
  `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 10px 6px 0;font-size:12px">
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="${color}"/></svg>${type}
  </span>`
).join("");

const floorButtons = floorReports.map(r =>
  `<button onclick="show('${r.key}')" id="btn-${r.key}" style="font-size:12px;padding:5px 10px;border:.5px solid #d3d1c7;border-radius:6px;background:#fff;cursor:pointer;margin:3px;color:${r.disconnected.length ? '#A32D2D' : '#2c2c2a'}">${r.building} F${r.floor}${r.disconnected.length ? " !" : ""}</button>`
).join("");

const floorPanels = floorReports.map(r => {
  const issueHTML = r.disconnected.length
    ? `<div style="margin-top:10px;padding:10px 14px;background:#FCEBEB;border:.5px solid #F7C1C1;border-radius:6px;font-size:12px;color:#791F1F">
        <strong>Disconnected:</strong><br>${r.disconnected.map(n =>
          `<code style="font-size:11px">${n.id}</code> — ${n.label || ''} (${n.type || '?'})`
        ).join("<br>")}
        <br><br><strong>Fix:</strong> Add an edge from each node above to its nearest neighbor in the same floor.
      </div>`
    : "";
  return `<div id="panel-${r.key}" style="display:none">${r.svg}${issueHTML}</div>`;
}).join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PSU Abington — Campus Connectivity Report</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f1efe8;margin:0;padding:20px;color:#2c2c2a}
  h1{font-size:18px;font-weight:500;margin:0 0 4px}
  .sub{font-size:13px;color:#5f5e5a;margin-bottom:20px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px}
  .card{background:#fff;border:.5px solid #d3d1c7;border-radius:8px;padding:14px;text-align:center}
  .card-val{font-size:24px;font-weight:500}
  .card-lbl{font-size:12px;color:#5f5e5a;margin-top:4px}
  .legend{margin-bottom:16px;line-height:2}
  .floors{margin-bottom:12px;line-height:1.8}
  .panel-wrap{background:#fff;border:.5px solid #d3d1c7;border-radius:10px;padding:16px;overflow:auto}
</style>
</head>
<body>
<h1>PSU Abington — Campus Waypoint Connectivity</h1>
<p class="sub">Generated from campusData.json · ${allWps.length} waypoints · ${allEdges.length} edges · ${floorReports.length} floors</p>

<div class="summary">
  <div class="card"><div class="card-val">${allWps.length}</div><div class="card-lbl">waypoints</div></div>
  <div class="card"><div class="card-val">${allEdges.length}</div><div class="card-lbl">edges</div></div>
  <div class="card"><div class="card-val" style="color:${totalDisconnected ? '#A32D2D' : '#3B6D11'}">${totalDisconnected}</div><div class="card-lbl">disconnected</div></div>
  <div class="card"><div class="card-val" style="color:#3B6D11">${floorsOk}</div><div class="card-lbl">floors fully connected</div></div>
</div>

<div class="legend"><strong style="font-size:12px">Node colors:</strong><br>${legendEntries}
  <span style="display:inline-flex;align-items:center;gap:5px;margin:0 10px 6px 0;font-size:12px">
    <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#fff" stroke="#E24B4A" stroke-width="2"/></svg>disconnected
  </span>
</div>

<div class="floors">${floorButtons}</div>

<div style="display:flex;gap:12px;align-items:flex-start">
<div style="flex:1;min-width:0">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
  <span style="font-size:12px;color:#5f5e5a">Scroll to zoom · drag to pan · hover node for details</span>
  <button onclick="resetZoom()" style="font-size:11px;padding:3px 10px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer;color:#2c2c2a">Reset view</button>
  <span id="zoom-level" style="font-size:11px;color:#888780;margin-left:4px">100%</span>
</div>

<div class="panel-wrap" id="graph-wrap" style="overflow:hidden;cursor:grab;position:relative;user-select:none">
  <div id="zoom-root" style="transform-origin:0 0;will-change:transform">
    <div id="placeholder" style="font-size:13px;color:#888780;padding:20px 0">Select a floor above to view its graph.</div>
    ${floorPanels}
  </div>
</div>
</div>

<div id="info-panel" style="display:none;width:220px;flex-shrink:0;background:#fff;border:.5px solid #d3d1c7;border-radius:8px;padding:14px;font-family:system-ui,sans-serif;position:sticky;top:12px;max-height:500px;overflow-y:auto"></div>
</div>

<p style="font-size:12px;color:#5f5e5a;margin-top:14px">
  Hover a node to highlight its connections and see details in the panel.<br>
  Red-bordered nodes are unreachable by BFS from the largest connected component.<br>
  Woodland uses real floor-plan pixel coordinates. All other buildings use force-directed layout.
</p>

<script>
let scale = 1, tx = 0, ty = 0;
let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

const root = document.getElementById('zoom-root');
const wrap = document.getElementById('graph-wrap');
const zoomLabel = document.getElementById('zoom-level');
const infoPanel = document.getElementById('info-panel');

function applyTransform() {
  root.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  zoomLabel.textContent = Math.round(scale * 100) + '%';
}

wrap.addEventListener('wheel', function(e) {
  e.preventDefault();
  const rect = wrap.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? 0.85 : 1.18;
  const newScale = Math.min(8, Math.max(0.15, scale * delta));
  tx = mouseX - (mouseX - tx) * (newScale / scale);
  ty = mouseY - (mouseY - ty) * (newScale / scale);
  scale = newScale;
  applyTransform();
}, { passive: false });

wrap.addEventListener('mousedown', function(e) {
  if (e.button !== 0) return;
  dragging = true;
  startX = e.clientX; startY = e.clientY;
  startTx = tx; startTy = ty;
  wrap.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', function(e) {
  if (!dragging) return;
  tx = startTx + (e.clientX - startX);
  ty = startTy + (e.clientY - startY);
  applyTransform();
});

window.addEventListener('mouseup', function() {
  dragging = false;
  wrap.style.cursor = 'grab';
});

function resetZoom() {
  scale = 1; tx = 0; ty = 0;
  applyTransform();
}

// ── Hover: highlight node + its edges, show info panel ──────────────────────

let lastSvg = null;

function bindHover(svgEl) {
  svgEl.querySelectorAll('.wp-node').forEach(g => {
    g.addEventListener('mouseenter', function(e) {
      e.stopPropagation();
      const id    = g.dataset.id;
      const label = g.dataset.label;
      const type  = g.dataset.type;
      const dc    = g.dataset.dc === 'true';
      let   nbs   = [];
      try { nbs = JSON.parse(g.dataset.nb.replace(/&quot;/g, '"')); } catch(_) {}

      // Dim everything, then highlight this node + its edges + neighbours
      svgEl.querySelectorAll('.wp-node circle').forEach(c => {
        c.style.opacity = '0.18';
      });
      svgEl.querySelectorAll('.edge').forEach(l => {
        l.style.opacity = '0.08';
        l.style.strokeWidth = '1';
      });

      // Highlight this node
      g.querySelector('circle').style.opacity = '1';
      g.querySelector('circle').style.strokeWidth = '3';

      // Highlight connected edges + neighbour nodes
      const nbSet = new Set(nbs.map(n => n.id));
      svgEl.querySelectorAll('.edge').forEach(l => {
        if (l.dataset.a === id || l.dataset.b === id) {
          l.style.opacity = '1';
          l.style.stroke = '#378ADD';
          l.style.strokeWidth = '2.5';
        }
      });
      svgEl.querySelectorAll('.wp-node').forEach(og => {
        if (nbSet.has(og.dataset.id)) {
          og.querySelector('circle').style.opacity = '1';
          og.querySelector('circle').style.strokeWidth = '2.5';
        }
      });

      // Info panel
      const nbHtml = nbs.length
        ? nbs.map(function(n) {
            return '<div style="padding:2px 0;font-size:12px"><span style="color:#888780;font-size:11px">' + n.type + '</span> &nbsp;' + n.label + '</div>';
          }).join('')
        : '<div style="font-size:12px;color:#888780">none on this floor</div>';

      const dcBadge  = dc
        ? '<span style="padding:2px 7px;border-radius:4px;background:#FCEBEB;color:#791F1F">disconnected</span>'
        : '<span style="padding:2px 7px;border-radius:4px;background:#EAF3DE;color:#27500A">connected</span>';
      const typeBadge = '<span style="padding:2px 7px;border-radius:4px;background:#f1efe8;color:#2c2c2a">' + type + '</span>';

      infoPanel.innerHTML =
        '<div style="font-weight:500;font-size:13px;margin-bottom:2px">' + label + '</div>' +
        '<div style="font-size:11px;color:#888780;margin-bottom:8px;font-family:monospace">' + id + '</div>' +
        '<div style="font-size:11px;margin-bottom:8px">' + dcBadge + ' &nbsp;' + typeBadge + '</div>' +
        '<div style="font-size:12px;font-weight:500;margin-bottom:4px">Connections (' + nbs.length + ')</div>' +
        nbHtml;
      infoPanel.style.display = 'block';
    });

    g.addEventListener('mouseleave', function() {
      // Restore all
      svgEl.querySelectorAll('.wp-node circle').forEach(c => {
        c.style.opacity = '';
        c.style.strokeWidth = '';
      });
      svgEl.querySelectorAll('.edge').forEach(l => {
        l.style.opacity = '';
        l.style.stroke = '';
        l.style.strokeWidth = '';
      });
      infoPanel.style.display = 'none';
    });
  });
}

function show(key) {
  scale = 1; tx = 0; ty = 0;
  applyTransform();
  document.getElementById('placeholder').style.display = 'none';
  document.querySelectorAll('[id^="panel-"]').forEach(el => el.style.display = 'none');
  const panel = document.getElementById('panel-' + key);
  panel.style.display = 'block';
  document.querySelectorAll('[id^="btn-"]').forEach(b => b.style.fontWeight = '400');
  document.getElementById('btn-' + key).style.fontWeight = '500';

  // Bind hover to the newly visible SVG
  const svg = panel.querySelector('svg');
  if (svg && svg !== lastSvg) {
    bindHover(svg);
    lastSvg = svg;
  }
}
</script>
</body>
</html>`;

// ─── Write output ─────────────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, html, "utf8");

// Console report
console.log(`\nCampus Connectivity Report`);
console.log(`===========================`);
console.log(`Waypoints : ${allWps.length}`);
console.log(`Edges     : ${allEdges.length}`);
console.log(`Floors    : ${floorReports.length}`);
console.log(`Disconnected waypoints: ${totalDisconnected}\n`);

for (const r of floorReports) {
  const status = r.disconnected.length === 0 ? "OK" : "!!";
  console.log(`[${status}] ${r.building.padEnd(12)} floor ${String(r.floor).padEnd(8)} ${r.nodeCount} nodes  ${r.edgeCount} edges${r.disconnected.length ? `  — DISCONNECTED: ${r.disconnected.map(n => n.id).join(", ")}` : ""}`);
}

console.log(`\nOutput: ${OUTPUT_FILE}`);
console.log(`Open that file in any browser — no server needed.\n`);

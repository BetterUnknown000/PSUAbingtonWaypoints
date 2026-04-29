/**
 * scripts/buildConnectivityDiagrams.js
 *
 * Generates an interactive HTML connectivity report with floorplan overlays.
 * Open diagrams/index.html in any browser — no server needed.
 *
 * Usage:  node scripts/buildConnectivityDiagrams.js
 *
 * Features:
 *  - Floorplan SVG embedded as background where available
 *  - Woodland waypoints drawn at real pixel coordinates (aligned to floorplan)
 *  - Other buildings use force-directed layout over the floorplan
 *  - Scroll to zoom, drag to pan
 *  - Hover a node: highlights its edges + neighbours, shows connection panel
 *  - Disconnected nodes shown with red border
 */

const fs   = require("fs");
const path = require("path");

const DATA_PATH      = path.join(__dirname, "..", "src", "data", "campusData.json");
const FLOORPLAN_DIR  = path.join(__dirname, "..", "src", "assets", "floorplans");
const OUTPUT_DIR     = path.join(__dirname, "..", "diagrams");
const OUTPUT_FILE    = path.join(OUTPUT_DIR, "index.html");

// ─── Load campus data ─────────────────────────────────────────────────────────

const raw      = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const allWps   = raw.waypoints || [];
const allEdges = raw.edges     || [];

const wpById = {};
for (const w of allWps) wpById[w.id] = w;

const adj = {};
for (const w of allWps) adj[w.id] = [];
for (const e of allEdges) {
  if (wpById[e.from] && wpById[e.to]) {
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }
}

// ─── Floorplan loader ─────────────────────────────────────────────────────────

function getFloorplanPath(building, floor) {
  const floorKey = floor === "ground" ? "ground" : `floor${floor}`;
  const candidates = [
    `${building}_${floorKey}_with_outline.svg`,
    `${building}_${floorKey}.svg`,
  ];
  for (const c of candidates) {
    const p = path.join(FLOORPLAN_DIR, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadFloorplanInner(filePath) {
  if (!filePath) return null;
  const content = fs.readFileSync(filePath, "utf8");
  // Strip outer <svg ...> wrapper and </svg>, return only inner elements
  const inner = content
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<svg[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();
  return inner;
}

// ─── BFS ──────────────────────────────────────────────────────────────────────

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

// ─── Force-directed layout ────────────────────────────────────────────────────

function forceLayout(nodes, edgePairs, width, height, iterations = 600) {
  const k   = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 1.8;
  const pos = {};

  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    pos[n.id] = {
      x:  width  / 2 + width  * 0.38 * Math.cos(angle),
      y:  height / 2 + height * 0.38 * Math.sin(angle),
      vx: 0, vy: 0,
    };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const cool = 1 - iter / iterations;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a  = pos[nodes[i].id];
        const b  = pos[nodes[j].id];
        const dx = b.x - a.x || 0.01;
        const dy = b.y - a.y || 0.01;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f  = (k * k) / d;
        a.vx -= (dx / d) * f;  a.vy -= (dy / d) * f;
        b.vx += (dx / d) * f;  b.vy += (dy / d) * f;
      }
    }

    for (const [aid, bid] of edgePairs) {
      if (!pos[aid] || !pos[bid]) continue;
      const a  = pos[aid];
      const b  = pos[bid];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f  = (d * d) / (k * 2.2);
      a.vx += (dx / d) * f;  a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f;  b.vy -= (dy / d) * f;
    }

    for (const n of nodes) {
      const p = pos[n.id];
      p.x  = Math.max(50, Math.min(width  - 50, p.x + p.vx * cool));
      p.y  = Math.max(50, Math.min(height - 50, p.y + p.vy * cool));
      p.vx *= 0.82;  p.vy *= 0.82;
    }
  }

  return pos;
}

// ─── Type colours ─────────────────────────────────────────────────────────────

const TYPE_COLOR = {
  entrance:   "#185FA5", stairs:     "#854F0B", elevator:   "#3B6D11",
  hallway:    "#5f5e5a", classroom:  "#533AB7", office:     "#2c2c2a",
  lab:        "#0F6E56", dining:     "#993C1D", lounge:     "#993556",
  recreation: "#185FA5", hall:       "#5f5e5a",
};
function typeColor(t) { return TYPE_COLOR[String(t||"").toLowerCase()] || "#888780"; }

// ─── SVG builder per floor ────────────────────────────────────────────────────

// All canvases use 1000×1000 to match floorplan coordinate space
const W = 1000, H = 1000;

function buildFloorSVG(key, nodes) {
  const [building, floor] = key.split("__");

  const hasRealXY    = nodes.some(n => n.x && n.y && Number(n.x) !== 0);
  const floorplanPath = getFloorplanPath(building, floor);
  const floorplanSVG  = loadFloorplanInner(floorplanPath);

  const nodeSet    = new Set(nodes.map(n => n.id));
  const floorEdges = allEdges.filter(e => nodeSet.has(e.from) && nodeSet.has(e.to));
  const edgePairs  = floorEdges.map(e => [e.from, e.to]);

  const startNode      = nodes.find(n => (adj[n.id]||[]).some(nb => nodeSet.has(nb))) || nodes[0];
  const reachable      = startNode ? bfsReachable(startNode.id, nodeSet) : new Set();
  const disconnectedIds = new Set(nodes.filter(n => !reachable.has(n.id)).map(n => n.id));

  // Positions
  let posMap = {};
  if (hasRealXY) {
    // Coordinates are already in 1000x1000 space — use directly
    for (const n of nodes) {
      posMap[n.id] = { x: Number(n.x) || W/2, y: Number(n.y) || H/2 };
    }
  } else {
    posMap = forceLayout(nodes, edgePairs, W, H);
  }

  // Build SVG string
  let svg = `<svg id="svg-${key}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;max-width:100%">`;

  // ── Background floorplan ──
  if (floorplanSVG) {
    // Clip to canvas bounds
    svg += `<defs><clipPath id="clip-${key}"><rect width="${W}" height="${H}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#clip-${key})" opacity="${hasRealXY ? '0.35' : '0.25'}">${floorplanSVG}</g>`;
  } else {
    svg += `<rect width="${W}" height="${H}" fill="#f8f7f4"/>`;
  }

  // ── Status bar background ──
  svg += `<rect x="0" y="0" width="${W}" height="48" fill="rgba(248,247,244,0.88)"/>`;
  svg += `<text x="12" y="18" font-size="13" font-family="system-ui,sans-serif" font-weight="500" fill="#2c2c2a">${building} · floor ${floor}</text>`;

  const dcCount     = disconnectedIds.size;
  const statusColor = dcCount === 0 ? "#3B6D11" : "#A32D2D";
  const statusText  = dcCount === 0
    ? `fully connected — ${nodes.length} waypoints, ${floorEdges.length} edges`
    : `${dcCount} disconnected of ${nodes.length} waypoints`;
  svg += `<text x="12" y="36" font-size="11" font-family="system-ui,sans-serif" fill="${statusColor}">${statusText}</text>`;

  if (!hasRealXY && floorplanSVG) {
    svg += `<text x="${W-12}" y="36" text-anchor="end" font-size="10" font-family="system-ui,sans-serif" fill="#854F0B">positions are approximate — add x/y to align</text>`;
  }

  // ── Edges ──
  for (const [aid, bid] of edgePairs) {
    const a = posMap[aid], b = posMap[bid];
    if (!a || !b) continue;
    svg += `<line class="edge" data-a="${aid}" data-b="${bid}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="rgba(0,0,0,0.35)" stroke-width="1.5"/>`;
  }

  // ── Nodes ──
  for (const n of nodes) {
    const p  = posMap[n.id];
    if (!p) continue;
    const dc     = disconnectedIds.has(n.id);
    const color  = typeColor(n.type);
    const fill   = dc ? "#fff" : color;
    const stroke = dc ? "#E24B4A" : color;
    const sw     = dc ? 2.5 : 1.5;
    const r      = 8;

    const nbIds  = (adj[n.id] || []).filter(nb => nodeSet.has(nb));
    const nbData = JSON.stringify(
      nbIds.map(nb => ({ id: nb, label: wpById[nb]?.label || nb, type: wpById[nb]?.type || "?" }))
    ).replace(/"/g, "&quot;");

    const safeLabel = String(n.label || n.id)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    const shortLabel = (() => {
      const m = String(n.label || "").match(/\d{3,}/);
      if (m) return m[0];
      return String(n.type || "?").slice(0, 2).toUpperCase();
    })();

    svg += `<g class="wp-node" data-id="${n.id}" data-label="${safeLabel}" data-type="${n.type||'?'}" data-nb="${nbData}" data-dc="${dc}" data-x="${n.x||0}" data-y="${n.y||0}" style="cursor:pointer">`;
    svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="0.92"/>`;
    svg += `<text x="${p.x.toFixed(1)}" y="${(p.y+3.5).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="500" font-family="system-ui,sans-serif" fill="${dc?'#E24B4A':'#fff'}" pointer-events="none">${shortLabel}</text>`;
    svg += `</g>`;
  }

  svg += `</svg>`;
  return {
    svg,
    disconnected: [...disconnectedIds].map(id => ({ id, ...wpById[id] })),
    nodeCount: nodes.length,
    edgeCount: floorEdges.length,
    hasFloorplan: !!floorplanSVG,
    hasRealXY,
  };
}

// ─── Group by floor and build ─────────────────────────────────────────────────

const floors = {};
for (const w of allWps) {
  const key = `${w.building}__${w.floor}`;
  if (!floors[key]) floors[key] = [];
  floors[key].push(w);
}

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
const floorsWithMap     = floorReports.filter(r => r.hasFloorplan).length;

// ─── HTML ─────────────────────────────────────────────────────────────────────

const legendHTML = Object.entries(TYPE_COLOR).map(([type, color]) =>
  `<span style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 5px 0;font-size:11px">` +
  `<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="${color}"/></svg>${type}</span>`
).join("") +
  `<span style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 5px 0;font-size:11px">` +
  `<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#fff" stroke="#E24B4A" stroke-width="2"/></svg>disconnected</span>`;

const floorButtons = floorReports.map(r => {
  const dc      = r.disconnected.length > 0;
  const mapIcon = r.hasFloorplan ? (r.hasRealXY ? "🗺" : "🗺~") : "";
  return `<button onclick="show('${r.key}')" id="btn-${r.key}" ` +
    `style="font-size:11px;padding:4px 9px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer;margin:2px;` +
    `color:${dc ? '#A32D2D' : '#2c2c2a'}">${r.building} F${r.floor} ${mapIcon}${dc ? " !" : ""}</button>`;
}).join("");

const floorPanels = floorReports.map(r => {
  const issueHTML = r.disconnected.length
    ? `<div style="margin-top:8px;padding:8px 12px;background:#FCEBEB;border:.5px solid #F7C1C1;border-radius:6px;font-size:11px;color:#791F1F">` +
      `<strong>Disconnected:</strong><br>` +
      r.disconnected.map(n => `<code style="font-size:10px">${n.id}</code> — ${n.label||''} (${n.type||'?'})`).join("<br>") +
      `<br><br><strong>Fix:</strong> Add an edge from each node above to its nearest connected neighbour on the same floor.</div>`
    : "";
  return `<div id="panel-${r.key}" style="display:none">${r.svg}${issueHTML}</div>`;
}).join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>PSU Abington — Campus Connectivity</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#f1efe8;padding:16px;color:#2c2c2a}
  h1{font-size:17px;font-weight:500;margin-bottom:3px}
  .sub{font-size:12px;color:#5f5e5a;margin-bottom:16px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:14px}
  .card{background:#fff;border:.5px solid #d3d1c7;border-radius:8px;padding:12px;text-align:center}
  .card-val{font-size:22px;font-weight:500}
  .card-lbl{font-size:11px;color:#5f5e5a;margin-top:3px}
  .legend{margin-bottom:12px;line-height:2}
  .floors{margin-bottom:10px;line-height:1.8}
  .panel-wrap{background:#e8e6e0;border:.5px solid #d3d1c7;border-radius:8px;overflow:hidden;cursor:grab;position:relative;user-select:none}
</style>
</head>
<body>
<h1>PSU Abington — Campus Waypoint Connectivity</h1>
<p class="sub">From campusData.json · ${allWps.length} waypoints · ${allEdges.length} edges · ${floorReports.length} floors · 🗺 = floorplan overlay · 🗺~ = floorplan but positions approximate</p>

<div class="summary">
  <div class="card"><div class="card-val">${allWps.length}</div><div class="card-lbl">waypoints</div></div>
  <div class="card"><div class="card-val">${allEdges.length}</div><div class="card-lbl">edges</div></div>
  <div class="card"><div class="card-val" style="color:${totalDisconnected?'#A32D2D':'#3B6D11'}">${totalDisconnected}</div><div class="card-lbl">disconnected</div></div>
  <div class="card"><div class="card-val" style="color:#3B6D11">${floorsOk}</div><div class="card-lbl">floors OK</div></div>
  <div class="card"><div class="card-val">${floorsWithMap}</div><div class="card-lbl">with floorplan</div></div>
</div>

<div class="legend">${legendHTML}</div>
<div class="floors">${floorButtons}</div>

<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
  <span style="font-size:11px;color:#5f5e5a">Scroll to zoom · drag to pan · hover node for details</span>
  <button onclick="resetZoom()" style="font-size:11px;padding:3px 9px;border:.5px solid #d3d1c7;border-radius:5px;background:#fff;cursor:pointer">Reset view</button>
  <span id="zoom-level" style="font-size:11px;color:#888780">100%</span>
</div>

<div style="display:flex;gap:10px;align-items:flex-start">
  <div style="flex:1;min-width:0">
    <div class="panel-wrap" id="graph-wrap">
      <div id="zoom-root" style="transform-origin:0 0;will-change:transform">
        <div id="placeholder" style="padding:24px 16px;font-size:13px;color:#888780">Select a floor above to view its graph.</div>
        ${floorPanels}
      </div>
    </div>
  </div>
  <div id="info-panel" style="display:none;width:210px;flex-shrink:0;background:#fff;border:.5px solid #d3d1c7;border-radius:8px;padding:12px;font-size:13px;position:sticky;top:10px;max-height:520px;overflow-y:auto"></div>
</div>

<p style="font-size:11px;color:#888780;margin-top:10px">
  Hover a node to highlight its connections. Woodland waypoints align exactly with the floorplan.
  Other buildings use force-directed layout — add x/y coordinates in campusData.json to align them.
</p>

<script>
let scale=1,tx=0,ty=0,dragging=false,startX=0,startY=0,startTx=0,startTy=0,lastSvg=null;
const root=document.getElementById('zoom-root');
const wrap=document.getElementById('graph-wrap');
const zoomLbl=document.getElementById('zoom-level');
const info=document.getElementById('info-panel');

function applyT(){
  root.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';
  zoomLbl.textContent=Math.round(scale*100)+'%';
}

wrap.addEventListener('wheel',function(e){
  e.preventDefault();
  const r=wrap.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const d=e.deltaY>0?0.85:1.18;
  const ns=Math.min(10,Math.max(0.1,scale*d));
  tx=mx-(mx-tx)*(ns/scale); ty=my-(my-ty)*(ns/scale); scale=ns; applyT();
},{passive:false});

wrap.addEventListener('mousedown',function(e){
  if(e.button!==0)return;
  dragging=true; startX=e.clientX; startY=e.clientY; startTx=tx; startTy=ty;
  wrap.style.cursor='grabbing';
});
window.addEventListener('mousemove',function(e){
  if(!dragging)return; tx=startTx+(e.clientX-startX); ty=startTy+(e.clientY-startY); applyT();
});
window.addEventListener('mouseup',function(){ dragging=false; wrap.style.cursor='grab'; });

function resetZoom(){ scale=1;tx=0;ty=0;applyT(); }

function bindHover(svgEl){
  svgEl.querySelectorAll('.wp-node').forEach(function(g){
    g.addEventListener('mouseenter',function(e){
      e.stopPropagation();
      var id=g.dataset.id, label=g.dataset.label, type=g.dataset.type, dc=g.dataset.dc==='true';
      var wx=g.dataset.x, wy=g.dataset.y;
      var hasXY = wx && wy && Number(wx) !== 0;
      var nbs=[];
      try{ nbs=JSON.parse(g.dataset.nb.replace(/&quot;/g,'"')); }catch(x){}

      svgEl.querySelectorAll('.wp-node circle').forEach(function(c){ c.style.opacity='0.15'; });
      svgEl.querySelectorAll('.edge').forEach(function(l){ l.style.opacity='0.08'; l.style.strokeWidth='1'; });

      g.querySelector('circle').style.opacity='1';
      g.querySelector('circle').style.strokeWidth='3';

      var nbSet=new Set(nbs.map(function(n){ return n.id; }));
      svgEl.querySelectorAll('.edge').forEach(function(l){
        if(l.dataset.a===id||l.dataset.b===id){
          l.style.opacity='1'; l.style.stroke='#185FA5'; l.style.strokeWidth='2.5';
        }
      });
      svgEl.querySelectorAll('.wp-node').forEach(function(og){
        if(nbSet.has(og.dataset.id)){ og.querySelector('circle').style.opacity='1'; og.querySelector('circle').style.strokeWidth='2.5'; }
      });

      var dcBadge=dc
        ? '<span style="padding:2px 6px;border-radius:4px;background:#FCEBEB;color:#791F1F;font-size:11px">disconnected</span>'
        : '<span style="padding:2px 6px;border-radius:4px;background:#EAF3DE;color:#27500A;font-size:11px">connected</span>';
      var typeBadge='<span style="padding:2px 6px;border-radius:4px;background:#f1efe8;color:#2c2c2a;font-size:11px">'+type+'</span>';
      var nbRows=nbs.length
        ? nbs.map(function(n){
            return '<div style="padding:3px 0;font-size:12px;border-bottom:.5px solid #f1efe8"><span style="color:#888780;font-size:10px">'+n.type+'</span> '+n.label+'</div>';
          }).join('')
        : '<div style="font-size:12px;color:#888780">none on this floor</div>';

      var xyRow = hasXY
        ? '<div style="font-size:11px;color:#5f5e5a;margin-bottom:8px;font-family:monospace">x: '+Number(wx).toFixed(1)+' &nbsp; y: '+Number(wy).toFixed(1)+'</div>'
        : '<div style="font-size:11px;color:#A32D2D;margin-bottom:8px">x/y not set — add to campusData.json</div>';

      info.innerHTML=
        '<div style="font-weight:500;font-size:13px;margin-bottom:2px">'+label+'</div>'+
        '<div style="font-size:10px;color:#888780;font-family:monospace;margin-bottom:4px;word-break:break-all">'+id+'</div>'+
        xyRow+
        '<div style="margin-bottom:8px">'+dcBadge+' '+typeBadge+'</div>'+
        '<div style="font-size:12px;font-weight:500;margin-bottom:4px">Connections ('+nbs.length+')</div>'+
        nbRows;
      info.style.display='block';
    });
    g.addEventListener('mouseleave',function(){
      svgEl.querySelectorAll('.wp-node circle').forEach(function(c){ c.style.opacity=''; c.style.strokeWidth=''; });
      svgEl.querySelectorAll('.edge').forEach(function(l){ l.style.opacity=''; l.style.stroke=''; l.style.strokeWidth=''; });
      info.style.display='none';
    });
  });
}

function show(key){
  scale=1;tx=0;ty=0;applyT();
  document.getElementById('placeholder').style.display='none';
  document.querySelectorAll('[id^="panel-"]').forEach(function(el){ el.style.display='none'; });
  document.getElementById('panel-'+key).style.display='block';
  document.querySelectorAll('[id^="btn-"]').forEach(function(b){ b.style.fontWeight='400'; b.style.background='#fff'; });
  var btn=document.getElementById('btn-'+key);
  btn.style.fontWeight='500'; btn.style.background='#f1efe8';
  var svgEl=document.getElementById('panel-'+key).querySelector('svg');
  if(svgEl&&svgEl!==lastSvg){ bindHover(svgEl); lastSvg=svgEl; }
}
</script>
</body>
</html>`;

// ─── Write output ─────────────────────────────────────────────────────────────

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, html, "utf8");

console.log("\nCampus Connectivity Report");
console.log("===========================");
console.log(`Waypoints : ${allWps.length}`);
console.log(`Edges     : ${allEdges.length}`);
console.log(`Floors    : ${floorReports.length}`);
console.log(`With floorplan overlay: ${floorsWithMap}`);
console.log(`Disconnected waypoints: ${totalDisconnected}\n`);

for (const r of floorReports) {
  const st  = r.disconnected.length === 0 ? "OK" : "!!";
  const map = r.hasFloorplan ? (r.hasRealXY ? " [exact map]" : " [map~approx]") : "";
  const dc  = r.disconnected.length ? `  — DISCONNECTED: ${r.disconnected.map(n=>n.id).join(", ")}` : "";
  console.log(`[${st}] ${r.building.padEnd(12)} floor ${String(r.floor).padEnd(8)} ${r.nodeCount} nodes  ${r.edgeCount} edges${map}${dc}`);
}

console.log(`\nOutput: ${OUTPUT_FILE}`);
console.log("Open in any browser — no server needed.\n");

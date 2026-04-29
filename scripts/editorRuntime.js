// editorRuntime.js — browser-side editor logic
// Loaded by buildConnectivityDiagrams.js into the generated HTML

var allWps   = FULL_CAMPUS.waypoints.map(function(w) { return Object.assign({}, w); });
var allEdges = FULL_CAMPUS.edges.map(function(e)     { return Object.assign({}, e); });

var wpById = {};
allWps.forEach(function(w) { wpById[w.id] = w; });

// Positions — initialised from FLOOR_DATA, updated on drag
var positions = {};
Object.values(FLOOR_DATA).forEach(function(fd) {
  Object.keys(fd.positions).forEach(function(id) {
    positions[id] = { x: fd.positions[id].x, y: fd.positions[id].y };
  });
});

var currentKey   = null;
var mode         = 'view';
var hoveredNode  = null;
var edgePendFrom = null;
var pendingPos   = null;
var dirty        = false;

var scale = 1, tx = 0, ty = 0;
var panning = false, panSX = 0, panSY = 0, panTX = 0, panTY = 0;
var draggingNode = null, dnSX = 0, dnSY = 0, dnOX = 0, dnOY = 0;

// ── Legend ────────────────────────────────────────────────────────────────────
var legEl = document.getElementById('legend');
Object.keys(TYPE_COLOR).forEach(function(type) {
  var r = document.createElement('div');
  r.className = 'leg-row';
  r.innerHTML = '<div class="leg-dot" style="background:' + TYPE_COLOR[type] + '"></div>' + type;
  legEl.appendChild(r);
});
var dc = document.createElement('div');
dc.className = 'leg-row';
dc.innerHTML = '<div class="leg-dot" style="background:#fff;border:2px solid #E24B4A"></div>disconnected';
legEl.appendChild(dc);

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeColor(t) { return TYPE_COLOR[String(t || '').toLowerCase()] || '#888780'; }

function buildAdj() {
  var adj = {};
  allWps.forEach(function(w) { adj[w.id] = []; });
  allEdges.forEach(function(e) {
    if (wpById[e.from] && wpById[e.to]) {
      adj[e.from].push(e.to);
      adj[e.to].push(e.from);
    }
  });
  return adj;
}

function bfs(startId, allowed, adj) {
  var vis = {}, q = [startId];
  while (q.length) {
    var cur = q.shift();
    if (vis[cur]) continue;
    vis[cur] = true;
    (adj[cur] || []).forEach(function(nb) { if (allowed[nb] && !vis[nb]) q.push(nb); });
  }
  return vis;
}

function svgCoords(clientX, clientY) {
  var r = document.getElementById('canvas-wrap').getBoundingClientRect();
  return { x: (clientX - r.left - tx) / scale, y: (clientY - r.top - ty) / scale };
}

function floorNodeIds() {
  if (!currentKey) return [];
  var parts = currentKey.split('__'), b = parts[0], f = parts[1];
  return allWps
    .filter(function(w) { return w.building === b && String(w.floor) === String(f); })
    .map(function(w) { return w.id; });
}

function edgeExists(from, to) {
  return allEdges.some(function(e) {
    return (e.from === from && e.to === to) || (e.from === to && e.to === from);
  });
}

function removeEdge(from, to) {
  allEdges = allEdges.filter(function(e) {
    return !((e.from === from && e.to === to) || (e.from === to && e.to === from));
  });
}

// ── Zoom / pan ─────────────────────────────────────────────────────────────────
var wrap  = document.getElementById('canvas-wrap');
var zroot = document.getElementById('zoom-root');
var zoomL = document.getElementById('zoom-lbl');

function applyT() {
  zroot.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
  zoomL.textContent = Math.round(scale * 100) + '%';
}
function resetZoom() { scale = 1; tx = 0; ty = 0; applyT(); }

wrap.addEventListener('wheel', function(e) {
  e.preventDefault();
  var r = wrap.getBoundingClientRect();
  var mx = e.clientX - r.left, my = e.clientY - r.top;
  var d = e.deltaY > 0 ? 0.85 : 1.18;
  var ns = Math.min(12, Math.max(0.05, scale * d));
  tx = mx - (mx - tx) * (ns / scale);
  ty = my - (my - ty) * (ns / scale);
  scale = ns; applyT();
}, { passive: false });

wrap.addEventListener('mousedown', function(e) {
  if (e.button !== 0 || draggingNode) return;
  panning = true; panSX = e.clientX; panSY = e.clientY; panTX = tx; panTY = ty;
  wrap.classList.add('grabbing');
});
window.addEventListener('mousemove', function(e) {
  if (draggingNode) {
    var sv = svgCoords(e.clientX, e.clientY);
    positions[draggingNode].x = Math.max(0, Math.min(1000, dnOX + (sv.x - dnSX)));
    positions[draggingNode].y = Math.max(0, Math.min(1000, dnOY + (sv.y - dnSY)));
    // Update x/y display in real time while dragging
    var p = positions[draggingNode];
    var xyEl = document.querySelector('#node-info .val[data-xy]');
    if (xyEl) {
      xyEl.textContent = 'x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1);
    }
    render();
    return;
  }
  if (!panning) return;
  tx = panTX + (e.clientX - panSX);
  ty = panTY + (e.clientY - panSY);
  applyT();
});
window.addEventListener('mouseup', function() {
  if (draggingNode) {
    var p = positions[draggingNode];
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
    if (wpById[draggingNode]) { wpById[draggingNode].x = p.x; wpById[draggingNode].y = p.y; }
    markDirty();
    // Refresh the full info panel after drop so all values are current
    var id = draggingNode;
    draggingNode = null;
    var adj = buildAdj();
    var ns = {}; floorNodeIds().forEach(function(i) { ns[i] = true; });
    showInfo(id, adj, ns);
    render();
  }
  panning = false;
  wrap.classList.remove('grabbing');
});

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  if (!currentKey) return;
  var adj     = buildAdj();
  var nodeIds = floorNodeIds();
  var nodeSet = {};
  nodeIds.forEach(function(id) { nodeSet[id] = true; });
  var fEdges  = allEdges.filter(function(e) { return nodeSet[e.from] && nodeSet[e.to]; });

  // BFS disconnected
  var start = nodeIds.find(function(id) {
    return (adj[id] || []).some(function(nb) { return nodeSet[nb]; });
  });
  var reachable = start ? bfs(start, nodeSet, adj) : {};
  var dcSet = {};
  nodeIds.forEach(function(id) { if (!reachable[id]) dcSet[id] = true; });

  // Stats
  document.getElementById('s-wps').textContent   = allWps.length;
  document.getElementById('s-edges').textContent  = allEdges.length;
  var dcEl = document.getElementById('s-dc');
  var dcCount = Object.keys(dcSet).length;
  dcEl.textContent = dcCount;
  dcEl.style.color = dcCount ? '#A32D2D' : '#3B6D11';

  // Build SVG
  var parts = currentKey.split('__');
  var building = parts[0];

  var svgParts = [];

  // Background floorplan from hidden div
  var fpDiv = document.getElementById('fp-' + currentKey);
  if (fpDiv) {
    var fpSvg = fpDiv.querySelector('svg');
    if (fpSvg) {
      var fd = FLOOR_DATA[currentKey];
      var op = fd && fd.hasRealXY ? 0.35 : 0.25;
      svgParts.push('<defs><clipPath id="fpc"><rect width="1000" height="1000"/></clipPath></defs>');
      svgParts.push('<g clip-path="url(#fpc)" opacity="' + op + '">' + fpSvg.innerHTML + '</g>');
    }
  } else {
    svgParts.push('<rect width="1000" height="1000" fill="#f8f7f4"/>');
  }

  // Edges
  fEdges.forEach(function(e) {
    var a = positions[e.from], b = positions[e.to];
    if (!a || !b) return;
    var hl = hoveredNode && (e.from === hoveredNode || e.to === hoveredNode);
    var pd = edgePendFrom && (e.from === edgePendFrom || e.to === edgePendFrom);
    svgParts.push(
      '<line class="e-line"' +
      ' data-from="' + e.from + '" data-to="' + e.to + '"' +
      ' x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '"' +
      ' x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"' +
      ' stroke="' + (hl ? '#185FA5' : pd ? '#854F0B' : 'rgba(0,0,0,0.28)') + '"' +
      ' stroke-width="' + (hl || pd ? 2.5 : 1.5) + '"' +
      ' style="cursor:pointer"/>'
    );
  });

  // Nodes
  nodeIds.forEach(function(id) {
    var wp = wpById[id], p = positions[id];
    if (!wp || !p) return;
    var isDc = !!dcSet[id];
    var isHl = hoveredNode === id;
    var isPd = edgePendFrom === id;
    var color  = typeColor(wp.type);
    var fill   = isDc ? '#fff' : color;
    var stroke = isDc ? '#E24B4A' : isPd ? '#854F0B' : isHl ? '#fff' : color;
    var sw     = isDc || isPd ? 2.5 : isHl ? 2 : 1.5;
    var r      = isHl || isPd ? 10 : 8;
    var label  = wp.label || '';
    var m      = label.match(/\d{3,}/);
    var sl     = m ? m[0] : (wp.type || '?').slice(0, 2).toUpperCase();
    svgParts.push(
      '<g class="wp-node" data-id="' + id + '" style="cursor:pointer">' +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '"' +
      ' r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '" opacity="0.93"/>' +
      '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 3.5).toFixed(1) + '"' +
      ' text-anchor="middle" font-size="7" font-weight="500"' +
      ' font-family="system-ui,sans-serif"' +
      ' fill="' + (isDc ? '#E24B4A' : '#fff') + '" pointer-events="none">' + sl + '</text>' +
      '</g>'
    );
  });

  // Get or create SVG element
  var svg = document.getElementById('main-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'main-svg';
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '1000');
    svg.style.display = 'block';
    zroot.innerHTML = '';
    zroot.appendChild(svg);
  }
  svg.innerHTML = svgParts.join('');

  // Click on blank canvas in add mode
  svg.onclick = function(e) {
    if (mode !== 'add') return;
    if (e.target.closest && e.target.closest('.wp-node')) return;
    var sv = svgCoords(e.clientX, e.clientY);
    pendingPos = { x: Math.round(sv.x * 10) / 10, y: Math.round(sv.y * 10) / 10 };
    document.getElementById('modal-coords').textContent =
      'Position: x=' + pendingPos.x.toFixed(1) + ', y=' + pendingPos.y.toFixed(1);
    document.getElementById('modal-overlay').classList.add('open');
    e.stopPropagation();
  };

  bindEvents(svg, adj, nodeSet, dcSet);
}

// ── Bind SVG events ───────────────────────────────────────────────────────────
function bindEvents(svg, adj, nodeSet, dcSet) {
  svg.querySelectorAll('.e-line').forEach(function(line) {
    line.addEventListener('click', function(e) {
      if (mode === 'move') return;
      var from = line.dataset.from, to = line.dataset.to;
      if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) {
        removeEdge(from, to);
        markDirty();
        render();
      }
      e.stopPropagation();
    });
  });

  svg.querySelectorAll('.wp-node').forEach(function(g) {
    var id = g.dataset.id;
    g.addEventListener('mouseenter', function() {
      hoveredNode = id;
      if (mode === 'view' || mode === 'edge') showInfo(id, adj, nodeSet);
      render();
    });
    g.addEventListener('mouseleave', function() { hoveredNode = null; render(); });
    g.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (mode === 'move') {
        var sv = svgCoords(e.clientX, e.clientY);
        draggingNode = id;
        dnSX = sv.x; dnSY = sv.y;
        dnOX = positions[id].x; dnOY = positions[id].y;
      } else if (mode === 'edge') {
        handleEdgeClick(id);
      }
    });
    g.addEventListener('click', function(e) {
      if (mode === 'view') showInfo(id, adj, nodeSet);
      e.stopPropagation();
    });
  });
}

// ── Node info panel ───────────────────────────────────────────────────────────
function showInfo(id, adj, nodeSet) {
  var w = wpById[id], p = positions[id];
  if (!w) return;
  var nbs = (adj[id] || []).filter(function(nb) { return nodeSet[nb]; });
  var xyRow = (p && p.x)
    ? '<div class="val" data-xy style="font-family:monospace;font-size:11px">x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1) + '</div>'
    : '<div class="val" style="color:#A32D2D">x/y not set</div>';

  var rows = nbs.map(function(nb) {
    var nw = wpById[nb];
    return '<div class="conn-row">' +
      '<span><span style="color:#888780;font-size:10px">' + (nw ? nw.type : '?') + '</span> ' + (nw ? nw.label || nb : nb) + '</span>' +
      '<button class="xb" onclick="delEdge(\'' + id + '\',\'' + nb + '\')">x</button>' +
      '</div>';
  }).join('');

  document.getElementById('node-info').innerHTML =
    '<h3>Node info</h3>' +
    '<div class="lbl">Label</div><div class="val">' + (w.label || '') + '</div>' +
    '<div class="lbl">ID</div><div class="val" style="font-family:monospace;font-size:10px">' + id + '</div>' +
    '<div class="lbl">Position</div>' + xyRow +
    '<div style="margin-bottom:6px">' +
    '<span class="badge ' + (nbs.length ? 'bg' : 'br') + '">' + nbs.length + ' connections</span>' +
    '<span class="badge bb">' + (w.type || '?') + '</span>' +
    '<button class="badge br" style="cursor:pointer;border:none;font-size:10px" onclick="deleteWaypoint(\'' + id + '\')">delete</button>' +
    '</div>' +
    '<div class="lbl">Connections</div>' +
    '<div>' + (rows || '<div style="color:#888780;font-size:11px">none on this floor</div>') + '</div>';
}

function delEdge(from, to) {
  removeEdge(from, to);
  markDirty();
  showInfo(from, buildAdj(), (function() { var s = {}; floorNodeIds().forEach(function(id) { s[id] = true; }); return s; })());
  render();
}

function deleteWaypoint(id) {
  if (!confirm('Delete waypoint ' + id + ' and all its edges?')) return;
  allWps = allWps.filter(function(w) { return w.id !== id; });
  delete wpById[id];
  allEdges = allEdges.filter(function(e) { return e.from !== id && e.to !== id; });
  markDirty();
  document.getElementById('node-info').innerHTML = '<h3>Node info</h3><div style="color:#888780;font-size:11px">Deleted.</div>';
  render();
}

// ── Edge mode ─────────────────────────────────────────────────────────────────
function handleEdgeClick(id) {
  if (!edgePendFrom) {
    edgePendFrom = id;
    document.getElementById('pending-box').style.display = 'block';
    render();
    return;
  }
  if (edgePendFrom === id) {
    edgePendFrom = null;
    document.getElementById('pending-box').style.display = 'none';
    render();
    return;
  }
  var from = edgePendFrom, to = id;
  if (edgeExists(from, to)) {
    if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) { removeEdge(from, to); }
  } else {
    allEdges.push({ from: from, to: to, accessible: true });
  }
  edgePendFrom = null;
  document.getElementById('pending-box').style.display = 'none';
  markDirty();
  render();
}

// ── Add waypoint ──────────────────────────────────────────────────────────────
function openModal() {
  if (!currentKey) { alert('Select a floor first.'); return; }
  var parts = currentKey.split('__');
  document.getElementById('m-building').value = parts[0];
  document.getElementById('m-floor').value    = parts[1];
  document.getElementById('m-id').value    = '';
  document.getElementById('m-label').value = '';
  document.getElementById('m-type').value  = 'classroom';
  document.getElementById('modal-coords').textContent = pendingPos
    ? 'Position: x=' + pendingPos.x.toFixed(1) + ', y=' + pendingPos.y.toFixed(1)
    : 'Click on the map to set position, or it will be placed at center.';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(function() { document.getElementById('m-id').focus(); }, 50);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  pendingPos = null;
}

function confirmAdd() {
  var id       = document.getElementById('m-id').value.trim().replace(/\s+/g, '_');
  var label    = document.getElementById('m-label').value.trim();
  var type     = document.getElementById('m-type').value;
  var building = document.getElementById('m-building').value;
  var floor    = document.getElementById('m-floor').value;
  if (!id || !label) { alert('ID and Label are required.'); return; }
  if (wpById[id]) { alert('A waypoint with ID "' + id + '" already exists.'); return; }
  var pos = pendingPos || { x: 500, y: 500 };
  var wp  = { id: id, building: building, floor: floor, label: label, type: type, x: pos.x, y: pos.y };
  allWps.push(wp);
  wpById[id] = wp;
  positions[id] = { x: pos.x, y: pos.y };
  closeModal();
  markDirty();
  render();
  var adj = buildAdj();
  var ns  = {}; floorNodeIds().forEach(function(i) { ns[i] = true; });
  showInfo(id, adj, ns);
}

// ── Mode switching ────────────────────────────────────────────────────────────
var hints = {
  view: 'Hover or click a node to inspect \u00b7 click any edge line to delete it',
  move: 'Drag nodes to reposition \u00b7 scroll to zoom \u00b7 changes save on mouse release',
  edge: 'Click a node then click another to add/remove the edge \u00b7 click an edge line to delete it',
  add:  'Click anywhere on the floorplan to place a new waypoint'
};

function setMode(m) {
  mode = m;
  if (edgePendFrom) { edgePendFrom = null; document.getElementById('pending-box').style.display = 'none'; }
  ['view', 'move', 'edge', 'add'].forEach(function(x) {
    document.getElementById('btn-mode-' + x).classList.toggle('active', x === m);
  });
  document.getElementById('mode-hint').textContent = hints[m];
  if (m === 'add') openModal();
  render();
}

// ── Floor switching ───────────────────────────────────────────────────────────
function showFloor(key) {
  currentKey   = key;
  edgePendFrom = null;
  hoveredNode  = null;
  pendingPos   = null;
  document.getElementById('pending-box').style.display = 'none';
  var existing = document.getElementById('main-svg');
  if (existing) existing.remove();
  document.querySelectorAll('.floor-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.key === key);
  });
  document.getElementById('node-info').innerHTML =
    '<h3>Node info</h3><div style="color:#888780;font-size:11px">Hover or click a node</div>';
  resetZoom();
  render();
}

// ── Dirty / save ──────────────────────────────────────────────────────────────
function markDirty() {
  dirty = true;
  document.getElementById('changes-lbl').style.display = 'inline';
  document.getElementById('save-btn').classList.add('dirty');
  document.getElementById('save-btn').textContent = 'Save changes';
}

function saveData() {
  var updatedWps = allWps.map(function(w) {
    var p = positions[w.id];
    return p ? Object.assign({}, w, { x: p.x, y: p.y }) : Object.assign({}, w);
  });
  var out = Object.assign({}, FULL_CAMPUS, { waypoints: updatedWps, edges: allEdges });
  var blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'campusData.json';
  a.click();
  dirty = false;
  document.getElementById('changes-lbl').style.display = 'none';
  document.getElementById('save-btn').classList.remove('dirty');
  document.getElementById('save-btn').textContent = 'Download campusData.json';
}

// editorRuntime.js — browser-side editor logic

var allWps   = FULL_CAMPUS.waypoints.map(function(w) { return Object.assign({}, w); });
var allEdges = FULL_CAMPUS.edges.map(function(e)     { return Object.assign({}, e); });
var allRooms = (FULL_CAMPUS.rooms || []).map(function(r) { return Object.assign({}, r); });
var allQrAnchors = (FULL_CAMPUS.qrAnchors || []).map(function(q) { return Object.assign({}, q); });

FULL_CAMPUS.waypoints = allWps;
FULL_CAMPUS.edges = allEdges;
FULL_CAMPUS.rooms = allRooms;
FULL_CAMPUS.qrAnchors = allQrAnchors;

var wpById = {};
allWps.forEach(function(w) { wpById[w.id] = w; });

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
var rafPending = false;

// ── Cached graph state — only recomputed when edges/waypoints change ──────────
var _adj = null, _dcSet = null, _hasVertical = null, _nodeSet = null;

function invalidateCache() { _adj = null; _dcSet = null; _hasVertical = null; _nodeSet = null; }

function getAdj() {
  if (_adj) return _adj;
  _adj = {};
  allWps.forEach(function(w) { _adj[w.id] = []; });
  allEdges.forEach(function(e) {
    if (wpById[e.from] && wpById[e.to]) {
      _adj[e.from].push(e.to);
      _adj[e.to].push(e.from);
    }
  });
  return _adj;
}

function getNodeSet() {
  if (_nodeSet) return _nodeSet;
  _nodeSet = {};
  floorNodeIds().forEach(function(id) { _nodeSet[id] = true; });
  return _nodeSet;
}

function getHasVertical() {
  if (_hasVertical) return _hasVertical;
  var nodeSet = getNodeSet();
  _hasVertical = {};
  Object.keys(nodeSet).forEach(function(id) {
    var wp = wpById[id];
    if (!wp) return;
    var cross = allEdges.some(function(e) {
      if (e.from !== id && e.to !== id) return false;
      var nb = e.from === id ? e.to : e.from;
      var nbWp = wpById[nb];
      return nbWp && nbWp.building === wp.building && String(nbWp.floor) !== String(wp.floor);
    });
    if (cross) _hasVertical[id] = true;
  });
  return _hasVertical;
}

function getDcSet() {
  if (_dcSet) return _dcSet;
  var adj = getAdj(), nodeSet = getNodeSet(), hasVertical = getHasVertical();
  var nodeIds = Object.keys(nodeSet);
  var seeds = [];
  for (var i = 0; i < nodeIds.length; i++) {
    var id = nodeIds[i];
    if ((adj[id] || []).some(function(nb) { return nodeSet[nb]; })) { seeds.push(id); break; }
  }
  nodeIds.forEach(function(id) { if (hasVertical[id] && seeds.indexOf(id) === -1) seeds.push(id); });
  var reachable = {};
  seeds.forEach(function(seed) {
    var vis = bfs(seed, nodeSet, adj);
    Object.keys(vis).forEach(function(id) { reachable[id] = true; });
  });
  _dcSet = {};
  nodeIds.forEach(function(id) { if (!reachable[id]) _dcSet[id] = true; });
  return _dcSet;
}

// ── Legend ────────────────────────────────────────────────────────────────────
var legEl = document.getElementById('legend');
Object.keys(TYPE_COLOR).forEach(function(type) {
  var r = document.createElement('div');
  r.className = 'leg-row';
  r.innerHTML = '<div class="leg-dot" style="background:' + TYPE_COLOR[type] + '"></div>' + type;
  legEl.appendChild(r);
});
[
  '<div class="leg-dot" style="background:#fff;border:2px solid #E24B4A"></div>disconnected',
  '<div class="leg-dot" style="background:#185FA5;border:2.5px solid #F5A623"></div>entrance \u2014 missing lat/long',
  '<svg width="12" height="12" style="flex-shrink:0"><circle cx="6" cy="6" r="5" fill="#854F0B" stroke="#854F0B" stroke-width="2" stroke-dasharray="3,2"/></svg><span style="font-size:11px">vertically connected</span>'
].forEach(function(html) {
  var d = document.createElement('div'); d.className = 'leg-row'; d.innerHTML = html; legEl.appendChild(d);
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function typeColor(t) { return TYPE_COLOR[String(t || '').toLowerCase()] || '#888780'; }

function buildAdj() { return getAdj(); }

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

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBuildingObj(building) {
  var buildings = FULL_CAMPUS.buildings;
  if (!Array.isArray(buildings)) return null;
  for (var i = 0; i < buildings.length; i++) {
    if (buildings[i].id === building || buildings[i].name === building) return buildings[i];
  }
  return null;
}

function syncEntranceArrays() {
  var buildings = FULL_CAMPUS.buildings;
  if (!Array.isArray(buildings)) return;
  var byBuilding = {};
  allWps.forEach(function(w) {
    if (w.type !== 'entrance') return;
    if (!byBuilding[w.building]) byBuilding[w.building] = [];
    if (byBuilding[w.building].indexOf(w.id) === -1) byBuilding[w.building].push(w.id);
  });
  buildings.forEach(function(b) {
    b.entrances = byBuilding[b.id] ? byBuilding[b.id].slice() : [];
  });
}

function getRoomsForWaypoint(id) {
  return allRooms.filter(function(r) { return r.waypoint_id === id; });
}

function waypointNeedsQr(w) {
  if (!w) return false;
  if (w.qr_code) return true;
  return w.type === 'stairs' || w.type === 'elevator';
}

function makeQrId(id) {
  return 'QR_' + String(id || '')
    .replace(/^wp_/i, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function ensureQrForWaypoint(w) {
  if (!waypointNeedsQr(w)) return;
  if (!w.qr_code) w.qr_code = makeQrId(w.id);
  if (w.type === 'entrance') {
    if (w.requires_scan == null) w.requires_scan = true;
    if (w.stop_radius_m == null) w.stop_radius_m = 5;
  }
  var existing = null;
  for (var i = 0; i < allQrAnchors.length; i++) {
    if (allQrAnchors[i].waypoint_id === w.id || allQrAnchors[i].qr_id === w.qr_code) {
      existing = allQrAnchors[i];
      break;
    }
  }
  if (!existing) {
    existing = {};
    allQrAnchors.push(existing);
  }
  existing.qr_id = w.qr_code;
  existing.waypoint_id = w.id;
  existing.building = w.building;
  existing.floor = w.floor;
}

function syncQrAnchors() {
  var validIds = {};
  allWps.forEach(function(w) {
    validIds[w.id] = true;
    ensureQrForWaypoint(w);
  });
  var seen = {};
  allQrAnchors = allQrAnchors.filter(function(q) {
    if (!q || !q.waypoint_id || !validIds[q.waypoint_id]) return false;
    var wp = wpById[q.waypoint_id];
    if (!wp) return false;
    if (!waypointNeedsQr(wp)) return false;
    q.building = wp.building;
    q.floor = wp.floor;
    if (!q.qr_id && wp.qr_code) q.qr_id = wp.qr_code;
    var key = q.qr_id || q.waypoint_id;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  FULL_CAMPUS.qrAnchors = allQrAnchors;
}

function removeWaypointReferences(id) {
  allRooms = allRooms.filter(function(r) { return r.waypoint_id !== id; });
  allQrAnchors = allQrAnchors.filter(function(q) { return q.waypoint_id !== id; });
  FULL_CAMPUS.rooms = allRooms;
  FULL_CAMPUS.qrAnchors = allQrAnchors;
  delete positions[id];
  syncEntranceArrays();
}

function closest(el, sel) {
  while (el && el !== document) {
    if (el.matches ? el.matches(sel) : el.msMatchesSelector && el.msMatchesSelector(sel)) return el;
    el = el.parentNode;
  }
  return null;
}

// ── Zoom / pan ────────────────────────────────────────────────────────────────
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
    // Update x/y readout
    var p = positions[draggingNode];
    var xyEl = document.querySelector('#node-info .val[data-xy]');
    if (xyEl) xyEl.textContent = 'x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1);
    // Use RAF throttle — only update DOM once per animation frame
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(function() {
        rafPending = false;
        updateDraggedNode(draggingNode);
      });
    }
    return;
  }
  if (!panning) return;
  tx = panTX + (e.clientX - panSX); ty = panTY + (e.clientY - panSY); applyT();
});

window.addEventListener('mouseup', function() {
  if (draggingNode) {
    var p = positions[draggingNode];
    p.x = Math.round(p.x * 10) / 10;
    p.y = Math.round(p.y * 10) / 10;
    if (wpById[draggingNode]) { wpById[draggingNode].x = p.x; wpById[draggingNode].y = p.y; }
    markDirty();
    var id = draggingNode;
    draggingNode = null;
    var adj = getAdj(), ns = getNodeSet();
    showInfo(id, adj, ns);
    fullRender();
  }
  panning = false;
  wrap.classList.remove('grabbing');
});

// ── Fast drag update — only moves the dragged node and its edges ──────────────
function updateDraggedNode(id) {
  var svg = document.getElementById('main-svg');
  if (!svg || !id) return;
  var p = positions[id];
  if (!p) return;

  // Move the node circle and label
  var g = svg.querySelector('.wp-node[data-id="' + id + '"]');
  if (g) {
    var circle = g.querySelector('circle');
    var text   = g.querySelector('text');
    if (circle) { circle.setAttribute('cx', p.x.toFixed(1)); circle.setAttribute('cy', p.y.toFixed(1)); }
    if (text)   { text.setAttribute('x', p.x.toFixed(1)); text.setAttribute('y', (p.y + 3.5).toFixed(1)); }
  }

  // Move all edges touching this node
  svg.querySelectorAll('.e-line').forEach(function(line) {
    var isFrom = line.dataset.from === id;
    var isTo   = line.dataset.to   === id;
    if (!isFrom && !isTo) return;
    var otherKey = isFrom ? 'data-to' : 'data-from';
    var otherId  = line.getAttribute(otherKey);
    var other    = positions[otherId];
    if (!other) return;
    var x1 = isFrom ? p.x : other.x, y1 = isFrom ? p.y : other.y;
    var x2 = isFrom ? other.x : p.x, y2 = isFrom ? other.y : p.y;
    // Move the hit area line and the visual line (next sibling)
    line.setAttribute('x1', x1.toFixed(1)); line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1)); line.setAttribute('y2', y2.toFixed(1));
    var vis = line.nextElementSibling;
    if (vis) {
      vis.setAttribute('x1', x1.toFixed(1)); vis.setAttribute('y1', y1.toFixed(1));
      vis.setAttribute('x2', x2.toFixed(1)); vis.setAttribute('y2', y2.toFixed(1));
    }
  });
}

// ── Fast hover update — only changes visual state of affected nodes/edges ─────
function updateHover(newHovered) {
  var svg = document.getElementById('main-svg');
  if (!svg) return;
  var dcSet = getDcSet(), hasVertical = getHasVertical();

  // Nodes to visually update: previously hovered + newly hovered + pending
  var toUpdate = {};
  if (hoveredNode)  toUpdate[hoveredNode]  = true;
  if (newHovered)   toUpdate[newHovered]   = true;
  if (edgePendFrom) toUpdate[edgePendFrom] = true;

  // Update edges
  svg.querySelectorAll('.e-line').forEach(function(line) {
    var from = line.dataset.from, to = line.dataset.to;
    var hl = newHovered && (from === newHovered || to === newHovered);
    var pd = edgePendFrom && (from === edgePendFrom || to === edgePendFrom);
    var vis = line.nextElementSibling;
    if (vis) {
      vis.setAttribute('stroke', hl ? '#185FA5' : pd ? '#854F0B' : 'rgba(0,0,0,0.28)');
      vis.setAttribute('stroke-width', hl || pd ? 2.5 : 1.5);
    }
  });

  // Update node visuals
  Object.keys(toUpdate).forEach(function(id) {
    var g = svg.querySelector('.wp-node[data-id="' + id + '"]');
    if (!g) return;
    var wp    = wpById[id];
    var isDc  = !!dcSet[id];
    var isHl  = id === newHovered;
    var isPd  = id === edgePendFrom;
    var isVert = !!hasVertical[id];
    var isNoLatLng = wp && wp.type === 'entrance' &&
      !(Number.isFinite(Number(wp.latitude)) && Number(wp.latitude) !== 0 &&
        Number.isFinite(Number(wp.longitude)) && Number(wp.longitude) !== 0);

    var color  = typeColor(wp ? wp.type : '');
    var fill   = isDc ? '#fff' : color;
    var stroke = isDc ? '#E24B4A' : isNoLatLng ? '#F5A623' : isPd ? '#854F0B' : isHl ? '#fff' : color;
    var sw     = isDc || isNoLatLng || isPd ? 2.5 : isHl ? 2 : 1.5;
    var r      = isHl || isPd ? 10 : 8;
    var dash   = isVert && !isHl ? '3,2' : '';

    var circle = g.querySelector('circle');
    if (circle) {
      circle.setAttribute('fill', fill);
      circle.setAttribute('stroke', stroke);
      circle.setAttribute('stroke-width', sw);
      circle.setAttribute('r', r);
      if (dash) circle.setAttribute('stroke-dasharray', dash);
      else circle.removeAttribute('stroke-dasharray');
    }
  });

  hoveredNode = newHovered;
}

// ── Full render — only called when structure changes ──────────────────────────
function fullRender() {
  if (!currentKey) return;
  invalidateCache();

  var adj        = getAdj();
  var nodeSet    = getNodeSet();
  var nodeIds    = floorNodeIds();
  var dcSet      = getDcSet();
  var hasVertical = getHasVertical();
  var fEdges     = allEdges.filter(function(e) { return nodeSet[e.from] && nodeSet[e.to]; });

  // Stats
  document.getElementById('s-wps').textContent  = allWps.length;
  document.getElementById('s-edges').textContent = allEdges.length;
  var dcEl = document.getElementById('s-dc');
  var dcCount = Object.keys(dcSet).length;
  dcEl.textContent = dcCount;
  dcEl.style.color = dcCount ? '#A32D2D' : '#3B6D11';

  var svgParts = [];

  // Floorplan
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

  // Edges — invisible 12px hit area + visible line
  fEdges.forEach(function(e) {
    var a = positions[e.from], b = positions[e.to];
    if (!a || !b) return;
    var hl = hoveredNode && (e.from === hoveredNode || e.to === hoveredNode);
    var pd = edgePendFrom && (e.from === edgePendFrom || e.to === edgePendFrom);
    var coords = ' x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"';
    svgParts.push(
      '<line class="e-line" data-from="' + e.from + '" data-to="' + e.to + '"' + coords +
      ' stroke="transparent" stroke-width="12" pointer-events="stroke" style="cursor:pointer"/>' +
      '<line' + coords +
      ' stroke="' + (hl ? '#185FA5' : pd ? '#854F0B' : 'rgba(0,0,0,0.28)') + '"' +
      ' stroke-width="' + (hl || pd ? 2.5 : 1.5) + '" pointer-events="none"/>'
    );
  });

  // Nodes
  nodeIds.forEach(function(id) {
    var wp = wpById[id], p = positions[id];
    if (!wp || !p) return;
    var isDc  = !!dcSet[id];
    var isHl  = hoveredNode === id;
    var isPd  = edgePendFrom === id;
    var isVert = !!hasVertical[id];
    var isNoLatLng = wp.type === 'entrance' &&
      !(Number.isFinite(Number(wp.latitude)) && Number(wp.latitude) !== 0 &&
        Number.isFinite(Number(wp.longitude)) && Number(wp.longitude) !== 0);
    var color  = typeColor(wp.type);
    var fill   = isDc ? '#fff' : color;
    var stroke = isDc ? '#E24B4A' : isNoLatLng ? '#F5A623' : isPd ? '#854F0B' : isHl ? '#fff' : color;
    var sw     = isDc || isNoLatLng || isPd ? 2.5 : isHl ? 2 : 1.5;
    var r      = isHl || isPd ? 10 : 8;
    var dash   = isVert && !isHl ? ' stroke-dasharray="3,2"' : '';
    var m      = (wp.label || '').match(/\d{3,}/);
    var sl     = m ? m[0] : (wp.type || '?').slice(0, 2).toUpperCase();
    svgParts.push(
      '<g class="wp-node" data-id="' + id + '" pointer-events="all" style="cursor:pointer">' +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '"' +
      ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + ' opacity="0.93"/>' +
      '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 3.5).toFixed(1) + '"' +
      ' text-anchor="middle" font-size="7" font-weight="500" font-family="system-ui,sans-serif"' +
      ' fill="' + (isDc ? '#E24B4A' : '#fff') + '" pointer-events="none">' + sl + '</text></g>'
    );
  });

  var svg = document.getElementById('main-svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'main-svg';
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '1000');
    svg.style.display = 'block';
    svg._listenersBound = false;
    zroot.innerHTML = '';
    zroot.appendChild(svg);
  }
  svg.innerHTML = svgParts.join('');

  // Canvas click for add mode
  svg.onclick = function(e) {
    if (mode !== 'add') return;
    var target = e.target || e.srcElement;
    if (target && closest(target, '.wp-node')) return;
    var sv = svgCoords(e.clientX, e.clientY);
    pendingPos = { x: Math.round(sv.x * 10) / 10, y: Math.round(sv.y * 10) / 10 };
    document.getElementById('modal-coords').textContent =
      'Position: x=' + pendingPos.x.toFixed(1) + ', y=' + pendingPos.y.toFixed(1);
    document.getElementById('modal-overlay').classList.add('open');
    e.stopPropagation();
  };

  // Only bind event listeners once per SVG element — prevents stacking
  // across fullRender() calls which reuse the same svg element via innerHTML
  if (!svg._listenersBound) {
    svg._listenersBound = true;
    bindEvents(svg);
  }
}

// Alias for backward compat — full render when called without hot-path context
function render() { fullRender(); }

// ── Bind SVG events ───────────────────────────────────────────────────────────
function bindEvents(svg) {
  svg.addEventListener('click', function(e) {
    if (e.target.classList && e.target.classList.contains('e-line')) {
      if (mode === 'move') return;
      var from = e.target.dataset.from, to = e.target.dataset.to;
      if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) {
        removeEdge(from, to); invalidateCache(); markDirty(); fullRender();
      }
      e.stopPropagation(); return;
    }
    var g = closest(e.target, '.wp-node');
    if (g) {
      var id = g.getAttribute('data-id');
      if (mode === 'view') showInfo(id, getAdj(), getNodeSet());
      if (mode === 'edge') handleEdgeClick(id);
      e.stopPropagation();
    }
  });

  svg.addEventListener('mouseover', function(e) {
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    var id = g.getAttribute('data-id');
    if (hoveredNode === id) return;
    updateHover(id);
    // Don't overwrite info panel while waiting for second edge click
    if ((mode === 'view' || mode === 'edge') && !edgePendFrom) {
      showInfo(id, getAdj(), getNodeSet());
    }
  });

  svg.addEventListener('mouseout', function(e) {
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    var rel = e.relatedTarget;
    if (rel && closest(rel, '.wp-node') === g) return;
    updateHover(null);
  });

  svg.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    var id = g.getAttribute('data-id');
    e.stopPropagation();
    if (mode === 'move') {
      var sv = svgCoords(e.clientX, e.clientY);
      draggingNode = id; dnSX = sv.x; dnSY = sv.y;
      dnOX = positions[id].x; dnOY = positions[id].y;
    }
  });
}

// ── Node info panel ───────────────────────────────────────────────────────────
function showInfo(id, adj, nodeSet) {
  var w = wpById[id], p = positions[id];
  if (!w) return;
  var nbs = (adj[id] || []).filter(function(nb) { return nodeSet[nb]; });

  var xyRow = (p && p.x)
    ? '<div class="val" data-xy style="font-family:monospace;font-size:11px">x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1) + '</div>'
    : '<div class="val" style="color:#A32D2D">x/y not set \u2014 drag in Move mode</div>';

  var latLngSection = '';
  if (w.type === 'entrance') {
    var hasLL = Number.isFinite(Number(w.latitude)) && Number(w.latitude) !== 0 &&
                Number.isFinite(Number(w.longitude)) && Number(w.longitude) !== 0;
    var latVal = hasLL ? Number(w.latitude).toFixed(7)  : '';
    var lngVal = hasLL ? Number(w.longitude).toFixed(7) : '';
    var llStatus = hasLL
      ? '<div style=\"font-size:11px;color:#3B6D11;margin-bottom:4px\">\u2713 Lat/long is set</div>'
      : '<div style=\"padding:4px 8px;background:#FFF3E0;border:.5px solid #F5A623;border-radius:5px;font-size:11px;color:#854F0B;margin-bottom:4px\">\u26A0 Missing lat/long \u2014 outdoor routing will not work.</div>';
    latLngSection =
      '<div class=\"lbl\" style=\"margin-top:8px\">Lat / Long</div>' +
      llStatus +
      '<div style=\"display:flex;gap:4px;margin-bottom:2px\">' +
        '<input id=\"edit-lat\" placeholder=\"latitude\" style=\"flex:1;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:11px;font-family:monospace\" value=\"' + latVal + '\"/>' +
        '<input id=\"edit-lng\" placeholder=\"longitude\" style=\"flex:1;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:11px;font-family:monospace\" value=\"' + lngVal + '\"/>' +
      '</div>' +
      '<button onclick=\"applyLatLng(\'' + id + '\')\" style=\"width:100%;padding:4px;background:#3B6D11;color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer;margin-bottom:6px\">Save Lat/Long</button>';
  }

  var typeOptions = Object.keys(TYPE_COLOR).map(function(t) {
    return '<option value="' + t + '"' + (w.type === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  var rows = nbs.map(function(nb) {
    var nw = wpById[nb];
    return '<div class="conn-row"><span><span style="color:#888780;font-size:10px">' + (nw ? nw.type : '?') + '</span> ' +
      (nw ? nw.label || nb : nb) + '</span>' +
      '<button class="xb" onclick="delEdge(\'' + id + '\',\'' + nb + '\')">x</button></div>';
  }).join('');

  var verticalPanel = '';
  if (w.type === 'stairs' || w.type === 'elevator') {
    var sameType = allWps.filter(function(o) {
      return o.id !== id && o.building === w.building && o.type === w.type && String(o.floor) !== String(w.floor);
    });
    var connSet = {};
    allEdges.filter(function(e) { return e.from === id || e.to === id; })
      .map(function(e) { return e.from === id ? e.to : e.from; })
      .filter(function(nb) { var nw = wpById[nb]; return nw && String(nw.floor) !== String(w.floor); })
      .forEach(function(nb) { connSet[nb] = true; });
    var vRows = sameType.map(function(o) {
      var conn = !!connSet[o.id];
      var dir = (o.floor === 'ground' && w.floor !== 'ground') ? '\u2193'
              : (w.floor === 'ground' && o.floor !== 'ground') ? '\u2191'
              : (Number(o.floor) > Number(w.floor)) ? '\u2191' : '\u2193';
      return '<div class="conn-row"><span>' + dir + ' floor ' + o.floor +
        ' <span style="color:#888780;font-size:10px">' + o.id + '</span></span>' +
        (conn
          ? '<button class="xb" onclick="toggleVertical(\'' + id + '\',\'' + o.id + '\',false)">disconnect</button>'
          : '<button style="font-size:10px;padding:1px 5px;border:.5px solid #b6d4a8;border-radius:3px;background:#EAF3DE;color:#27500A;cursor:pointer" onclick="toggleVertical(\'' + id + '\',\'' + o.id + '\',true)">connect</button>') + '</div>';
    }).join('');
    verticalPanel = '<div style="margin-top:10px"><div class="lbl" style="display:flex;justify-content:space-between"><span>Vertical connections</span><span style="color:#185FA5;font-size:10px">' + w.type + '</span></div>' +
      (vRows || '<div style="font-size:11px;color:#888780;margin-top:4px">No other ' + w.type + ' in ' + w.building + '</div>') + '</div>';
  }

  var roomRecords = getRoomsForWaypoint(id);
  var room = roomRecords[0] || null;
  var roomPanel =
    '<div style="margin-top:10px;padding-top:8px;border-top:.5px solid #f1efe8">' +
      '<div class="lbl" style="display:flex;justify-content:space-between"><span>Search room record</span><span style="color:#888780;font-size:10px">' + roomRecords.length + '</span></div>' +
      '<input id="edit-room-number" placeholder="Room number or keyword" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:4px" value="' + escHtml(room ? room.room_number : '') + '"/>' +
      '<input id="edit-room-name" placeholder="Display name" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:4px" value="' + escHtml(room ? room.room_name : '') + '"/>' +
      '<input id="edit-room-type" placeholder="Search type" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:5px" value="' + escHtml(room ? room.type : w.type) + '"/>' +
      '<button onclick="applyRoomEdit(\'' + id + '\')" style="width:100%;padding:4px;background:#185FA5;color:#fff;border:none;border-radius:5px;font-size:11px;cursor:pointer;margin-bottom:4px">' + (room ? 'Save room record' : 'Create room record') + '</button>' +
      (roomRecords.length
        ? '<button onclick="deleteRoomRecord(\'' + id + '\')" style="width:100%;padding:4px;background:#FCEBEB;color:#791F1F;border:none;border-radius:5px;font-size:11px;cursor:pointer">Remove room record(s)</button>'
        : '<div style="font-size:10px;color:#888780">Used by destination search.</div>') +
    '</div>';

  document.getElementById('node-info').innerHTML =
    '<h3>Node info</h3>' +
    '<div class="lbl">Label</div><input id="edit-label" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:6px" value="' + escHtml(w.label || '') + '"/>' +
    '<div class="lbl">ID</div><input id="edit-id" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:monospace;margin-bottom:2px" value="' + escHtml(id) + '"/>' +
    '<div style="font-size:10px;color:#888780;margin-bottom:6px">Renaming updates edges, rooms, entrances and QR anchors.</div>' +
    '<div class="lbl">Type</div><select id="edit-type" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:6px">' + typeOptions + '</select>' +
    '<div class="lbl">QR code</div><input id="edit-qr-code" placeholder="QR_SUTH_F1_106" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:monospace;margin-bottom:6px" value="' + escHtml(w.qr_code || '') + '"/>' +
    '<button onclick="applyWaypointEdit(\'' + id + '\')" style="width:100%;padding:5px;background:#185FA5;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin-bottom:8px">Apply changes</button>' +
    '<div class="lbl">Position</div>' + xyRow + latLngSection +
    '<div style="margin-bottom:6px;margin-top:4px"><span class="badge ' + (nbs.length ? 'bg' : 'br') + '">' + nbs.length + ' connections</span> <button class="badge br" style="cursor:pointer;border:none;font-size:10px" onclick="deleteWaypoint(\'' + id + '\')">delete</button></div>' +
    '<div class="lbl">Connections</div><div>' + (rows || '<div style="color:#888780;font-size:11px">none on this floor</div>') + '</div>' + verticalPanel + roomPanel;
}

// ── Edit / rename ─────────────────────────────────────────────────────────────
function applyLatLng(id) {
  var w = wpById[id];
  if (!w) return;
  var latInput = document.getElementById('edit-lat');
  var lngInput = document.getElementById('edit-lng');
  if (!latInput || !lngInput) return;
  var lat = parseFloat(latInput.value.trim());
  var lng = parseFloat(lngInput.value.trim());
  if (!Number.isFinite(lat) || lat < -90 || lat > 90)  { alert('Invalid latitude (must be -90 to 90).');   return; }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) { alert('Invalid longitude (must be -180 to 180).'); return; }
  w.latitude  = lat;
  w.longitude = lng;
  // Also update approach coords on the building entrance record if present
  if (Array.isArray(FULL_CAMPUS.buildings)) {
    FULL_CAMPUS.buildings.forEach(function(b) {
      if (!Array.isArray(b.entrances)) return;
      b.entrances.forEach(function(entId) {
        if (entId === id) {
          b.latitude  = b.latitude  || lat;
          b.longitude = b.longitude || lng;
        }
      });
    });
  }
  invalidateCache(); markDirty();
  showInfo(id, getAdj(), getNodeSet());
  alert('\u2713 Lat/long saved: ' + lat.toFixed(7) + ', ' + lng.toFixed(7));
}

function applyRoomEdit(id) {
  var w = wpById[id];
  if (!w) return;
  var numberEl = document.getElementById('edit-room-number');
  var nameEl = document.getElementById('edit-room-name');
  var typeEl = document.getElementById('edit-room-type');
  var roomNumber = numberEl ? numberEl.value.trim() : '';
  var roomName = nameEl ? nameEl.value.trim() : '';
  var roomType = typeEl ? typeEl.value.trim() : '';
  if (!roomNumber && !roomName) {
    alert('Add a room number, keyword, or display name first.');
    return;
  }
  var records = getRoomsForWaypoint(id);
  var room = records[0];
  if (!room) {
    room = {};
    allRooms.push(room);
  }
  room.building = w.building;
  room.room_number = roomNumber || roomName || w.label || id;
  room.floor = w.floor;
  room.waypoint_id = id;
  room.room_name = roomName || w.label || room.room_number;
  room.type = roomType || w.type || 'room';
  FULL_CAMPUS.rooms = allRooms;
  ensureQrForWaypoint(w);
  syncQrAnchors();
  invalidateCache(); markDirty();
  showInfo(id, getAdj(), getNodeSet());
}

function deleteRoomRecord(id) {
  if (!confirm('Remove all room/search records for ' + id + '?')) return;
  allRooms = allRooms.filter(function(r) { return r.waypoint_id !== id; });
  FULL_CAMPUS.rooms = allRooms;
  syncQrAnchors();
  invalidateCache(); markDirty();
  showInfo(id, getAdj(), getNodeSet());
}

function applyWaypointEdit(oldId) {
  var w = wpById[oldId];
  if (!w) return;
  var newLabel = (document.getElementById('edit-label').value || '').trim();
  var newType  = document.getElementById('edit-type').value;
  var newId    = (document.getElementById('edit-id').value || '').trim().replace(/\s+/g, '_');
  var nextQrCode = (document.getElementById('edit-qr-code').value || '').trim();
  if (!newLabel) { alert('Label cannot be empty.'); return; }
  if (!newId)    { alert('ID cannot be empty.');    return; }
  if (newId !== oldId) {
    if (wpById[newId]) { alert('ID "' + newId + '" already exists.'); return; }
    renameWaypointId(oldId, newId); w = wpById[newId];
  }
  var oldType = w.type; w.label = newLabel; w.type = newType;
  if (nextQrCode) w.qr_code = nextQrCode;
  else if (newType === 'stairs' || newType === 'elevator') w.qr_code = makeQrId(newId);
  else delete w.qr_code;
  if (oldType !== newType) syncEntranceArrays();
  ensureQrForWaypoint(w);
  syncQrAnchors();
  invalidateCache(); markDirty();
  showInfo(newId, getAdj(), getNodeSet()); fullRender();
}

function renameWaypointId(oldId, newId) {
  var w = wpById[oldId]; if (!w) return;
  w.id = newId; wpById[newId] = w; delete wpById[oldId];
  allWps.forEach(function(wp) { if (wp.id === oldId) wp.id = newId; });
  allEdges.forEach(function(e) {
    if (e.from === oldId) e.from = newId;
    if (e.to   === oldId) e.to   = newId;
  });
  if (positions[oldId] !== undefined) { positions[newId] = positions[oldId]; delete positions[oldId]; }
  if (Array.isArray(FULL_CAMPUS.buildings)) {
    FULL_CAMPUS.buildings.forEach(function(b) {
      if (!Array.isArray(b.entrances)) return;
      var idx = b.entrances.indexOf(oldId);
      if (idx !== -1) b.entrances[idx] = newId;
    });
  }
  allRooms.forEach(function(r) { if (r.waypoint_id === oldId) r.waypoint_id = newId; });
  allQrAnchors.forEach(function(q) { if (q.waypoint_id === oldId) q.waypoint_id = newId; });
  FULL_CAMPUS.rooms = allRooms;
  FULL_CAMPUS.qrAnchors = allQrAnchors;
  syncEntranceArrays();
  syncQrAnchors();
}

function delEdge(from, to) {
  removeEdge(from, to); invalidateCache(); markDirty();
  showInfo(from, getAdj(), getNodeSet()); fullRender();
}

function toggleVertical(idA, idB, connect) {
  if (connect) {
    if (!edgeExists(idA, idB)) allEdges.push({ from: idA, to: idB, accessible: true });
  } else {
    if (!confirm('Remove vertical connection between ' + idA + ' and ' + idB + '?')) return;
    removeEdge(idA, idB);
  }
  invalidateCache(); markDirty();
  showInfo(idA, getAdj(), getNodeSet()); fullRender();
}

function deleteWaypoint(id) {
  var roomCount = getRoomsForWaypoint(id).length;
  var qrCount = allQrAnchors.filter(function(q) { return q.waypoint_id === id; }).length;
  var extra = [];
  if (roomCount) extra.push(roomCount + ' room/search record(s)');
  if (qrCount) extra.push(qrCount + ' QR anchor(s)');
  if (!confirm('Delete waypoint ' + id + ', all its edges' + (extra.length ? ', and ' + extra.join(' + ') : '') + '?')) return;
  allWps = allWps.filter(function(w) { return w.id !== id; });
  delete wpById[id];
  allEdges = allEdges.filter(function(e) { return e.from !== id && e.to !== id; });
  removeWaypointReferences(id);
  invalidateCache(); markDirty();
  document.getElementById('node-info').innerHTML = '<h3>Node info</h3><div style="color:#888780;font-size:11px">Deleted.</div>';
  fullRender();
}

function handleEdgeClick(id) {
  if (!edgePendFrom) {
    edgePendFrom = id;
    document.getElementById('pending-box').style.display = 'block';
    // fullRender so the orange ring appears on the selected node
    fullRender();
    return;
  }
  if (edgePendFrom === id) {
    // Cancel — clicked same node again
    edgePendFrom = null;
    document.getElementById('pending-box').style.display = 'none';
    fullRender();
    return;
  }
  var from = edgePendFrom, to = id;
  if (edgeExists(from, to)) {
    if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) removeEdge(from, to);
  } else {
    allEdges.push({ from: from, to: to, accessible: true });
  }
  edgePendFrom = null;
  document.getElementById('pending-box').style.display = 'none';
  invalidateCache(); markDirty(); fullRender();
}

function openModal() {
  if (!currentKey) { alert('Select a floor first.'); return; }
  var parts = currentKey.split('__');
  document.getElementById('m-building').value = parts[0];
  document.getElementById('m-floor').value    = parts[1];
  document.getElementById('m-id').value = ''; document.getElementById('m-label').value = '';
  document.getElementById('m-qr-code').value = '';
  document.getElementById('m-room-number').value = '';
  document.getElementById('m-room-name').value = '';
  document.getElementById('m-type').value = 'classroom';
  document.getElementById('modal-coords').textContent = pendingPos
    ? 'Position: x=' + pendingPos.x.toFixed(1) + ', y=' + pendingPos.y.toFixed(1)
    : 'Click on the map to set position, or placed at center.';
  document.getElementById('modal-overlay').classList.add('open');
  setTimeout(function() { document.getElementById('m-id').focus(); }, 50);
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); pendingPos = null; }

function confirmAdd() {
  var id = document.getElementById('m-id').value.trim().replace(/\s+/g, '_');
  var label = document.getElementById('m-label').value.trim();
  var type = document.getElementById('m-type').value;
  var building = document.getElementById('m-building').value;
  var floor = document.getElementById('m-floor').value;
  var qrCode = document.getElementById('m-qr-code').value.trim();
  var roomNumber = document.getElementById('m-room-number').value.trim();
  var roomName = document.getElementById('m-room-name').value.trim();
  if (!id || !label) { alert('ID and Label are required.'); return; }
  if (wpById[id]) { alert('ID "' + id + '" already exists.'); return; }
  var pos = pendingPos || { x: 500, y: 500 };
  var wp = { id: id, building: building, floor: floor, label: label, type: type, x: pos.x, y: pos.y };
  if (qrCode) wp.qr_code = qrCode;
  else if (type === 'stairs' || type === 'elevator') wp.qr_code = makeQrId(id);
  allWps.push(wp); wpById[id] = wp; positions[id] = { x: pos.x, y: pos.y };
  if (roomNumber || roomName) {
    allRooms.push({
      building: building,
      room_number: roomNumber || roomName,
      floor: floor,
      waypoint_id: id,
      room_name: roomName || label,
      type: type
    });
    FULL_CAMPUS.rooms = allRooms;
  }
  syncEntranceArrays();
  ensureQrForWaypoint(wp);
  syncQrAnchors();
  closeModal(); invalidateCache(); markDirty(); fullRender();
  showInfo(id, getAdj(), getNodeSet());
}

// ── Mode / floor ──────────────────────────────────────────────────────────────
['move','edge','add'].forEach(function(m) {
  var btn = document.getElementById('btn-mode-' + m);
  btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed';
});
document.getElementById('mode-hint').textContent = 'Select a floor above to begin';

var hints = {
  view: 'Hover or click a node to inspect \u00b7 click any edge to delete it',
  move: 'Drag nodes to reposition \u00b7 scroll to zoom',
  edge: 'Click a node then another to add/remove edge \u00b7 click an edge to delete it',
  add:  'Click anywhere on the floorplan to place a new waypoint'
};

function setMode(m) {
  mode = m;
  if (edgePendFrom) { edgePendFrom = null; document.getElementById('pending-box').style.display = 'none'; }
  ['view','move','edge','add'].forEach(function(x) {
    document.getElementById('btn-mode-' + x).classList.toggle('active', x === m);
  });
  document.getElementById('mode-hint').textContent = hints[m];
  if (m === 'add') openModal();
}

function showFloor(key) {
  currentKey = key; edgePendFrom = null; hoveredNode = null; pendingPos = null;
  invalidateCache();
  document.getElementById('pending-box').style.display = 'none';
  var existing = document.getElementById('main-svg');
  if (existing) existing.remove();
  document.querySelectorAll('.floor-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.key === key);
  });
  ['move','edge','add'].forEach(function(m) {
    var btn = document.getElementById('btn-mode-' + m);
    btn.disabled = false; btn.style.opacity = ''; btn.style.cursor = '';
  });
  document.getElementById('node-info').innerHTML =
    '<h3>Node info</h3><div style="color:#888780;font-size:11px">Hover or click a node</div>';
  resetZoom(); fullRender();
}

function markDirty() {
  dirty = true;
  document.getElementById('changes-lbl').style.display = 'inline';
  document.getElementById('save-btn').classList.add('dirty');
  document.getElementById('save-btn').textContent = 'Save + sync project';
  setSaveStatus('', '');
}

function markClean(message, cls) {
  dirty = false;
  document.getElementById('changes-lbl').style.display = 'none';
  document.getElementById('save-btn').classList.remove('dirty');
  document.getElementById('save-btn').textContent = 'Save + sync project';
  setSaveStatus(message || '', cls || 'ok');
}

function setSaveStatus(message, cls) {
  var el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = message || '';
  el.className = cls || '';
}

function cleanEdges() {
  var valid = {};
  allWps.forEach(function(w) { valid[w.id] = true; });
  var seen = {};
  var clean = [];
  allEdges.forEach(function(e) {
    if (!valid[e.from] || !valid[e.to] || e.from === e.to) return;
    var key = [e.from, e.to].sort().join('__');
    if (seen[key]) return;
    seen[key] = true;
    clean.push(Object.assign({}, e));
  });
  allEdges = clean;
  FULL_CAMPUS.edges = allEdges;
  return clean;
}

function cleanRooms() {
  var valid = {};
  var updatedWps = allWps.map(function(w) {
    var p = positions[w.id];
    if (p) { w.x = Math.round(p.x * 10) / 10; w.y = Math.round(p.y * 10) / 10; }
    valid[w.id] = true;
    return w;
  });
  allRooms = allRooms.filter(function(r) {
    if (!r || !r.waypoint_id || !valid[r.waypoint_id]) return false;
    var wp = wpById[r.waypoint_id];
    r.building = wp.building;
    r.floor = wp.floor;
    if (!r.room_number && r.room_name) r.room_number = r.room_name;
    if (!r.room_name && r.room_number) r.room_name = wp.label || r.room_number;
    if (!r.type) r.type = wp.type || 'room';
    return true;
  });
  FULL_CAMPUS.rooms = allRooms;
  FULL_CAMPUS.waypoints = updatedWps;
  return updatedWps;
}

function buildSavedCampus() {
  syncEntranceArrays();
  var updatedWps = cleanRooms();
  syncQrAnchors();
  var updatedEdges = cleanEdges();
  return Object.assign({}, FULL_CAMPUS, {
    waypoints: updatedWps.map(function(w) { return Object.assign({}, w); }),
    edges: updatedEdges.map(function(e) { return Object.assign({}, e); }),
    rooms: allRooms.map(function(r) { return Object.assign({}, r); }),
    qrAnchors: allQrAnchors.map(function(q) { return Object.assign({}, q); })
  });
}

function canUseServerSave() {
  return typeof fetch === 'function' &&
    typeof EDITOR_SAVE_ENDPOINT === 'string' &&
    /^https?:$/.test(window.location.protocol);
}

function downloadCampusData(out) {
  var blob = new Blob([JSON.stringify(out, null, 2) + '\n'], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'campusData.json'; a.click();
}

async function saveData() {
  var btn = document.getElementById('save-btn');
  var out = buildSavedCampus();
  btn.disabled = true;
  btn.textContent = 'Saving...';
  setSaveStatus('Saving...', '');

  try {
    if (canUseServerSave()) {
      var res = await fetch(EDITOR_SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(out)
      });
      var payload = await res.json().catch(function() { return null; });
      if (!res.ok || !payload || !payload.ok) {
        console.error('Campus editor save failed', payload);
        setSaveStatus((payload && payload.message) || 'Save failed. See console.', 'err');
        btn.textContent = 'Save + sync project';
        return;
      }
      markClean('Saved, split, validated, rebuilt.', 'ok');
      return;
    }

    downloadCampusData(out);
    markClean('Downloaded only. Project files were not changed.', 'err');
  } catch (err) {
    console.error('Campus editor server save unavailable', err);
    downloadCampusData(out);
    markClean('Server unavailable. Downloaded JSON only.', 'err');
  } finally {
    btn.disabled = false;
    if (dirty) btn.textContent = 'Save + sync project';
  }
}

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
var dcLeg = document.createElement('div');
dcLeg.className = 'leg-row';
dcLeg.innerHTML = '<div class="leg-dot" style="background:#fff;border:2px solid #E24B4A"></div>disconnected';
legEl.appendChild(dcLeg);
var noLatLng = document.createElement('div');
noLatLng.className = 'leg-row';
noLatLng.innerHTML = '<div class="leg-dot" style="background:#185FA5;border:2.5px solid #F5A623"></div>entrance \u2014 missing lat/long';
legEl.appendChild(noLatLng);
var vertLeg = document.createElement('div');
vertLeg.className = 'leg-row';
vertLeg.innerHTML = '<svg width="12" height="12" style="flex-shrink:0"><circle cx="6" cy="6" r="5" fill="#854F0B" stroke="#854F0B" stroke-width="2" stroke-dasharray="3,2"/></svg><span style="font-size:11px">vertically connected</span>';
legEl.appendChild(vertLeg);

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

// ── Sync buildings[].entrances when type changes ──────────────────────────────
function syncEntranceArrays(id, building, oldType, newType) {
  var buildings = FULL_CAMPUS.buildings;
  if (!Array.isArray(buildings)) return;
  var buildingObj = null;
  for (var i = 0; i < buildings.length; i++) {
    if (buildings[i].id === building || buildings[i].name === building) {
      buildingObj = buildings[i]; break;
    }
  }
  if (!buildingObj || !Array.isArray(buildingObj.entrances)) return;
  var wasEntrance = oldType === 'entrance';
  var isEntrance  = newType === 'entrance';
  if (!wasEntrance && isEntrance) {
    if (buildingObj.entrances.indexOf(id) === -1) buildingObj.entrances.push(id);
  } else if (wasEntrance && !isEntrance) {
    var idx = buildingObj.entrances.indexOf(id);
    if (idx !== -1) buildingObj.entrances.splice(idx, 1);
  }
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
    var p = positions[draggingNode];
    var xyEl = document.querySelector('#node-info .val[data-xy]');
    if (xyEl) xyEl.textContent = 'x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1);
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
  var fEdges = allEdges.filter(function(e) { return nodeSet[e.from] && nodeSet[e.to]; });

  // Find vertically connected nodes
  var hasVertical = {};
  nodeIds.forEach(function(id) {
    var wp = wpById[id];
    if (!wp) return;
    var cross = allEdges.some(function(e) {
      if (e.from !== id && e.to !== id) return false;
      var nb = e.from === id ? e.to : e.from;
      var nbWp = wpById[nb];
      return nbWp && nbWp.building === wp.building && String(nbWp.floor) !== String(wp.floor);
    });
    if (cross) hasVertical[id] = true;
  });

  // Multi-seed BFS: main cluster + all vertical bridge nodes
  var seeds = [];
  var mainStart = null;
  for (var mi = 0; mi < nodeIds.length; mi++) {
    var mid = nodeIds[mi];
    if ((adj[mid] || []).some(function(nb) { return nodeSet[nb]; })) { mainStart = mid; break; }
  }
  if (mainStart) seeds.push(mainStart);
  nodeIds.forEach(function(id) { if (hasVertical[id] && seeds.indexOf(id) === -1) seeds.push(id); });

  var reachable = {};
  seeds.forEach(function(seed) {
    var vis = bfs(seed, nodeSet, adj);
    Object.keys(vis).forEach(function(id) { reachable[id] = true; });
  });

  var dcSet = {};
  nodeIds.forEach(function(id) { if (!reachable[id]) dcSet[id] = true; });

  // Stats
  document.getElementById('s-wps').textContent  = allWps.length;
  document.getElementById('s-edges').textContent = allEdges.length;
  var dcEl = document.getElementById('s-dc');
  var dcCount = Object.keys(dcSet).length;
  dcEl.textContent = dcCount;
  dcEl.style.color = dcCount ? '#A32D2D' : '#3B6D11';

  var svgParts = [];

  // Floorplan background
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

  // Edges — invisible 12px hit area + visible thin line on top
  // The wide transparent line captures clicks reliably in all browsers
  fEdges.forEach(function(e) {
    var a = positions[e.from], b = positions[e.to];
    if (!a || !b) return;
    var hl = hoveredNode && (e.from === hoveredNode || e.to === hoveredNode);
    var pd = edgePendFrom && (e.from === edgePendFrom || e.to === edgePendFrom);
    var visColor = hl ? '#185FA5' : pd ? '#854F0B' : 'rgba(0,0,0,0.28)';
    var visSW    = hl || pd ? 2.5 : 1.5;
    var coords   = ' x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '"';
    // Invisible wide hit area (class carries data-from/to for event delegation)
    svgParts.push(
      '<line class="e-line" data-from="' + e.from + '" data-to="' + e.to + '"' + coords +
      ' stroke="transparent" stroke-width="12" pointer-events="stroke" style="cursor:pointer"/>'
    );
    // Visible thin line (no pointer events — the hit area handles it)
    svgParts.push(
      '<line' + coords +
      ' stroke="' + visColor + '" stroke-width="' + visSW + '" pointer-events="none"/>'
    );
  });

  // Nodes — pointer-events="all" required for Chrome/Safari to fire events on <g>
  nodeIds.forEach(function(id) {
    var wp = wpById[id], p = positions[id];
    if (!wp || !p) return;
    var isDc   = !!dcSet[id];
    var isHl   = hoveredNode === id;
    var isPd   = edgePendFrom === id;
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
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '"' +
      ' r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + ' opacity="0.93"/>' +
      '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 3.5).toFixed(1) + '"' +
      ' text-anchor="middle" font-size="7" font-weight="500" font-family="system-ui,sans-serif"' +
      ' fill="' + (isDc ? '#E24B4A' : '#fff') + '" pointer-events="none">' + sl + '</text>' +
      '</g>'
    );
  });

  // Get or create SVG
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

  // Add-mode canvas click
  svg.onclick = function(e) {
    if (mode !== 'add') return;
    // Use composedPath for shadow DOM compat; fall back to target check
    var target = e.target || e.srcElement;
    if (target && target.closest && target.closest('.wp-node')) return;
    var sv = svgCoords(e.clientX, e.clientY);
    pendingPos = { x: Math.round(sv.x * 10) / 10, y: Math.round(sv.y * 10) / 10 };
    document.getElementById('modal-coords').textContent =
      'Position: x=' + pendingPos.x.toFixed(1) + ', y=' + pendingPos.y.toFixed(1);
    document.getElementById('modal-overlay').classList.add('open');
    e.stopPropagation();
  };

  bindEvents(svg, adj, nodeSet, dcSet);
}

// ── Bind SVG events (event delegation on svg element) ─────────────────────────
function bindEvents(svg, adj, nodeSet, dcSet) {
  // Use event delegation on the SVG itself — more reliable than per-element listeners
  // which can be dropped when innerHTML is reset

  svg.addEventListener('click', function(e) {
    // Edge hit area click
    if (e.target.classList && e.target.classList.contains('e-line')) {
      if (mode === 'move') return;
      var from = e.target.dataset.from, to = e.target.dataset.to;
      if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) {
        removeEdge(from, to);
        markDirty();
        render();
      }
      e.stopPropagation();
      return;
    }
    // Node click
    var g = closest(e.target, '.wp-node');
    if (g) {
      var id = g.getAttribute('data-id');
      if (mode === 'view') showInfo(id, adj, nodeSet);
      if (mode === 'edge') handleEdgeClick(id);
      e.stopPropagation();
    }
  });

  svg.addEventListener('mouseover', function(e) {
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    var id = g.getAttribute('data-id');
    if (hoveredNode === id) return;
    hoveredNode = id;
    if (mode === 'view' || mode === 'edge') showInfo(id, adj, nodeSet);
    render();
  });

  svg.addEventListener('mouseout', function(e) {
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    // Only clear if leaving entirely (not moving to child)
    var rel = e.relatedTarget;
    if (rel && closest(rel, '.wp-node') === g) return;
    hoveredNode = null;
    render();
  });

  svg.addEventListener('mousedown', function(e) {
    if (e.button !== 0) return;
    var g = closest(e.target, '.wp-node');
    if (!g) return;
    var id = g.getAttribute('data-id');
    e.stopPropagation();
    if (mode === 'move') {
      var sv = svgCoords(e.clientX, e.clientY);
      draggingNode = id;
      dnSX = sv.x; dnSY = sv.y;
      dnOX = positions[id].x; dnOY = positions[id].y;
    }
  });
}

// ── Cross-browser closest() polyfill ──────────────────────────────────────────
function closest(el, selector) {
  while (el && el !== document) {
    if (el.matches ? el.matches(selector) : el.msMatchesSelector && el.msMatchesSelector(selector)) return el;
    el = el.parentNode;
  }
  return null;
}

// ── Node info panel ───────────────────────────────────────────────────────────
function showInfo(id, adj, nodeSet) {
  var w = wpById[id], p = positions[id];
  if (!w) return;
  var nbs = (adj[id] || []).filter(function(nb) { return nodeSet[nb]; });

  var xyRow = (p && p.x)
    ? '<div class="val" data-xy style="font-family:monospace;font-size:11px">x: ' + p.x.toFixed(1) + '  y: ' + p.y.toFixed(1) + '</div>'
    : '<div class="val" style="color:#A32D2D">x/y not set \u2014 drag in Move mode</div>';

  var latLngWarning = '';
  if (w.type === 'entrance') {
    var hasLatLng = Number.isFinite(Number(w.latitude)) && Number(w.latitude) !== 0 &&
                   Number.isFinite(Number(w.longitude)) && Number(w.longitude) !== 0;
    latLngWarning = hasLatLng
      ? '<div style="font-size:11px;color:#3B6D11;margin-bottom:6px">\u2713 lat: ' + Number(w.latitude).toFixed(6) + ', lng: ' + Number(w.longitude).toFixed(6) + '</div>'
      : '<div style="padding:6px 8px;background:#FFF3E0;border:.5px solid #F5A623;border-radius:5px;font-size:11px;color:#854F0B;margin-bottom:6px">' +
        '\u26A0 Entrance is missing lat/long. Outdoor routing will not work. Add lat/long in campusData.json.</div>';
  }

  var typeOptions = Object.keys(TYPE_COLOR).map(function(t) {
    return '<option value="' + t + '"' + (w.type === t ? ' selected' : '') + '>' + t + '</option>';
  }).join('');

  var rows = nbs.map(function(nb) {
    var nw = wpById[nb];
    return '<div class="conn-row">' +
      '<span><span style="color:#888780;font-size:10px">' + (nw ? nw.type : '?') + '</span> ' +
      (nw ? nw.label || nb : nb) + '</span>' +
      '<button class="xb" onclick="delEdge(\'' + id + '\',\'' + nb + '\')">x</button></div>';
  }).join('');

  var verticalPanel = '';
  if (w.type === 'stairs' || w.type === 'elevator') {
    var sameType = allWps.filter(function(other) {
      return other.id !== id && other.building === w.building &&
             other.type === w.type && String(other.floor) !== String(w.floor);
    });
    var connectedSet = {};
    allEdges
      .filter(function(e) { return e.from === id || e.to === id; })
      .map(function(e) { return e.from === id ? e.to : e.from; })
      .filter(function(nb) { var nw = wpById[nb]; return nw && String(nw.floor) !== String(w.floor); })
      .forEach(function(nb) { connectedSet[nb] = true; });

    var vRows = sameType.map(function(other) {
      var isConn = !!connectedSet[other.id];
      var dir = (other.floor === 'ground' && w.floor !== 'ground') ? '\u2193'
              : (w.floor === 'ground' && other.floor !== 'ground') ? '\u2191'
              : (Number(other.floor) > Number(w.floor)) ? '\u2191' : '\u2193';
      return '<div class="conn-row"><span>' + dir + ' floor ' + other.floor +
        ' <span style="color:#888780;font-size:10px">' + other.id + '</span></span>' +
        (isConn
          ? '<button class="xb" onclick="toggleVertical(\'' + id + '\',\'' + other.id + '\',false)">disconnect</button>'
          : '<button style="font-size:10px;padding:1px 5px;border:.5px solid #b6d4a8;border-radius:3px;background:#EAF3DE;color:#27500A;cursor:pointer" onclick="toggleVertical(\'' + id + '\',\'' + other.id + '\',true)">connect</button>'
        ) + '</div>';
    }).join('');

    verticalPanel = '<div style="margin-top:10px">' +
      '<div class="lbl" style="display:flex;justify-content:space-between">' +
      '<span>Vertical connections</span><span style="color:#185FA5;font-size:10px">' + w.type + '</span></div>' +
      (vRows || '<div style="font-size:11px;color:#888780;margin-top:4px">No other ' + w.type + ' found in ' + w.building + '</div>') +
      '</div>';
  }

  document.getElementById('node-info').innerHTML =
    '<h3>Node info</h3>' +
    '<div class="lbl">Label</div>' +
    '<input id="edit-label" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:6px" value="' + (w.label || '').replace(/"/g, '&quot;') + '"/>' +
    '<div class="lbl">ID</div>' +
    '<input id="edit-id" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:monospace;margin-bottom:2px" value="' + id.replace(/"/g, '&quot;') + '"/>' +
    '<div style="font-size:10px;color:#888780;margin-bottom:6px">Renaming updates edges, rooms, entrances, and QR anchors automatically.</div>' +
    '<div class="lbl">Type</div>' +
    '<select id="edit-type" style="width:100%;padding:4px 6px;border:.5px solid #d3d1c7;border-radius:4px;font-size:12px;font-family:inherit;margin-bottom:6px">' + typeOptions + '</select>' +
    '<button onclick="applyWaypointEdit(\'' + id + '\')" style="width:100%;padding:5px;background:#185FA5;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin-bottom:8px">Apply changes</button>' +
    '<div class="lbl">Position</div>' + xyRow + latLngWarning +
    '<div style="margin-bottom:6px;margin-top:4px">' +
    '<span class="badge ' + (nbs.length ? 'bg' : 'br') + '">' + nbs.length + ' connections</span> ' +
    '<button class="badge br" style="cursor:pointer;border:none;font-size:10px" onclick="deleteWaypoint(\'' + id + '\')">delete</button></div>' +
    '<div class="lbl">Connections</div>' +
    '<div>' + (rows || '<div style="color:#888780;font-size:11px">none on this floor</div>') + '</div>' +
    verticalPanel;
}

// ── Apply label / type / ID edit ──────────────────────────────────────────────
function applyWaypointEdit(oldId) {
  var w = wpById[oldId];
  if (!w) return;
  var newLabel = (document.getElementById('edit-label').value || '').trim();
  var newType  = document.getElementById('edit-type').value;
  var newId    = (document.getElementById('edit-id').value || '').trim().replace(/\s+/g, '_');
  if (!newLabel) { alert('Label cannot be empty.'); return; }
  if (!newId)    { alert('ID cannot be empty.');    return; }
  if (newId !== oldId) {
    if (wpById[newId]) { alert('A waypoint with ID "' + newId + '" already exists.'); return; }
    renameWaypointId(oldId, newId);
    w = wpById[newId];
  }
  var oldType = w.type;
  w.label = newLabel;
  w.type  = newType;
  if (oldType !== newType) syncEntranceArrays(newId, w.building, oldType, newType);
  markDirty();
  var adj = buildAdj();
  var ns  = {}; floorNodeIds().forEach(function(i) { ns[i] = true; });
  showInfo(newId, adj, ns);
  render();
}

// ── Rename waypoint ID across all references ──────────────────────────────────
function renameWaypointId(oldId, newId) {
  var w = wpById[oldId];
  if (!w) return;
  w.id = newId;
  wpById[newId] = w;
  delete wpById[oldId];
  allWps.forEach(function(wp) { if (wp.id === oldId) wp.id = newId; });
  allEdges.forEach(function(e) {
    if (e.from === oldId) e.from = newId;
    if (e.to   === oldId) e.to   = newId;
  });
  if (positions[oldId] !== undefined) {
    positions[newId] = positions[oldId];
    delete positions[oldId];
  }
  var buildings = FULL_CAMPUS.buildings;
  if (Array.isArray(buildings)) {
    buildings.forEach(function(b) {
      if (!Array.isArray(b.entrances)) return;
      var idx = b.entrances.indexOf(oldId);
      if (idx !== -1) b.entrances[idx] = newId;
    });
  }
  if (Array.isArray(FULL_CAMPUS.rooms)) {
    FULL_CAMPUS.rooms.forEach(function(r) { if (r.waypoint_id === oldId) r.waypoint_id = newId; });
  }
  if (Array.isArray(FULL_CAMPUS.qrAnchors)) {
    FULL_CAMPUS.qrAnchors.forEach(function(q) { if (q.waypoint_id === oldId) q.waypoint_id = newId; });
  }
}

function delEdge(from, to) {
  removeEdge(from, to);
  markDirty();
  var adj = buildAdj();
  var ns = {}; floorNodeIds().forEach(function(i) { ns[i] = true; });
  showInfo(from, adj, ns);
  render();
}

function toggleVertical(idA, idB, connect) {
  if (connect) {
    if (!edgeExists(idA, idB)) allEdges.push({ from: idA, to: idB, accessible: true });
  } else {
    if (!confirm('Remove vertical connection between ' + idA + ' and ' + idB + '?')) return;
    removeEdge(idA, idB);
  }
  markDirty();
  var adj = buildAdj();
  var ns = {}; floorNodeIds().forEach(function(i) { ns[i] = true; });
  showInfo(idA, adj, ns);
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
    render(); return;
  }
  if (edgePendFrom === id) {
    edgePendFrom = null;
    document.getElementById('pending-box').style.display = 'none';
    render(); return;
  }
  var from = edgePendFrom, to = id;
  if (edgeExists(from, to)) {
    if (confirm('Remove edge ' + from + ' \u2194 ' + to + '?')) removeEdge(from, to);
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
// Disable editing modes until a floor is selected
['move','edge','add'].forEach(function(m) {
  var btn = document.getElementById('btn-mode-' + m);
  btn.disabled = true;
  btn.style.opacity = '0.4';
  btn.style.cursor = 'not-allowed';
});
document.getElementById('mode-hint').textContent = 'Select a floor above to begin';

var hints = {
  view: 'Hover or click a node to inspect \u00b7 click any edge to delete it',
  move: 'Drag nodes to reposition \u00b7 scroll to zoom \u00b7 changes save on mouse release',
  edge: 'Click a node then click another to add/remove edge \u00b7 click an edge to delete it',
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
  // Enable editing mode buttons now a floor is loaded
  ['move','edge','add'].forEach(function(m) {
    var btn = document.getElementById('btn-mode-' + m);
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
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

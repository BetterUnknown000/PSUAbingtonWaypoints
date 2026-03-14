import React from "react";
import { useNavigate } from "react-router-dom";
import BottomMenu from "../components/BottomMenu.jsx";

export default function MapView() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="brandRow">
        <div className="psuBadge">PSU</div>
        <div className="brand">PENN STATE ABINGTON</div>
      </div>

      <div className="title" style={{ fontSize: "32px" }}>
        Campus
        <br />
        Map View
      </div>

      <div className="panel">
        <div className="panelTitle">Select a Building</div>
        <div className="resultMeta">
          Tap a building on the map to open its floor viewer.
        </div>

        <div className="mapPlaceholder">

          <img
            src="/images/psu-abington-map.jpeg"
            className="campusMapImage"
            alt="Penn State Abington Campus Map"
          />

          <button className="mapHotspot hotspot-sutherland" onClick={() => navigate("/map/sutherland")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Sutherland</span>
          </button>

          <button className="mapHotspot hotspot-woodland" onClick={() => navigate("/map/woodland")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Woodland</span>
          </button>

          <button className="mapHotspot hotspot-lares" onClick={() => navigate("/map/lares")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Lares</span>
          </button>

          <button className="mapHotspot hotspot-rydal" onClick={() => navigate("/map/rydal")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Rydal</span>
          </button>

          <button className="mapHotspot hotspot-springhouse" onClick={() => navigate("/map/springhouse")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Springhouse</span>
          </button>

          <button className="mapHotspot hotspot-athletic" onClick={() => navigate("/map/athletic")}>
            <span className="mapPin">📍</span>
            <span className="mapLabel">Athletics</span>
          </button>
        </div>

        <div className="mapInfoBox">
          <div className="panelTitleSmall">Planned Floor Viewer Features</div>
          <ul className="mapFeatureList">
            <li>Floor-by-floor SVG maps</li>
            <li>Zoom in and out for room visibility</li>
            <li>Navigation overlay for room directions</li>
            <li>QR-based indoor progress updates</li>
          </ul>
        </div>
      </div>

      <BottomMenu />
    </div>
  );
}
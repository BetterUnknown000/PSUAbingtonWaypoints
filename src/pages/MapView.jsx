import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import BottomMenu from "../components/BottomMenu.jsx";
import { getAllBuildings } from "../utils/findRoom.js";

export default function MapView() {
  const navigate = useNavigate();
  const buildings = useMemo(() => getAllBuildings(), []);

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
        <div className="panelTitle">Campus Overview</div>
        <div className="resultMeta">
          Interactive campus map and navigation overlay will appear here.
        </div>

        <div className="mapPlaceholder">
          <div className="mapGrid" />

          <div className="mapLabel mapLabel1">Sutherland</div>
          <div className="mapLabel mapLabel2">Woodland</div>
          <div className="mapLabel mapLabel3">Lares</div>
          <div className="mapLabel mapLabel4">Rydal</div>
          <div className="mapLabel mapLabel5">Springhouse</div>
          <div className="mapLabel mapLabel6">Athletics</div>

          <div className="mapPin pin1">📍</div>
          <div className="mapPin pin2">📍</div>
          <div className="mapPin pin3">📍</div>
          <div className="mapPin pin4">📍</div>
          <div className="mapPin pin5">📍</div>
          <div className="mapPin pin6">📍</div>
        </div>

        <div style={{ marginTop: "16px" }}>
          <div className="panelTitleSmall">Buildings on Map</div>

          <div className="mapBuildingList">
            {buildings.map((building) => (
              <button
                key={building.id}
                className="mapBuildingBtn"
                onClick={() => navigate(`/buildings/${building.id}`)}
              >
                <span>{building.name}</span>
                <span className="mapBuildingArrow">→</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mapInfoBox">
          <div className="panelTitleSmall">Planned Features</div>
          <ul className="mapFeatureList">
            <li>Interactive campus map with selectable buildings</li>
            <li>Outdoor route guidance using GPS</li>
            <li>Indoor wayfinding using QR-based positioning</li>
            <li>SVG floor maps for each building level</li>
          </ul>
        </div>
      </div>

      <BottomMenu />
    </div>
  );
}
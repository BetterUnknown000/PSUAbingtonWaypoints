import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import BottomMenu from "../components/BottomMenu.jsx";
import campusData from "../data/campusData.json";

function sortFloors(floors) {
  const orderValue = (f) => {
    const v = String(f).toLowerCase();
    if (v === "ground" || v === "g") return 0;
    const n = Number(v);
    return Number.isNaN(n) ? 999 : n;
  };

  return [...(floors || [])].sort((a, b) => orderValue(a) - orderValue(b));
}

export default function BuildingMapView() {
  const navigate = useNavigate();
  const { buildingId } = useParams();

  const building = useMemo(() => {
    return (campusData.buildings || []).find(
      (b) => String(b.id).toLowerCase() === String(buildingId).toLowerCase()
    );
  }, [buildingId]);

  const floors = useMemo(() => sortFloors(building?.floors || []), [building]);
  const [selectedFloor, setSelectedFloor] = useState(floors[0] || "");

  if (!building) {
    return (
      <div className="page">
        <div className="panel">
          <div className="panelTitle">Building not found</div>
          <button className="primaryBtn" onClick={() => navigate("/map")}>
            Back to Map
          </button>
        </div>
        <BottomMenu />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="brandRow">
        <div className="psuBadge">PSU</div>
        <div className="brand">PENN STATE ABINGTON</div>
      </div>

      <div className="title" style={{ fontSize: "30px" }}>
        {building.name}
      </div>

      <div className="panel">
        <div className="floorViewerTopBar">
          <div className="floorSelectorWrap">
            <label className="label" style={{ marginTop: 0 }}>
              Floor
            </label>
            <select
              className="input"
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
            >
              {floors.map((floor) => (
                <option key={String(floor)} value={String(floor)}>
                  {String(floor)}
                </option>
              ))}
            </select>
          </div>

          <div className="floorViewerActions">
            <button className="smallBtn" onClick={() => navigate("/map")}>
              Back to Map
            </button>
          </div>
        </div>

        <div className="resultMeta" style={{ marginTop: "10px" }}>
          Pinch to zoom and drag to move
        </div>

        <div className="svgViewport">
          <TransformWrapper
            initialScale={1}
            minScale={0.6}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.15 }}
            doubleClick={{ disabled: true }}
            pinch={{ step: 5 }}
            panning={{ velocityDisabled: false }}
          >
            <TransformComponent
              wrapperStyle={{
                width: "100%",
                height: "100%",
              }}
              contentStyle={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div className="svgPlaceholder">
                <div className="svgPlaceholderTitle">
                  {building.name} — Floor {String(selectedFloor)}
                </div>
                <div className="svgPlaceholderText">SVG floor map placeholder</div>
                <div className="svgPlaceholderSub">
                  Real SVG file will be added later.
                </div>

                <div className="roomBox roomA">Room A</div>
                <div className="roomBox roomB">Room B</div>
                <div className="roomBox roomC">Room C</div>
                <div className="roomBox roomD">Room D</div>
                <div className="hallwayBox">Hallway</div>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>

      <BottomMenu />
    </div>
  );
}
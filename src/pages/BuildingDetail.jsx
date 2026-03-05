import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import BottomMenu from "../components/BottomMenu.jsx";
import campusData from "../data/campusData.json";
import { countRoomsInBuilding } from "../utils/findRoom.js";

const BUILDING_DETAILS = {
  sutherland:
    "A historic building designed by Julian Abele, featuring classrooms, academic advising, a tutoring center, and a lecture hall in a converted indoor swimming pool.",
  lares: "Houses the cafeteria, bookstore, and Student Affairs.",
  lionsgate:
    "Opened in 2017, this is the main residential facility, offering 400 beds in apartment-style units.",
  woodland: "A central campus building with offices and academic space.",
  springhouse: "Contains classrooms and the Collegiate Recovery Program.",
  rydal: "Used for classrooms and campus security.",
  athletic: "Features facilities for campus recreation and teams."
};

export default function BuildingDetail() {
  const nav = useNavigate();
  const { buildingId } = useParams();

  const building = useMemo(() => {
    const bid = String(buildingId || "").toLowerCase();
    return (campusData.buildings || []).find((b) => String(b.id).toLowerCase() === bid) || null;
  }, [buildingId]);

  const roomsCount = building ? countRoomsInBuilding(building.id) : 0;

  if (!building) {
    return (
      <div className="page">
        <div className="panel">
          <div className="panelTitle">Building not found</div>
          <button className="primaryBtn" onClick={() => nav("/buildings")}>
            Back to Buildings
          </button>
        </div>
        <BottomMenu />
      </div>
    );
  }
  	
  const floors = building.floors || [];
  const entrances = building.entrances || [];

  return (
    <div className="page">
      <div className="brandRow" style={{ justifyContent: "space-between" }}>
        <div className="brandRow">
          <div className="psuBadge">PSU</div>
          <div className="brand">PENN STATE ABINGTON</div>
        </div>

        <button
          className="pill"
          style={{ border: "none", cursor: "pointer" }}
          onClick={() => nav("/buildings")}
        >
          ← Back
        </button>
      </div>

      <div className="title" style={{ fontSize: 30 }}>
        {building.name}
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
	<img
    	   src={`/images/buildings/${building.id}.jpg`}
           style={{width:"100%", borderRadius:"10px"}}
        />
        <div className="panelTitle">Overview</div>
        <div className="cardSub" style={{ marginTop: 6 }}>
          {BUILDING_DETAILS[building.id] || "Building details will be expanded later."}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span className="pill">Floors: {floors.length}</span>
          <span className="pill">Entrances: {entrances.length}</span>
          <span className="pill">Rooms: {roomsCount}</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="panelTitle">Location</div>
          <div className="resultMeta2">
            Latitude: {building.latitude} • Longitude: {building.longitude}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="panelTitle">Floors</div>
          <div className="resultMeta2">
            {floors.length ? floors.join(", ") : "No floor data yet."}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="panelTitle">Entrances</div>
          <div className="resultMeta2">
            {entrances.length ? entrances.join(", ") : "No entrance data yet."}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="panelTitle">What’s next</div>
          <div className="resultMeta2">
            Later we can add floor SVGs, indoor navigation, and QR anchor scanning.
          </div>
        </div>
      </div>

      <BottomMenu />
    </div>
  );
}
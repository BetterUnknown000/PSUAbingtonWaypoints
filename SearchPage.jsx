// src/pages/SearchPage.jsx
import React, { useMemo, useState } from "react";
import BottomMenu from "../components/BottomMenu.jsx";
import { findRoom, getAllBuildings } from "../utils/findRoom.js";
import { findCourse } from "../utils/findCourse.js";
import { useNavigate } from "react-router-dom";

export default function SearchPage() {
  const buildings = useMemo(() => getAllBuildings(), []);
  const [buildingId, setBuildingId] = useState(buildings[0]?.id ?? "");
  const [roomNumber, setRoomNumber] = useState("");

  const [courseName, setCourseName] = useState("");

  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const navigate = useNavigate();

  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === buildingId) || null,
    [buildings, buildingId]
  );

  function onSearchRoom() {
    setStatus("");
    setResult(null);

    if (!buildingId) return setStatus("Please select a building.");
    const r = roomNumber.trim();
    if (!r) return setStatus("Please enter a room number.");

    const found = findRoom(buildingId, r);
    if (!found) {
      return setStatus(
        `No results for room ${r} in ${selectedBuilding?.name || buildingId}.`
      );
    }
    setResult(found);
  }

  function onSearchCourse() {
    setStatus("");
    setResult(null);

    const q = courseName.trim();
    if (!q) return setStatus("Please enter a course name (e.g., CMPSC 445).");

    const out = findCourse(q);
    if (!out) {
      return setStatus(`No course match found for "${q}".`);
    }

    // out is already a findRoom-style result object
    setResult(out);
    // also sync the dropdown + room field for UI clarity
    setBuildingId(out.building?.id || out.room?.building || buildingId);
    setRoomNumber(out.room?.room_number || "");
  }

  const showName = (r) =>
    (r.building?.name || r.room?.building || "") +
    " " +
    (r.room?.room_number || "");

  return (
    <div className="page">
      <div className="header">
  	<div className="brandRow">
    	   <img className="psuLogoTop" src="/psu-logo.png" alt="Penn State logo" />
    	   <div className="brand">PENN STATE ABINGTON</div>
  	</div>

      <div className="title">
    	Where are you<br />heading today?
      </div>
</div>

      <div className="panel">
        <div className="panelTitle">Search Classroom</div>

        <label className="label">Building</label>
        <select
          className="input"
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
        >
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        <label className="label">Room number</label>
        <input
          className="input"
          value={roomNumber}
          onChange={(e) => setRoomNumber(e.target.value)}
          placeholder="e.g. 218, 132B, G04"
        />

        <button className="primaryBtn" onClick={onSearchRoom}>
          Search Room
        </button>

        <div className="divider" />

        <div className="panelTitle">Or Search by Course</div>

        <label className="label">Course name</label>
        <input
          className="input"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          placeholder="e.g. CMPSC 445"
        />

        <button className="primaryBtn" onClick={onSearchCourse}>
          Find Course
        </button>

        {status ? <div className="status">{status}</div> : null}

        {result ? (
          <div className="resultCard">
            <div className="resultRow">
              <div style={{ flex: 1 }}>
                <div className="resultTitle">{showName(result)}</div>
                <div className="resultMeta">
                  {(result.room?.room_name || "Room")} • Floor{" "}
                  {result.room?.floor} • {result.room?.type}
                </div>
                {result.room?.capacity ? (
                  <div className="resultMeta2">
                    Capacity: {result.room.capacity}
                  </div>
                ) : null}
              </div>

              <button
                className="goBtn"
  		onClick={() =>
    		   navigate("/navigate", {
      		      state: {
        	         destination: result,
            	      },
        	   })
  		}
              >
                Go
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <BottomMenu />
    </div>
  );
}

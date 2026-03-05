import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import BottomMenu from "../components/BottomMenu.jsx";
import { getAllBuildings, countRoomsInBuilding } from "../utils/findRoom.js";

const BUILDING_BLURBS = {
  sutherland:
    "Historic Julian Abele building with classrooms, advising, tutoring, and a lecture hall in a converted pool.",
  lares: "Houses the cafeteria, bookstore, and Student Affairs.",
  woodland: "Central campus building with offices and academic space.",
  springhouse: "Contains classrooms and the Collegiate Recovery Program.",
  rydal: "Used for classrooms and campus security.",
  athletic: "Facilities for campus recreation and teams.",
  lionsgate: "Student apartments (opened 2017), apartment-style living with ~400 beds."
};

export default function Buildings() {
  const nav = useNavigate();
  const buildings = useMemo(() => getAllBuildings(), []);

  return (
    <div className="page">
      <div className="brandRow">
        <div className="psuBadge">PSU</div>
        <div className="brand">PENN STATE ABINGTON</div>
      </div>

      <div className="title" style={{ fontSize: 30 }}>
        Campus
        <br />
        Buildings
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <div className="panelTitle">Tap a building</div>
        <div className="grid">
          {buildings.map((b) => {
            const roomsCount = countRoomsInBuilding(b.id);
            const floorsCount = (b.floors || []).length;
            const entrancesCount = (b.entrances || []).length;

            return (
              <div
                key={b.id}
                className="card"
                onClick={() => nav(`/buildings/${b.id}`)}
                role="button"
                tabIndex={0}
              >
                <div className="cardTop">
                  <div className="thumb">{b.name.split(" ")[0].slice(0, 2).toUpperCase()}</div>
                  <span className="pill">Info</span>
                </div>

                <div className="cardTitle">{b.name}</div>
                

                <div className="kv">
                  <div>Floors: <b>{floorsCount}</b></div>
                  <div>Entrances: <b>{entrancesCount}</b></div>
                  <div>Rooms: <b>{roomsCount}</b></div>
                  <div>GPS: <b>Yes</b></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <BottomMenu />
    </div>
  );
}
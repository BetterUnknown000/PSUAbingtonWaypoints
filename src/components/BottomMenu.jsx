import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function BottomMenu() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const isSearch = pathname === "/";
  const isBuildings = pathname.startsWith("/buildings");

  return (
    <div className="bottomMenu">
      <div className="bottomMenuInner">
        <button
          className={"navBtn " + (isSearch ? "navBtnActive" : "")}
          onClick={() => nav("/")}
          aria-label="Search"
        >
          <span className="psuBadge" style={{ width: 22, height: 22, borderRadius: 8, fontSize: 10 }}>
            PSU
          </span>
          Search
        </button>

        <button
          className={"navBtn " + (isBuildings ? "navBtnActive" : "")}
          onClick={() => nav("/buildings")}
          aria-label="Buildings"
        >
          🏛️ Buildings
        </button>
      </div>
    </div>
  );
}
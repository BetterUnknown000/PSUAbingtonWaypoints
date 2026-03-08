import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function BottomMenu() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  const isSearch = pathname === "/";
  const isBuildings = pathname.startsWith("/buildings");
  const isMap = pathname.startsWith("/map");

  return (
    <div className="bottomMenu">
      <div className="bottomMenuInner">
        <button
          className={"navBtn " + (isSearch ? "navBtnActive" : "")}
          onClick={() => nav("/")}
          aria-label="Search"
        >
          Search
        </button>

        <button
          className={"navBtn " + (isMap ? "navBtnActive" : "")}
          onClick={() => nav("/map")}
          aria-label="Map View"
        >
          Map
        </button>

        <div className="menuCenterLogo" aria-hidden="true">
          <img src="/psu-logo.svg" alt="" />
        </div>

        <button
          className={"navBtn " + (isBuildings ? "navBtnActive" : "")}
          onClick={() => nav("/buildings")}
          aria-label="Buildings"
        >
          Buildings
        </button>
      </div>
    </div>
  );
}
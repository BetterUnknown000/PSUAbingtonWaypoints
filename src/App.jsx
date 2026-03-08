import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import SearchPage from "./pages/SearchPage.jsx";
import Buildings from "./pages/Buildings.jsx";
import BuildingDetail from "./pages/BuildingDetail.jsx";
import NavigationPage from "./pages/NavigationPage.jsx";
import MapView from "./pages/MapView.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/buildings" element={<Buildings />} />
        <Route path="/buildings/:buildingId" element={<BuildingDetail />} />
        <Route path="/navigate" element={<NavigationPage />} />
        <Route path="/map" element={<MapView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
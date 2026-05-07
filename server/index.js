/**
 * server/index.js
 *
 * Lightweight ORS proxy server.
 */

const express = require("express");

const app = express();
app.use(express.json());

const ORS_KEY = process.env.ORS_API_KEY || "";
const PORT = process.env.PORT || 3001;

if (!ORS_KEY) {
  console.warn("WARNING: ORS_API_KEY is not set. Requests to ORS will fail.");
}

// ─── Matrix endpoint (entrance ranking) ──────────────────────────────────────

app.post("/ors/matrix", async (req, res) => {
  try {
    const ors = await fetch(
      "https://api.heigit.org/openrouteservice/v2/matrix/foot-walking",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ORS_KEY,
        },
        body: JSON.stringify(req.body),
      }
    );

    const text = await ors.text();
    res.status(ors.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    console.error("[/ors/matrix]", err.message);
    res.status(502).json({ error: "ORS matrix request failed" });
  }
});

// ─── Directions endpoint (outdoor route) ─────────────────────────────────────

app.post("/ors/directions", async (req, res) => {
  try {
    const { profile = "foot-walking", ...body } = req.body;

    const ors = await fetch(
      `https://api.heigit.org/openrouteservice/v2/directions/${profile}/geojson`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: ORS_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    const text = await ors.text();
    res.status(ors.status).set("Content-Type", "application/json").send(text);
  } catch (err) {
    console.error("[/ors/directions]", err.message);
    res.status(502).json({ error: "ORS directions request failed" });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ ok: true, keyConfigured: Boolean(ORS_KEY) });
});

app.listen(PORT, () => {
  console.log(`ORS proxy running on port ${PORT}`);
});

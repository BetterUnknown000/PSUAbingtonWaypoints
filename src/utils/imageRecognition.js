import * as ImageManipulator from "expo-image-manipulator";
import { Asset } from "expo-asset";
import jpeg from "jpeg-js";

import { getAllBuildings, getBuildingData, getBuildingWaypoints } from "./campusDataLoader";
import { imageMap } from "./imageMap";

// ------------------------------------------------------------
// Tuning constants
// Images are 1028 × 2227 (tall portrait). We preserve aspect
// ratio by only fixing the width, letting height scale freely.
// GRID_X × GRID_Y controls fingerprint resolution; 12 × 24
// keeps the vector small while honouring the portrait shape.
// ------------------------------------------------------------
const TARGET_WIDTH = 96;   // resize width; height auto-scales
const GRID_X = 12;
const GRID_Y = 24;
const MIN_SCORE = 0.86;    // minimum cosine similarity to accept a match
const STRONG_SCORE = 0.92; // accept immediately above this score
const MIN_SCORE_GAP = 0.01; // weak matches need separation from runner-up

let referenceDb = [];
let initialized = false;

// ------------------------------------------------------------
// initializeImageModel
// No model file to load — just set the ready flag.
// NavigationPage calls this on mount.
// ------------------------------------------------------------
export async function initializeImageModel() {
  initialized = true;
  return true;
}

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function base64ToUint8Array(base64) {
  const binary = global.atob
    ? global.atob(base64)
    : Buffer.from(base64, "base64").toString("binary");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function rgbToGray(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function l2Normalize(vec) {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom ? dot / denom : 0;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getPhotoRefs(photo) {
  if (Array.isArray(photo)) return photo.flatMap(getPhotoRefs);
  if (!photo) return [];
  const raw = String(photo).trim();
  if (!raw) return [];
  const hasExtension = /\.(jpe?g|png)$/i.test(raw);
  return hasExtension
    ? [raw]
    : [`${raw}.jpg`, `${raw}.jpeg`, `${raw}.png`, raw];
}

function resolvePhotoModule(photoRef) {
  const candidates = unique(getPhotoRefs(photoRef));
  for (const candidate of candidates) {
    if (imageMap[candidate]) {
      return {
        key: candidate,
        module: imageMap[candidate],
      };
    }
  }
  return null;
}

// Grid-based fingerprint: mean luminance + mean horizontal edge energy
// per cell. The 12×24 grid yields a 576-element vector that captures
// corridor and stairwell structure without any ML runtime.
function buildFingerprint(rgba, width, height) {
  const cellW = width / GRID_X;
  const cellH = height / GRID_Y;
  const features = [];

  for (let gy = 0; gy < GRID_Y; gy++) {
    for (let gx = 0; gx < GRID_X; gx++) {
      const startX = Math.floor(gx * cellW);
      const endX = Math.floor((gx + 1) * cellW);
      const startY = Math.floor(gy * cellH);
      const endY = Math.floor((gy + 1) * cellH);

      let graySum = 0;
      let edgeSum = 0;
      let count = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const gray = rgbToGray(rgba[idx], rgba[idx + 1], rgba[idx + 2]);
          graySum += gray;

          if (x + 1 < width) {
            const idx2 = (y * width + (x + 1)) * 4;
            const gray2 = rgbToGray(rgba[idx2], rgba[idx2 + 1], rgba[idx2 + 2]);
            edgeSum += Math.abs(gray2 - gray);
          }

          count++;
        }
      }

      features.push(
        count ? graySum / count / 255 : 0,
        count ? edgeSum / count / 255 : 0
      );
    }
  }

  return l2Normalize(features);
}

// Resize a URI to TARGET_WIDTH (aspect-ratio preserved), decode JPEG
// bytes with jpeg-js, and return the fingerprint vector.
// compress: 0.3 keeps the file tiny — fingerprinting needs structure, not detail.
// decoded.data is nulled immediately after use so GC can reclaim ~80 KB per call.
async function uriToFingerprint(uri) {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: TARGET_WIDTH } }],
    {
      compress: 0.3,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    }
  );

  if (!manipulated.base64) {
    throw new Error("No base64 data returned from ImageManipulator");
  }

  const bytes = base64ToUint8Array(manipulated.base64);
  const decoded = jpeg.decode(bytes, { useTArray: true });

  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error("jpeg-js failed to decode image");
  }

  const fingerprint = buildFingerprint(decoded.data, decoded.width, decoded.height);
  decoded.data = null; // release pixel buffer immediately — prevents heap accumulation
  return fingerprint;
}

// ------------------------------------------------------------
// loadReferenceImageDatabase
// Builds fingerprints for every Woodland waypoint that has a
// photo field wired into imageMap. Called once on mount.
// ------------------------------------------------------------
export async function loadReferenceImageDatabase() {
  const refs = [];

  // Iterate every building, loading its data on-demand.
  // Only waypoints that have a matching entry in imageMap produce fingerprints.
  for (const building of getAllBuildings()) {
    await getBuildingData(building.id); // no-op if already cached
    for (const wp of getBuildingWaypoints(building.id)) {
      const photoRefs = unique(getPhotoRefs(wp.photo));
      if (photoRefs.length === 0) continue;

      for (const photoRef of photoRefs) {
        const resolved = resolvePhotoModule(photoRef);
        if (!resolved) continue;

        try {
          const asset = Asset.fromModule(resolved.module);
          await asset.downloadAsync();

          const uri = asset.localUri || asset.uri;
          const fingerprint = await uriToFingerprint(uri);

          refs.push({
            waypoint_id: wp.id,
            label: wp.label,
            building: wp.building,
            floor: wp.floor,
            type: wp.type,
            x: wp.x ?? null,
            y: wp.y ?? null,
            bearing_hint_deg: wp.bearing_hint_deg ?? null,
            photo: resolved.key,
            fingerprint,
          });
        } catch (err) {
          console.warn(`Reference load failed for ${wp.id}:`, err.message);
        }
      }
    }   // end waypoint loop
  }   // end building loop

  referenceDb = refs;
  console.log(`[VPR] Loaded ${referenceDb.length} reference fingerprints`);
}

// ------------------------------------------------------------
// identifyLocationFromFrame
// Takes a camera frame URI, computes its fingerprint, and
// returns the closest reference match above MIN_SCORE.
// Returns null if nothing is confident enough.
// ------------------------------------------------------------
export async function identifyLocationFromFrame(frameUri) {
  if (!initialized || referenceDb.length === 0) return null;

  try {
    const frameFingerprint = await uriToFingerprint(frameUri);

    const matches = referenceDb
      .map((ref) => ({
        ...ref,
        score: cosineSimilarity(frameFingerprint, ref.fingerprint),
      }))
      .sort((a, b) => b.score - a.score);

    const best = matches[0] || null;
    const runnerUp = matches.find((match) => match.waypoint_id !== best?.waypoint_id) || null;

    if (!best || best.score < MIN_SCORE) return null;
    if (
      best.score < STRONG_SCORE &&
      runnerUp &&
      best.score - runnerUp.score < MIN_SCORE_GAP
    ) {
      return null;
    }

    return {
      matchedImage: {
        waypoint_id: best.waypoint_id,
        label: best.label,
        photo: best.photo,
      },
      confidence: best.score,
      runnerUpConfidence: runnerUp?.score ?? null,
      location: {
        waypoint_id: best.waypoint_id,
        label: best.label,
        building: best.building,
        floor: best.floor,
        type: best.type,
        x: best.x,
        y: best.y,
        bearing_hint_deg: best.bearing_hint_deg,
      },
    };
  } catch (error) {
    console.warn("[VPR] identifyLocationFromFrame failed:", error.message);
    return null;
  }
}

// ------------------------------------------------------------
// getTopMatches
// Returns up to topN candidates sorted by confidence.
// Useful for debugging and future UI.
// ------------------------------------------------------------
export async function getTopMatches(frameUri, topN = 3) {
  if (!initialized || referenceDb.length === 0) return [];

  try {
    const frameFingerprint = await uriToFingerprint(frameUri);

    return referenceDb
      .map((ref) => ({
        refImage: {
          waypoint_id: ref.waypoint_id,
          label: ref.label,
          photo: ref.photo,
        },
        score: cosineSimilarity(frameFingerprint, ref.fingerprint),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  } catch (error) {
    console.warn("[VPR] getTopMatches failed:", error.message);
    return [];
  }
}

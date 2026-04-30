/**
 * useIndoorPose.js
 *
 * Indoor positioning hook using IMU/PDR (Pedestrian Dead Reckoning).
 * Uses accelerometer for step detection, gyroscope for heading,
 * and magnetometer as a soft correction. QR scans act as hard resets
 * to bound accumulated drift.
 *
 * Returns a pose object: { x, y, floor, building, headingDeg, source, timestamp }
 *
 * Usage:
 *   const { pose, resetPose } = useIndoorPose({ anchorPose, isActive });
 *   - anchorPose: the pose from the last QR scan (from navReducer state)
 *   - isActive: boolean — only run when in indoor mode
 *   - resetPose(newAnchorPose): call this when a new QR is scanned
 */
 
import { useEffect, useRef, useState, useCallback } from "react";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
 
// ─── Tuning constants ────────────────────────────────────────────────────────
 
// How many map pixels per meter (calibrate per building)
const MAP_PIXELS_PER_METER = 3.5;
 
// Step detection — vertical acceleration spike threshold (m/s²)
const STEP_THRESHOLD = 1.8;
 
// Minimum time between detected steps (ms) — prevents double-counting
const STEP_COOLDOWN_MS = 300;
 
// Average stride length in meters
const STRIDE_LENGTH_M = 0.75;
 
// How much weight to give magnetometer vs gyroscope heading (0–1)
// Lower = trust gyroscope more (better indoors where mag is noisy)
// Complementary filter: fused = (1-alpha)*gyro + alpha*mag
const MAG_FUSION_WEIGHT = 0.05;
 
// Gyroscope update interval (ms)
const GYRO_INTERVAL_MS = 100;
const HEADING_PUBLISH_INTERVAL_MS = 100; // ~10Hz arrow updates
 
// Accelerometer update interval (ms)
const ACCEL_INTERVAL_MS = 100;
 
// Magnetometer update interval (ms)
const MAG_INTERVAL_MS = 100;
 
// ─── Hook ───────────────────────────────────────────────────────────────────
 
export function useIndoorPose({ anchorPose, isActive }) {
  const [pose, setPose] = useState(anchorPose || null);
 
  // Refs for sensor state (avoid re-render on every sensor tick)
  const poseRef = useRef(anchorPose || null);
  const headingDegRef = useRef(anchorPose?.headingDeg ?? 0);
  const lastStepTimeRef = useRef(0);
  const lastHeadingPublishTsRef = useRef(0);
  const prevAccelRef = useRef({ x: 0, y: 0, z: 0 });
  const gyroSubscriptionRef = useRef(null);
  const accelSubscriptionRef = useRef(null);
  const magSubscriptionRef = useRef(null);
 
  // Keep poseRef in sync with anchorPose when it changes (new QR scan)
  useEffect(() => {
    if (!anchorPose) return;
    poseRef.current = { ...anchorPose };
    headingDegRef.current = anchorPose.headingDeg ?? headingDegRef.current;
    setPose({ ...anchorPose });
  }, [anchorPose]);
 
  // ── Heading-only pose publisher — called by gyro and magnetometer ──
  const publishHeadingOnlyPose = useCallback((source = "imu") => {
    if (!poseRef.current) return;

    const now = Date.now();
    const timeSinceLast = now - lastHeadingPublishTsRef.current;

    // Always publish at least at 10 Hz; also publish on any meaningful turn (>0.5°)
    const lastHeading = poseRef.current.headingDeg ?? 0;
    const delta = Math.abs(headingDegRef.current - lastHeading);
    const normalizedDelta = delta > 180 ? 360 - delta : delta;
    if (timeSinceLast < HEADING_PUBLISH_INTERVAL_MS && normalizedDelta < 0.5) return;

    const nextPose = {
      ...poseRef.current,
      headingDeg: headingDegRef.current,
      timestamp: now,
      source: poseRef.current.source || source,
    };

    poseRef.current = nextPose;
    lastHeadingPublishTsRef.current = now;
    console.log("[LIVE_POSE]", nextPose.headingDeg?.toFixed(1), "src:", source);
    setPose(nextPose);
  }, []);

  // ── Gyroscope — heading update ──
  useEffect(() => {
    if (!isActive) return;
 
    Gyroscope.setUpdateInterval(GYRO_INTERVAL_MS);
 
    gyroSubscriptionRef.current = Gyroscope.addListener(({ z }) => {
      // z-axis rotation in rad/s, integrate over interval to get delta degrees
      const deltaDeg = (z * GYRO_INTERVAL_MS) / 1000 * (180 / Math.PI);
      headingDegRef.current = normalizeDeg(headingDegRef.current + deltaDeg);
      publishHeadingOnlyPose("gyro");
    });
 
    return () => {
      if (gyroSubscriptionRef.current) {
        gyroSubscriptionRef.current.remove();
        gyroSubscriptionRef.current = null;
      }
    };
  }, [isActive]);
 
  // ── Magnetometer — soft heading correction ──
  useEffect(() => {
    if (!isActive) return;
 
    Magnetometer.setUpdateInterval(MAG_INTERVAL_MS);
 
    magSubscriptionRef.current = Magnetometer.addListener(({ x, y }) => {
      // Raw magnetic heading in degrees
      let magHeading = Math.atan2(y, x) * (180 / Math.PI);
      magHeading = normalizeDeg(magHeading);
 
      // Fuse with gyroscope heading — low weight for mag indoors
      headingDegRef.current = normalizeDeg(
        headingDegRef.current * (1 - MAG_FUSION_WEIGHT) +
        magHeading * MAG_FUSION_WEIGHT
      );
      publishHeadingOnlyPose("magnetometer");
    });
 
    return () => {
      if (magSubscriptionRef.current) {
        magSubscriptionRef.current.remove();
        magSubscriptionRef.current = null;
      }
    };
  }, [isActive]);
 
  // ── Accelerometer — step detection and position update ──
  useEffect(() => {
    if (!isActive) return;
 
    Accelerometer.setUpdateInterval(ACCEL_INTERVAL_MS);
 
    accelSubscriptionRef.current = Accelerometer.addListener((accel) => {
      if (!poseRef.current) return;
 
      const now = Date.now();
 
      // Detect step via vertical (z) acceleration peak
      const prevZ = prevAccelRef.current.z;
      const currZ = accel.z;
      const delta = Math.abs(currZ - prevZ);
 
      prevAccelRef.current = accel;
 
      if (
        delta > STEP_THRESHOLD &&
        now - lastStepTimeRef.current > STEP_COOLDOWN_MS
      ) {
        lastStepTimeRef.current = now;
 
        // Move pose forward in current heading direction
        const headingRad = (headingDegRef.current * Math.PI) / 180;
        const stridePixels = STRIDE_LENGTH_M * MAP_PIXELS_PER_METER;
 
        const dx = Math.sin(headingRad) * stridePixels;
        const dy = -Math.cos(headingRad) * stridePixels;
 
        const newPose = {
          ...poseRef.current,
          x: (poseRef.current.x || 0) + dx,
          y: (poseRef.current.y || 0) + dy,
          headingDeg: headingDegRef.current,
          source: "pdr",
          timestamp: now,
        };
 
        poseRef.current = newPose;
        lastHeadingPublishTsRef.current = Date.now();

        console.log("[STEP]", { x: newPose.x?.toFixed(1), y: newPose.y?.toFixed(1), heading: newPose.headingDeg?.toFixed(1) });
        setPose({ ...newPose });
      }
    });
 
    return () => {
      if (accelSubscriptionRef.current) {
        accelSubscriptionRef.current.remove();
        accelSubscriptionRef.current = null;
      }
    };
  }, [isActive]);
 
  // ── Hard reset — called when a new QR is scanned ──
  const resetPose = useCallback((newAnchorPose) => {
    if (!newAnchorPose) return;
    poseRef.current = { ...newAnchorPose, source: "qr" };
    headingDegRef.current = newAnchorPose.headingDeg ?? headingDegRef.current;
    lastStepTimeRef.current = 0;
    setPose({ ...newAnchorPose, source: "qr" });
  }, []);
 
  // ── Stop all sensors when inactive ──
  useEffect(() => {
    if (!isActive) {
      gyroSubscriptionRef.current?.remove();
      accelSubscriptionRef.current?.remove();
      magSubscriptionRef.current?.remove();
      gyroSubscriptionRef.current = null;
      accelSubscriptionRef.current = null;
      magSubscriptionRef.current = null;
    }
  }, [isActive]);
 
  return { pose, resetPose };
}
 
// ─── Helpers ─────────────────────────────────────────────────────────────────
 
function normalizeDeg(deg) {
  return ((deg % 360) + 360) % 360;
}
 
/**
 * Compute the bearing in degrees from pose A to waypoint B
 * using floor map x/y coordinates.
 *
 * 0° = up on the map, 90° = right, 180° = down, 270° = left
 */
export function computeMapBearing(fromPose, toWaypoint) {
  if (
    !fromPose ||
    fromPose.x == null ||
    fromPose.y == null ||
    !toWaypoint ||
    toWaypoint.x == null ||
    toWaypoint.y == null ||
    Number(toWaypoint.x) === 0 ||
    Number(toWaypoint.y) === 0
  ) {
    return null;
  }
 
  const dx = Number(toWaypoint.x) - Number(fromPose.x);
  const dy = Number(toWaypoint.y) - Number(fromPose.y);
 
  let bearing = Math.atan2(dx, -dy) * (180 / Math.PI);
  bearing = normalizeDeg(bearing);
  return bearing;
}
 
/**
 * Compute straight-line pixel distance from pose to waypoint on the floor map.
 */
export function computeMapDistance(fromPose, toWaypoint) {
  if (
    !fromPose ||
    fromPose.x == null ||
    fromPose.y == null ||
    !toWaypoint ||
    toWaypoint.x == null ||
    toWaypoint.y == null
  ) {
    return Infinity;
  }
 
  const dx = Number(toWaypoint.x) - Number(fromPose.x);
  const dy = Number(toWaypoint.y) - Number(fromPose.y);
  return Math.sqrt(dx * dx + dy * dy);
}

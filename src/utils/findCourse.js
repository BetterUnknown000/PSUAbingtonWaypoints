// src/utils/findCourse.js
import courseData from "../data/courseData.json";
import { findRoom } from "./findRoom.js";

// normalize: lowercase + remove spaces (so "CMPSC 445" == "cmpsc445")
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

/**
 * findCourse
 * @param {string} courseText e.g. "CMPSC 445"
 * @returns {object|null} same shape as findRoom() result or null if not found
 */
export function findCourse(courseText) {
  const q = norm(courseText);
  if (!q) return null;

  // Debug (leave for now; remove later)
  console.log("findCourse query:", { raw: courseText, norm: q });
  console.log(
    "courseData loaded:",
    courseData?.courses?.length ?? "NOT FOUND"
  );

  const hit = (courseData.courses || []).find((c) => norm(c.course) === q);
  if (!hit) return null;

  // hit has: { course, building, room_number }
  // Use existing room lookup to return a unified result object:
  return findRoom(hit.building, hit.room_number);
}
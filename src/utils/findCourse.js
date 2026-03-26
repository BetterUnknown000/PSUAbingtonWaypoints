import courseData from "../data/courseData.json";
import { findRoom } from "./findRoom";

function normalizeCourse(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function findCourse(courseQuery) {
  const query = normalizeCourse(courseQuery);

  if (!query) {
    return {
      status: "not_found",
      course: null,
      roomResult: null,
    };
  }

  const courses = Array.isArray(courseData?.courses) ? courseData.courses : [];

  const matchedCourse =
    courses.find((c) => normalizeCourse(c.course) === query) ||
    null;

  if (!matchedCourse) {
    return {
      status: "not_found",
      course: null,
      roomResult: null,
    };
  }

  const roomResult = findRoom(
    matchedCourse.building,
    matchedCourse.room_number
  );

  if (!roomResult) {
    return {
      status: "no_classroom",
      course: matchedCourse,
      roomResult: null,
    };
  }

  return {
    status: "found",
    course: matchedCourse,
    roomResult,
  };
}
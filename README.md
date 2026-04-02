# PSU Abington Waypoints

PSU Abington Waypoints is a mobile navigation app built to help users find their way around the Penn State Abington campus. The app combines QR code scanning, indoor pathfinding, GPS-based outdoor guidance, and a camera overlay interface to guide users to rooms and buildings.

## Project Purpose

The goal of this project is to make campus navigation easier for students and visitors. Users can search for a room or course, scan QR codes placed around campus, and receive directions to their destination.

This project focuses on both indoor and outdoor navigation:
- **Outdoor navigation** uses GPS to guide the user toward the correct building
- **Indoor navigation** uses QR codes and pathfinding to guide the user through waypoint routes inside buildings

## Features

- Search for rooms by building and room number
- Search for courses and find the room location
- QR code scanning to determine indoor position
- Indoor pathfinding using graph-based routing
- Outdoor guidance using GPS
- Camera-based navigation screen with directional overlay
- Step-by-step navigation instructions
- Route recalculation when the user scans a different waypoint
- Arrival detection when the destination waypoint is reached

## Navigation Logic

The main navigation system is split into a few parts:

- `buildGraph.js`  
  Builds the graph of waypoints and edges from campus data

- `dijkstra.js`  
  Finds the shortest path between two waypoint nodes

- `pathfinding.js`  
  Connects room lookup, graph building, and Dijkstra shortest path logic

- `navigation.js`  
  Handles QR-based waypoint lookup

- `location.js`  
  Handles GPS permission requests, current location, location watching, and distance calculations

- `routeSteps.js`  
  Converts route waypoint IDs into readable step-by-step directions

## Technologies Used

- React Native
- Expo
- Expo Camera
- Expo Location
- JavaScript
- JSON for campus and course data

## Project Structure

```text
src/
  components/
    DirectionArrow.jsx

  data/
    campusData.json
    courseData.json

  pages/
    NavigationPage.jsx
    SearchPage.jsx

  utils/
    buildGraph.js
    dijkstra.js
    findCourse.js
    findRoom.js
    location.js
    navigation.js
    pathfinding.js
    qrPayload.js
    routeSteps.js

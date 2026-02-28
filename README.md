# PSUAbingtonWaypoints
AR app for PSU Abington Waypoints. Designed with new students in mind. 


# 3. Features (Requirement Specification)

This section describes the core features of the Campus AR Wayfinding System and explains how each feature directly addresses specific user needs identified in the problem statement. The system is designed to reduce confusion, improve navigation efficiency, and support users navigating unfamiliar campus buildings.

## 3.1 Classroom Search and Selection
The system allows users to search for a destination by selecting a campus building and entering a classroom number. Each classroom is associated with a predefined indoor waypoint and floor number.

User Need Addressed:
This feature addresses the need for a simple and direct way to locate classrooms without requiring users to interpret campus maps or signage manually.

## 3.2 Outdoor Navigation to Campus Buildings
When the user is outdoors, the system uses GPS-based location services to guide them toward the selected building. A directional arrow and distance indicator are displayed to assist the user in reaching the correct building entrance.

User Need Addressed:
This feature helps users unfamiliar with campus layout reach the correct building efficiently, reducing anxiety and time spent searching for entrances.

## 3.3 Indoor Localization Using QR Codes
Since GPS is unreliable indoors, the system uses QR-code–based localization to determine the user’s indoor position. QR codes placed at entrances, stairwells, and major hallway intersections allow the system to identify the user’s current building, floor, and waypoint.

User Need Addressed:
This feature solves the problem of inaccurate indoor positioning by providing a reliable and repeatable method for determining location inside buildings without requiring additional hardware.

## 3.4 Waypoint-Based Indoor Routing
Indoor navigation is implemented using a waypoint-based routing model derived from vector-based floor plans. The system computes the shortest walkable path between the user’s current waypoint and the destination waypoint.

User Need Addressed:
This feature ensures users are guided along efficient and realistic walking paths, reducing unnecessary detours and helping them arrive at their destination quickly.

## 3.5 AR-Inspired Directional Guidance
The system provides AR-inspired guidance through directional arrows, distance indicators, and step-by-step instructions displayed on a guidance screen or camera overlay. Directions are updated based on the user’s heading and the next waypoint in the route.

User Need Addressed:
This feature reduces cognitive load by presenting clear, intuitive directions, allowing users to navigate without constantly stopping to read maps or signs.

## 3.6 Optional Minimap for User Orientation
An optional minimap can be accessed when users feel uncertain or disoriented. The minimap displays a simplified floor layout and highlights the planned route from the user’s last confirmed location to the destination.

User Need Addressed:
This feature supports users who prefer visual confirmation of their route and provides reassurance when directions alone are insufficient.

## 3.7 Multi-Floor Navigation Support
The system supports navigation across multiple floors by guiding users to stairways or elevators when a floor change is required. Users confirm their new floor location by scanning a QR code before navigation continues.

User Need Addressed:
This feature addresses confusion related to floor transitions, a common problem in large academic buildings with similar layouts across floors.

## 3.8 Distance and Progress Feedback
Throughout navigation, the system continuously displays distance information, including distance to the building, distance to the next waypoint, and distance to the final destination.

User Need Addressed:
This feature helps users understand their progress and manage time expectations, reducing stress when navigating to time-sensitive locations such as classes or meetings.

## 3.9 Lost User Assistance
If a user is unsure of their indoor location and cannot immediately access a QR code, the system provides fallback assistance such as entering a nearby classroom number or accessing the minimap to infer their approximate position.

User Need Addressed:
This feature ensures that navigation can continue even when users are disoriented, preventing frustration and abandonment of the application.

## 3.10 Scalability and Extensibility
The system is designed to be data-driven, allowing new buildings, floors, classrooms, and points of interest to be added without modifying core application logic.

User Need Addressed:
This feature ensures long-term usability and adaptability of the system as campus infrastructure changes or expands.


## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

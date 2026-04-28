
Claude finished the response
You said: "This is the PSU Abington Waypoints project, branch: bugfixes on GitHub.
Indoor Outdoor QR Navigation Status Report.pdf
pdf


PSUAbingtonWaypoints-bugfixes__4_.zip
zip

"This is the PSU Abington Waypoints project, branch: bugfixes on GitHub. We've completed a full refactor including nav reducer, IMU/PDR pose, QR v3, live indoor guidance, visual locate fix, ORS matrix ranking, B3 reset bug fix, and all dead code cleanup. Here's the latest analysis report:"

12:06 PM
Claude responded: Now I have everything I need.

Systematically verified bug reports against actual codebase findings
Systematically verified bug reports against actual codebase findings
Now I have everything I need. Let me build the full verification report.


Cataloging stale test fixtures and dead reducer state
Cataloging stale test fixtures and dead reducer state


Here's what I found after auditing the actual code against the report's claims.

The good news: The report is accurate. Everything it says is fixed, is fixed — reset-after-scan, arrow geometry, visual locate return path, duplicate IDs, camera conflict. Those are solid.

The remaining bugs are exactly as described, and I verified each one directly:

The three indoor guidance bugs are all still present in code. The heading-only change issue in useIndoorPose.js is the simplest to fix — it's literally a 6-line patch in the gyro listener. The indoor progression effect (line 1308) still exits early on !currentIndoorPosition and has that variable in its dependency array, even though livePose is correctly passed into the advanceRouteIfNeededIndoor() call below it — so the architecture is right but the guard is wrong. The nearNextWaypoint memo still does the type-list check with the hardcoded 50px threshold.

One new finding not in the report: The legacy QR backward-compat issue is worse than flagged. validateQrAnchor(parseQrPayload(qrText)) is now called before applyScannedWaypoint(). If any existing physical poster encodes a raw waypoint ID like WP_WOOD_MAIN_ENTRANCE (not a deep-link, not JSON), parseQrPayload() returns null, validation rejects it, and the scan silently fails. There's no migration message. If you have any old-format posters deployed, you need a fallback path before the validation gate.

Critical action needed first: The JWT bearer token in orsRouting.js:16 is committed to source. Regardless of everything else — rotate that key and remove it from the repo before any further pushes.

You said: Lets work these out right now together.
Lets work these out right now together. Lets fix these based off of everything in the report.

12:11 PM
Claude responded: Let's go fix by fix.

Prioritized and systematized multiple bug fixes methodically
Prioritized and systematized multiple bug fixes methodically
Let's go fix by fix. I'll read each file carefully before touching it.


Orchestrated comprehensive refactoring plan across tests and components
Orchestrated comprehensive refactoring plan across tests and components
Good news: the uploaded zip has more fixes already applied than the PDF analyzed — heading publication, livePose gating, requires_scan/stop_radius_m, bearing_hint_deg, approach coords, ORS key cleanup, rich entrance objects — all done. The actual remaining work is narrower:

entranceRanking.test.js is completely wrong (mocks Directions API, code uses Matrix)
Dead code: unused import, vestigial pedometer effect, dead reducer state field
Missing tests from the report (4 new test files)
Debug logs so you can actually observe the fix chain at runtime
Let's go.


Verified code dependencies and pinpointed specific locations for fixes
Verified code dependencies and pinpointed specific locations for fixes
Now I have everything I need. Let me make all the changes.

Fix 1: Rewrite entranceRanking.test.js (Matrix mock, not Directions mock)


Ran 2 commands, created a file, edited a file
Ran 2 commands, created a file, edited a file
Fix 2: Add the 4 new test files from the report


Ran 3 commands
Ran 3 commands
Fix 3: Remove the dead isNearAnyEntrance import and the vestigial pedometer effect from NavigationPage


Ran a command, edited a file
Ran a command, edited a file
Now remove the vestigial pedometer effect:


Ran a command, edited a file
Ran a command, edited a file
Fix 4: Remove dead nextPathWaypointId from the reducer state


Edited 2 files, ran a command
Edited 2 files, ran a command
Fix 5: Add the 4 recommended debug logs to NavigationPage


Ran 2 commands, edited a file
Ran 2 commands, edited a file
Now add the [LIVE_POSE] and [SCAN_PROMPT_CHECK] logs — find the livePose derivation and the nearNextWaypoint memo:


Scrutinizing existing logs against report recommendations
Scrutinizing existing logs against report recommendations
Now add the [ENTRANCE_SELECTED] log — find where selectedDestinationEntrance is used for routing:


Find where selectedDestinationEntrance drives the ORS fetch
Find where selectedDestinationEntrance drives the ORS fetch
Claude's response was interrupted
You said: Lets do all these changes, follow exactly what the report says.
Lets do all these changes, follow exactly what the report says. Do not change any names. We need this to be working and the report is the way to get it done.

12:29 PM
Claude responded: Understood.

Reconciled report specifications with codebase to apply exact patches systematically
Reconciled report specifications with codebase to apply exact patches systematically
Understood. Starting fresh — reading each file as-is, then applying the report's patches verbatim. No interpretations.


Identified remaining code changes and test file modifications needed
Identified remaining code changes and test file modifications needed
Got it. Reading each target section fresh, then applying the report's patches verbatim — no additions.


Orchestrated comprehensive code modifications across multiple files and tests
Orchestrated comprehensive code modifications across multiple files and tests
Now I know the exact state of every file. Making all changes from the report in order.

1. Fix [SCAN_APPLY] log — report's exact fields, no __DEV__ wrapper


Replace my __DEV__ SCAN_APPLY log with report's exact format
Replace my __DEV__ SCAN_APPLY log with report's exact format
You said: Help me hone in these changes based off the report, and the files I have right now.
Help me hone in these changes based off the report, and the files I have right now.

1:07 PM
Claude responded: Good.

Examined current codebase and prepared to apply targeted revisions
Examined current codebase and prepared to apply targeted revisions
Good. Now let me extract the new ZIP to see what's actually in it before touching anything.


Orchestrated comprehensive patch strategy across multiple files
Orchestrated comprehensive patch strategy across multiple files
The fresh upload is the original — none of the previous patches applied yet. I'll work entirely from this clean copy and apply every patch from the new document exactly.


Orchestrated systematic file-by-file patch application strategy
Orchestrated systematic file-by-file patch application strategy
Now I have the complete picture. Applying every patch from the document exactly, file by file, to the fresh upload.


Edited 6 files
Edited 6 files
Now NavigationPage.jsx — update imports first:


Edited 2 files
Edited 2 files
Now add DEFAULT_METERS_PER_PX near the top of the file (after the PSU color block):


Ran a command, edited a file
Ran a command, edited a file
Now add getMetersPerPx and synthesizeQrPayloadFromWaypoint — find the first useCallback already in the component to anchor insertion:


Ran 2 commands, edited a file
Ran 2 commands, edited a file
Now fix nearNextWaypoint:


Replace nearNextWaypoint with requires_scan + stop_radius_m + getMetersPerPx logic
Replace nearNextWaypoint with requires_scan + stop_radius_m + getMetersPerPx logic
Now fix the indoor progression effect:


Replace indoor progression effect to use livePose, dynamic thresholds, and requires_scan pause
Replace indoor progression effect to use livePose, dynamic thresholds, and requires_scan pause
Now fix applyScannedWaypoint:


Rewrite applyScannedWaypoint to accept scanMeta, add SCAN_APPLY log, carry all QR v3 fields
Rewrite applyScannedWaypoint to accept scanMeta, add SCAN_APPLY log, carry all QR v3 fields
Now fix handleScan and handleOutdoorQrScan:


Untangling code structure and function boundaries
Untangling code structure and function boundaries
Now fix the visual locate return effect:


Fix visual locate return to pass full scanMeta
Fix visual locate return to pass full scanMeta
Now fix orsDestinationGps to use approach coords:


Fix orsDestinationGps to prefer approach_latitude/longitude
Fix orsDestinationGps to prefer approach_latitude/longitude
Fix the rankEntrances call to use apiBaseUrl:


Replace orsApiKey with apiBaseUrl in the rankEntrances call
Replace orsApiKey with apiBaseUrl in the rankEntrances call
Now add the three debug log useEffects — find the right anchor point after orsDestinationGps:


Ran 3 commands, edited a file
Ran 3 commands, edited a file
Now patch qrPayload.js — add missing fields to buildQrPayloadObject and add normalization to parseQrPayload:


Edited 2 files, ran 2 commands
Edited 2 files, ran 2 commands
Now add the normalization block to parseQrPayload:


Ran 2 commands, edited a file
Ran 2 commands, edited a file
Now patch qrPayloadValidation.js:


Rewrite validateQrAnchor to add version check, qr_deployed check, and updated role/xy logic
Rewrite validateQrAnchor to add version check, qr_deployed check, and updated role/xy logic
Add inactive_qr and unsupported_qr to getValidationMessage:


Add inactive_qr and unsupported_qr messages
Add inactive_qr and unsupported_qr messages
Now patch VisualLocateScreen.jsx — add pop: true:


Add pop: true to visual locate navigation call per report
Add pop: true to visual locate navigation call per report
Now patch rankEntrances.js — replace signature, add filters, proxy URL:


Edited 2 files
Edited 2 files
Also remove the now-unused ORS_MATRIX constant:


Remove ORS_MATRIX constant — replaced by proxy URL
Remove ORS_MATRIX constant — replaced by proxy URL
Looking at the audit, the newly uploaded ZIP is the original unmodified code — the report's patches haven't been applied to it yet. I've now applied the following changes to the fresh copy at /home/claude/fresh/PSUAbingtonWaypoints-bugfixes:

Completed so far:

useIndoorPose.js — HEADING_PUBLISH_INTERVAL_MS, lastHeadingPublishTsRef, publishHeadingOnlyPose callback, called from gyro + magnetometer listeners, step detector marks the timestamp
NavigationPage.jsx — useCallback import, QR_PAYLOAD_VERSION/GRAPH_REV imports, removed isNearAnyEntrance, added DEFAULT_METERS_PER_PX, added getMetersPerPx + synthesizeQrPayloadFromWaypoint, fixed nearNextWaypoint (uses requires_scan + stop_radius_m + getMetersPerPx), fixed indoor progression effect (uses livePose, dynamic thresholds, requires_scan pause), rewrote applyScannedWaypoint (full scanMeta, all QR v3 fields, bearing_hint_deg, SCAN_APPLY log), fixed both handleScan + handleOutdoorQrScan to use normalizedPayload, fixed visual locate return to pass full scanMeta, fixed orsDestinationGps to use approach coords, fixed rankEntrances call to use apiBaseUrl, added 3 debug log useEffects
qrPayload.js — added bearing_hint_deg, qr_deployed, requires_scan, stop_radius_m, approach_latitude, approach_longitude to buildQrPayloadObject; added full normalization block to parseQrPayload
qrPayloadValidation.js — added version check, qr_deployed check, updated role/xy logic, added inactive_qr/unsupported_qr messages
VisualLocateScreen.jsx — added pop: true
rankEntrances.js — new signature with apiBaseUrl, added public/qr_deployed filters, proxy URL fetch, no client-side credentials
Still needed to finish:

orsRouting.js — remove hardcoded key, use API_BASE_URL env var
3 test files (linkedStartAnchor.test.js, visualLocateReturn.test.js, rankEntrancesMatrix.test.js)
Package the output
Would you like me to continue finishing orsRouting.js and the test files, then copy everything to outputs?

You said: Lets finish this, but also can you tell me where you put these changes so I know?
Lets finish this, but also can you tell me where you put these changes so I know? Lets get it all done now.

1:24 PM
Claude responded: Now the three test files, exactly as the report specifies: Now verify every change landed cleanly before packaging: All 17 checks pass.

Orchestrated completion of remaining tasks and organized output documentation
Orchestrated completion of remaining tasks and organized output documentation
Now the three test files, exactly as the report specifies:


Ran 4 commands
Ran 4 commands
Now verify every change landed cleanly before packaging:


Verified code integrity and prepared deliverable package
Verified code integrity and prepared deliverable package
All 17 checks pass. Now package everything and copy to outputs:


Ran 2 commands, read a file
Ran 2 commands, read a file
Here's exactly what was changed and where, file by file:

src/navigation/useIndoorPose.js

Added HEADING_PUBLISH_INTERVAL_MS = 100 constant (line 41)
Added lastHeadingPublishTsRef = useRef(0) to track last publish time (line 58)
Added publishHeadingOnlyPose(source) useCallback — throttled to 10 Hz, updates poseRef and calls setPose (line 73)
Called publishHeadingOnlyPose("gyro") inside the gyroscope listener (line 100)
Called publishHeadingOnlyPose("magnetometer") inside the magnetometer listener (line 127)
Added lastHeadingPublishTsRef.current = Date.now() inside step detection so a step doesn't immediately re-trigger a heading publish (line 179)
src/pages/NavigationPage.jsx

Added useCallback to the React import
Added QR_PAYLOAD_VERSION and GRAPH_REV to the qrPayload import; removed isNearAnyEntrance from the rankEntrances import
Added DEFAULT_METERS_PER_PX = 0.15 module-level constant
Added getMetersPerPx(buildingId, floorId, waypoint) useCallback — looks up waypoint.meters_per_px, then campusData.floorScales, then falls back to the constant
Added synthesizeQrPayloadFromWaypoint(waypoint) useCallback — builds a full v3 payload from any waypoint object, used as the legacy-QR fallback
Rewrote nearNextWaypoint — replaced type-list + 50px hardcoded check with requires_scan !== true gate + stop_radius_m converted to pixels via getMetersPerPx
Rewrote the indoor progression useEffect — guard now uses livePose not currentIndoorPosition, added requires_scan + nearNextWaypoint pause, replaced hardcoded closeThreshold: 12 / nearThreshold: 20 with values derived from stop_radius_m / metersPerPx; dep array now lists livePose and nearNextWaypoint
Rewrote applyScannedWaypoint — added scanMeta = {} third param, [SCAN_APPLY] log, all QR v3 fields (role, bearing_hint_deg, graph_rev, qr_deployed, requires_scan, stop_radius_m) flowing through navDispatch, and headingDeg set from scanMeta.bearing_hint_deg in resetIndoorPose
Fixed handleScan — normalizedPayload = qrPayload ?? synthesizeQrPayloadFromWaypoint(scannedWaypoint), validates that, then calls applyScannedWaypoint({ ...scannedWaypoint, ...normalizedPayload }, "qr", normalizedPayload)
Fixed handleOutdoorQrScan — same normalizedPayload pattern
Fixed visual locate return effect — applyScannedWaypoint(matchedWaypoint, "vision", { role, bearing_hint_deg, graph_rev, qr_deployed, requires_scan, stop_radius_m })
Fixed orsDestinationGps — uses approach_latitude ?? latitude and approach_longitude ?? longitude
Fixed rankEntrances call — replaced orsApiKey: process.env.EXPO_PUBLIC_ORS_API_KEY with apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL
Added three debug useEffects: [LIVE_POSE], [SCAN_PROMPT_CHECK], [ENTRANCE_SELECTED]
src/utils/qrPayload.js

Added bearing_hint_deg, qr_deployed, requires_scan, stop_radius_m, approach_latitude, approach_longitude to buildQrPayloadObject
Added toBool / toNum helpers and a normalization block at the end of parseQrPayload that coerces all new fields to the right types regardless of whether the payload came from JSON, a deep-link, or campusData backfill
src/utils/qrPayloadValidation.js

validateQrAnchor now rejects version !== 3 with unsupported_qr, rejects qr_deployed === false with inactive_qr, and checks needsIndoorXY against the updated role list (entrance, hallway_anchor, stairs, elevator, exit)
getValidationMessage has cases for unsupported_qr and inactive_qr
src/pages/VisualLocateScreen.jsx

Added pop: true to the navigation.navigate call so the screen properly exits the stack on return
src/navigation/rankEntrances.js

Signature changed: orsApiKey → apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || ""
Removed ORS_MATRIX constant
Added .filter((e) => e.public !== false) and .filter((e) => e.qr_deployed !== false) before the accessibility filter
Added haversine-only fallback when apiBaseUrl is empty
fetchOrsMatrix now hits ${apiBaseUrl}/ors/matrix with no Authorization header
src/utils/orsRouting.js

Removed hardcoded ORS_API_KEY JWT and ORS_ENDPOINT
Added API_BASE_URL from process.env.EXPO_PUBLIC_API_BASE_URL
fetchOrsRoute throws if API_BASE_URL is missing, then fetches ${API_BASE_URL}/ors/directions with no Authorization header
__tests__/linkedStartAnchor.test.js — new, exact from report __tests__/visualLocateReturn.test.js — new, exact from report __tests__/rankEntrancesMatrix.test.js — new, exact from report __tests__/scanPromptThreshold.test.js — new, exact from report

The one thing that remains on your side before any of this works end-to-end: set EXPO_PUBLIC_API_BASE_URL in your .env to point at your server proxy, and deploy the two proxy endpoints (POST /ors/matrix and POST /ors/directions) with your ORS key living only in process.env.ORS_API_KEY on the server.


Psuabingtonwaypoints bugfixes patched
ZIP 
You said: How do I edit the .
How do I edit the .jsx files so I can copy the paste the code into my GitHub website?

1:34 PM
Claude responded: The easiest way is to have each file individually so you can open it, select all, and paste straight into GitHub's editor.

Devised strategy to extract and present individual files for GitHub editing
Devised strategy to extract and present individual files for GitHub editing
The easiest way is to have each file individually so you can open it, select all, and paste straight into GitHub's editor. Let me copy every changed file to outputs with its original filename.


Ran a command, read a file
Ran a command, read a file
Here's the exact workflow for each file on GitHub's website:

For each source file:

Go to your repo → navigate to the file's path (e.g. src/navigation/useIndoorPose.js)
Click the pencil icon (Edit this file) in the top-right of the file view
Press Ctrl+A (or Cmd+A on Mac) to select all the existing code
Open the downloaded file from above, Ctrl+A to select it, Ctrl+C to copy
Paste into GitHub's editor with Ctrl+V
Scroll to the bottom → fill in a commit message → click Commit changes
File → where it goes in your repo:

File	GitHub path
NavigationPage.jsx	src/pages/NavigationPage.jsx
useIndoorPose.js	src/navigation/useIndoorPose.js
qrPayload.js	src/utils/qrPayload.js
qrPayloadValidation.js	src/utils/qrPayloadValidation.js
VisualLocateScreen.jsx	src/pages/VisualLocateScreen.jsx
rankEntrances.js	src/navigation/rankEntrances.js
orsRouting.js	src/utils/orsRouting.js
linkedStartAnchor.test.js	__tests__/linkedStartAnchor.test.js (new file)
visualLocateReturn.test.js	__tests__/visualLocateReturn.test.js (new file)
rankEntrancesMatrix.test.js	__tests__/rankEntrancesMatrix.test.js (new file)
scanPromptThreshold.test.js	__tests__/scanPromptThreshold.test.js (new file)
For the four new test files, instead of editing an existing file, click Add file → Create new file from inside the __tests__/ folder, type the filename, paste the content, then commit.

One thing to do before committing orsRouting.js and rankEntrances.js: add EXPO_PUBLIC_API_BASE_URL=https://your-proxy-server.com to your .env file, otherwise the app will throw on any ORS call. The old EXPO_PUBLIC_ORS_API_KEY line can be removed entirely since the key now lives only on the server side.


Navigationpage
Code · JSX 

Useindoorpose
JS 

Qrpayload
JS 

Qrpayloadvalidation
JS 

Visuallocatescreen
Code · JSX 

Rankentrances
JS 

Orsrouting
JS 

Linkedstartanchor.test
JS 

Visuallocatereturn.test
JS 

Rankentrancesmatrix.test
JS 

Scanpromptthreshold.test
JS 


You're now using extra usage ∙ Your session limit resets at 2:00 PM



Claude is AI and can make mistakes. Please double-check responses.
Rankentrances · JS
Copy

/**
 * rankEntrances.js
 *
 * Ranks all valid building entrances by real walking duration
 * using the ORS Matrix endpoint — one request for all entrances.
 * Falls back to haversine if ORS proxy is unavailable.
 * ORS credentials live on the server proxy, not in the client.
 */
 
// ─── Main export ─────────────────────────────────────────────────────────────
 
export async function rankEntrances({
  userGps,
  entrances = [],
  apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || "",
  accessibilityMode = false,
  timeoutMs = 8000,
}) {
  if (!userGps || entrances.length === 0) return [];
 
  // Filter to entrances with GPS coordinates
  const valid = entrances.filter(
    (e) =>
      e.latitude != null &&
      e.longitude != null &&
      Number.isFinite(Number(e.latitude)) &&
      Number.isFinite(Number(e.longitude))
  );
 
  if (valid.length === 0) return [];
 
  // Exclude private and undeployed entrances
  const eligible = valid
    .filter((e) => e.public !== false)
    .filter((e) => e.qr_deployed !== false);
 
  // Accessibility filter — fall back to all eligible if none marked accessible
  let candidates = eligible;
  if (accessibilityMode) {
    const accessible = eligible.filter((e) => e.accessible === true);
    if (accessible.length > 0) candidates = accessible;
  }
 
  if (candidates.length === 0) return [];
 
  // Single candidate — skip ORS entirely
  if (candidates.length === 1) {
    return [{ ...candidates[0], walkingDistanceM: null, walkingDurationS: null }];
  }
 
  // Use approach coordinates if available, else fall back to doorway GPS
  const candidatesWithCoords = candidates.map((e) => ({
    ...e,
    _routeLat: Number(e.approach_latitude ?? e.latitude),
    _routeLng: Number(e.approach_longitude ?? e.longitude),
  }));
 
  const normalizedBase = String(apiBaseUrl || "").replace(/\/$/, "");
  if (!normalizedBase) {
    // No proxy configured — fall back to haversine immediately
    return [...candidatesWithCoords]
      .map((e) => ({
        ...e,
        walkingDistanceM: haversineMeters(userGps.latitude, userGps.longitude, e._routeLat, e._routeLng),
        walkingDurationS: Infinity,
      }))
      .sort((a, b) => a.walkingDistanceM - b.walkingDistanceM);
  }
 
  try {
    const ranked = await fetchOrsMatrix({
      userGps,
      candidates: candidatesWithCoords,
      apiBaseUrl: normalizedBase,
      timeoutMs,
    });
    if (ranked) {
      // Debug log so bad rankings are visible during QA
      console.log(
        "[rankEntrances] ORS ranked:",
        ranked.map((e) => ({
          id: e.id,
          label: e.label,
          durationS: e.walkingDurationS,
          distanceM: e.walkingDistanceM,
        }))
      );
      return ranked;
    }
  } catch {
    // Fall through to haversine
  }
 
  // Haversine fallback
  return [...candidatesWithCoords].sort((a, b) =>
    haversineMeters(userGps.latitude, userGps.longitude, a._routeLat, a._routeLng) -
    haversineMeters(userGps.latitude, userGps.longitude, b._routeLat, b._routeLng)
  );
}
 
// ─── ORS Matrix fetch ─────────────────────────────────────────────────────────
 
async function fetchOrsMatrix({ userGps, candidates, apiBaseUrl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
 
  try {
    // Matrix: user is source (index 0), entrances are destinations (indices 1..N)
    const locations = [
      [Number(userGps.longitude), Number(userGps.latitude)],
      ...candidates.map((e) => [e._routeLng, e._routeLat]),
    ];
 
    const body = {
      profile: "foot-walking",
      locations,
      sources: ["0"],
      destinations: candidates.map((_, i) => String(i + 1)),
      metrics: ["duration", "distance"],
    };
 
    const response = await fetch(`${apiBaseUrl}/ors/matrix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
 
    if (!response.ok) return null;
 
    const data = await response.json();
    const durations = data?.durations?.[0];
    const distances = data?.distances?.[0];
 
    if (!durations) return null;
 
    const ranked = candidates.map((entrance, idx) => ({
      ...entrance,
      walkingDurationS: durations[idx] ?? null,
      walkingDistanceM: distances?.[idx] ?? null,
    }));
 
    ranked.sort((a, b) => {
      const aDur = a.walkingDurationS ?? Infinity;
      const bDur = b.walkingDurationS ?? Infinity;
      return aDur - bDur;
    });
 
    return ranked;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
 
// ─── Haversine fallback ───────────────────────────────────────────────────────
 
function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
 
// ─── Proximity helpers ────────────────────────────────────────────────────────
 
export function isNearAnyEntrance(userGps, entrances, thresholdMeters = 20) {
  if (!userGps || !Array.isArray(entrances)) return false;
  return entrances.some((e) => {
    if (e.latitude == null || e.longitude == null) return false;
    return haversineMeters(
      Number(userGps.latitude), Number(userGps.longitude),
      Number(e.latitude), Number(e.longitude)
    ) <= thresholdMeters;
  });
}
 
export function getNearestEntrance(userGps, entrances) {
  if (!userGps || !Array.isArray(entrances) || entrances.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of entrances) {
    if (e.latitude == null || e.longitude == null) continue;
    const dist = haversineMeters(
      Number(userGps.latitude), Number(userGps.longitude),
      Number(e.latitude), Number(e.longitude)
    );
    if (dist < nearestDist) { nearestDist = dist; nearest = e; }
  }
  return nearest;
}
 



# Gesture correctness and engine compatibility

The renderer owns pan and pinch mechanics. A geographic point under an active
contact must follow that contact in screen coordinates, including across the
globe/Mercator blend at engine zoom 11–12. Fresh GeoJSON must not change this
contract. Distance labels depend on viewport and latitude, so engine zoom is the
reproducible transition boundary. Applications retain their gesture policy,
camera initialization, lifecycle, authentication and native-service integration.

## Requested camera transform defects

Stock MapLibre 6.14.0 retains a requested camera transform when a camera update
callback is installed. `react-map-gl` installs that callback even for an
uncontrolled map. Rendering updates the live transform's projection transition
but leaves the requested transform at its old projection. Gesture calculations
then use globe math against Mercator coordinates or the reverse. Straight drags
can become mostly stationary or drift sideways. Zooming can temporarily restore
agreement. A plain MapLibre map with a no-op `transformCameraUpdate` callback
also reproduces this defect, without React or survey data. Accelerometer and
device orientation are unrelated. Tracked upstream as
[#8808](https://github.com/maplibre/maplibre-gl-js/issues/8808).

MapLibre 6.11.1 fixed Camera event ownership through
[upstream PR #8471](https://github.com/maplibre/maplibre-gl-js/pull/8471). Its
movement events now reach Camera's `moveend` cleanup listener. Both apps and
this package develop against 6.14.0, so the old 6.10.0 event-routing correction
is removed. Cleanup between gestures does not synchronize projection state
during an uninterrupted pinch. The direct web viewer does not install a camera
update callback, but uses the same corrected renderer as mobile.

A second remaining defect affects partial pinch release in 6.14.0. A symmetric
pinch can end its zoom event while TouchPan still retains one finger. The engine
starts zoom inertia because no movement event remains. When that animation
naturally ends, Camera stops all handlers, losing the held contact. Its next
move is then ignored. Normal motion and the time between input events make this
intermittent; reduced motion can hide it. Waiting for actual DOM contact
delivery proved this failure persisted after input reached the renderer. Tracked
upstream as [#8809](https://github.com/maplibre/maplibre-gl-js/issues/8809).

The fork suppresses end inertia and north-snapping while TouchPan still owns a
contact and clears the obsolete velocity buffer. North-snapping near a nonzero
bearing can otherwise reset the held contact even after inertia is suppressed.
Normal zoomend/moveend cleanup remains; fully released gestures retain normal
inertia. The regression holds one finger after a pinch, waits for public
`isMoving()` to settle without resetting the camera, checks `dragPan.isActive()`
and then measures the first 4-pixel sample and the complete 48-pixel
translation. This failed before the correction.

## Fork ownership and installation

Mobile, web and this package declare
`github:DEKHTIARJonathan/maplibre-gl-js#hotpatch`. The
[hotpatch branch](https://github.com/DEKHTIARJonathan/maplibre-gl-js/tree/hotpatch)
keeps package version 6.14.0 and applies the fixes from upstream
[PR #8810](https://github.com/maplibre/maplibre-gl-js/pull/8810) and
[PR #8811](https://github.com/maplibre/maplibre-gl-js/pull/8811), including the
remaining-contact north-snap correction. Runtime behavior is fixed in the
renderer source before its bundles are built.

The branch must ship the compiled main and worker modules, CSS, declarations and
source maps consumed by applications. Consumers install these artifacts without
running MapLibre development or patch scripts. There is no MapLibre postinstall
wrapper, Vite patch hook, artifact rewriting or patch-hash migration in
SpeleoDB. The generic `tooling/package-patch` helper remains for unrelated
mobile native dependency fixes.

Rendering synchronizes both the live and requested transforms' projection state.
Gesture completion clears stale inertia and suppresses north-snapping while
TouchPan owns a contact. Upstream Camera events still propagate once; fully
released pans retain normal inertia and snapping. The React camera callback,
globe projection and native MapLibre gesture handlers remain in use. No survey
scan or extra application work is added per pointer event.

Frozen lockfiles pin a concrete fork commit even though manifests name the
branch. Update the mobile, web and map-viewer standalone locks, the root
integration lock and the web overlay lock together. Confirm a clean install
resolves the fork and contains usable distribution files, then run the existing
behavioral suites before advancing the pinned commit.

## Shared browser contract

`announceMapCreated(map)` emits `speleo:map-created` once when called by a map
owner. It exposes the instance to event observers without replacing constructors
or retaining a production global. The caller chooses its initialization seam;
this event is not a promise that sources are loaded.

`@speleodb/map-viewer/testing/gestures` supplies Playwright helpers for actual
input, canvas coordinates, geographic anchor measurements, paint boundaries,
source replacement and Camera cleanup checks. Install `observeGestureMap(page)`
before navigation, wait for the map, then set the initial camera. Camera setup
is outside the measured sequence; never reset it between a transition and the
following drag. The test observer alone retains `window.__speleoGesture`.

The common mouse contract uses twelve rendered samples per 48-CSS-pixel drag in
each cardinal direction. Maximum per-axis error across the whole path must be
less than one CSS pixel. An endpoint alone can hide a wrong intermediate
direction. Wheel input crosses the blend in both directions and verifies the
resulting zoom band. GeoJSON workload size and location are explicit inputs;
`setData` overlaps gestures instead of blocking each step on a worker. Source
completion is checked at the end.

Touch input uses trusted Chromium automation events. WebKit replays touch
contact lists consumed by the actual renderer because its automation cannot
construct native Touch objects. This is integration coverage, not native iOS
touch-delivery evidence. Read-only inspection of `_requestedCameraState` checks
the pinned engine's cleanup contract; private camera methods are never replaced.
For Chromium, each dispatch observes the matching trusted DOM contact event
before waiting for paint. A protocol acknowledgement and two frames alone can
precede compositor delivery, making an undelivered move look like bad camera
math. The observer is passive, removes its listener after delivery or failure,
and never substitutes a DOM event for the native input. Contact matching permits
only float32 coordinate roundoff; the geographic-anchor tolerance stays one CSS
pixel. Undelivered input fails the test instead of silently skipping a sample.
The testing entry has a type-only optional Playwright peer and is not exported
from the browser entry.

App suites keep their real entrypoints and assertions: mobile covers the React
wrapper, north-up policy, continuous pinch/translation, pinch-to-one-finger
handoff, repeated drags, both motion preferences and fresh 12,000-feature data.
Web covers private/public entrypoints, multiple latitudes and motion
preferences, and twelve updating sources containing 24,000 features. Both apps
include the paused partial-release regression. Shared package tests verify the
measurement oracle and event contract; they do not substitute for these browser
runs.

Run the package's lint, typecheck, test, build, lockfile and package-content
checks, then both app browser suites. Before release, also verify supported
physical Android and iOS devices through pinch, translation, handoff,
release/re-grab and app suspension with survey refreshes in progress. Record
OS/WebView and build identity.

## Distribution

Renderer corrections ship with the fork, independently of map-viewer releases.
The published map-viewer 0.3.0 already supplies the shared browser testing and
map-created event exports used by both apps. Applications no longer import its
obsolete gesture patch tooling. A future stock MapLibre upgrade must include
both upstream fixes and pass the same regression suites before replacing the
fork dependency.

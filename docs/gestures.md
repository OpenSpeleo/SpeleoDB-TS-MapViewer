# Gesture correctness and engine compatibility

The renderer owns pan and pinch mechanics. A geographic point under an active
contact must follow that contact in screen coordinates, including across the
globe/Mercator blend at engine zoom 11–12. Fresh GeoJSON must not change this
contract. Distance labels depend on viewport and latitude, so engine zoom is the
reproducible transition boundary. Applications retain their gesture policy,
camera initialization, lifecycle, authentication and native-service integration.

## Requested camera transform defects

MapLibre 6.10.0 retains a requested camera transform when a camera update
callback is installed. `react-map-gl` installs that callback even for an
uncontrolled map. Rendering updates the live transform's projection transition
but leaves the requested transform at its old projection. Gesture calculations
then use globe math against Mercator coordinates or the reverse. Straight drags
can become mostly stationary or drift sideways. Zooming can temporarily restore
agreement. This affects mouse input in the mobile app's desktop browser as well
as touch input; accelerometer and device orientation are unrelated.

A second 6.10.0 defect retains the requested transform after non-inertial
gestures: HandlerManager emits movement events directly on Map, bypassing
Camera's `moveend` cleanup listener. Inertial animation sometimes clears it,
making release timing and motion preferences relevant. GeoJSON replacement
changes timing but is not required to reproduce either defect.

The direct MapLibre 6.14.0 web viewer does not install a camera update callback
and did not reproduce that projection corruption in its private or public mouse
entrypoints. 6.14.0 corrects event ownership, but installing a callback can
still expose the requested-projection mismatch during an uninterrupted pinch. An
upgrade alone does not prove both defects fixed.

A third defect affects partial pinch release in both 6.10.0 and 6.14.0. A
symmetric pinch can end its zoom event while TouchPan still retains one finger.
The engine starts zoom inertia because no movement event remains. When that
animation naturally ends, Camera stops all handlers, losing the held contact.
Its next move is then ignored. Normal motion and the time between input events
make this intermittent; reduced motion can hide it. Waiting for actual DOM
contact delivery proved this failure persisted after input reached the renderer.

The shared fix suppresses end inertia while TouchPan still owns a contact and
clears the obsolete velocity buffer. Normal zoomend/moveend cleanup remains;
fully released gestures retain normal inertia. The regression holds one finger
after a pinch, waits for public `isMoving()` to settle without resetting the
camera, checks `dragPan.isActive()` and then measures the first 4-pixel sample
and the complete 48-pixel translation. This failed before the correction.

## Explicit installation backport

`patchMapLibre(packageRoot)` from
`@speleodb/map-viewer/tooling/maplibre-gestures` owns exact-version backports
for 6.10.0 and 6.14.0. Its source-equivalent corrections are:

```ts
// Map._render: synchronize both transforms' projection context.
this._camera.transform.setTransitionState(
  this.style.projection?.transitionState,
);
this._camera._requestedCameraState?.setTransitionState(
  this.style.projection?.transitionState,
);

// HandlerManager in 6.10.0: both _fireEvent and direct non-inertial moveend.
this._camera.fire(new MapMovementEvent(/* existing event arguments */));

// HandlerManager in both versions: do not animate away a held contact.
const inertialEase = this._handlersById.touchPan.isActive()
  ? (this._inertia.clear(), undefined)
  : this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions);
```

Camera events propagate to Map once. The fix retains the React camera callback,
globe projection, natural inertia and MapLibre gesture handlers. It adds one
guarded call per render, without scanning survey data or adding application work
per pointer event. Applications do not mutate private renderer state at runtime
or reset the camera to recover a gesture.

The installer checks the exact version and original/patched SHA-256 hashes of
both development and production ESM artifacts and maps before any write. It
composes source maps, atomically replaces files without modifying Bun's
hardlinked package cache, and resumes a partially applied patch. Unknown
versions or contents fail closed. The upstream TypeScript sources remain
original; the patch targets the ESM artifacts actually consumed by Vite.

The package never applies the patch automatically. Mobile invokes it from its
postinstall wrapper and Vite configuration, which also covers existing workspace
installs that skip a changed lifecycle script. Web invokes the same entry from
postinstall and Vite for its 6.14.0 partial-release correction; it does not
receive the 6.10.0-specific edits. `writePackagePatch` in the sibling
`tooling/package-patch` entry provides the same atomic cache-safe replacement
for consumer-owned installation patches.

Tooling imports Node-compatible filesystem APIs, MagicString and remapping.
These entries are separate from the browser entry; application bundles must
never import them. An engine upgrade must remove or rebase the guarded backport
and pass the same behavioral tests.

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

Artifact tests verify hash admission, source-map locations, idempotence, partial
installation recovery, preflight failure and cache isolation. Run the package's
lint, typecheck, test, build, lockfile and package-content checks, then both app
browser suites. Before release, also verify supported physical Android and iOS
devices through pinch, translation, handoff, release/re-grab and app suspension
with survey refreshes in progress. Record OS/WebView and build identity.

## Distribution

New tooling, testing and behavior exports require a new map-viewer release.
Publish and verify that shared version before advancing application exact pins
and standalone locks, then refresh integration and web-overlay locks. A local
workspace or packed candidate proves implementation compatibility, not the
presence of these exports in the previously published `0.2.0` package. Keep
release actions separate from local implementation and validation.

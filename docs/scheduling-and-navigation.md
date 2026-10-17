# Scheduling, navigation and camera presentation

The package supplies reusable mechanisms without an application singleton,
framework, network layer or configuration dependency. Each application owns its
instances, map lifecycle, budgets, panel layout and entity selection policy.

## Paint and update scheduling

`createPaintScheduler` from `@speleodb/map-viewer/update-scheduler` returns a
function that schedules work and returns a cancellation function. It waits for
two animation frames so a rendering opportunity can occur between input and map
work. Its default `afterPaintTask: true` then uses a future task. Web uses this
default and does not set a stalled-frame deadline.

Mobile uses `afterPaintTask: false` and `fallbackMs: 100` to apply on the second
frame or after 100 ms when a WebView stops delivering frames. Its `canUseFrames`
callback also checks document visibility. A false result uses a future task
immediately. The package default checks only whether animation frames exist, so
the application chooses its hidden-document behavior. `requestFrame` and
`scheduleTask` are optional scheduling ports returning cancellation functions;
callbacks must execute asynchronously. They permit deterministic clock tests
without replacing browser globals. Cancellation removes frames, tasks and the
fallback; late callbacks cannot apply work twice.

`createViewerUpdateScheduler({ budget, ...options })` owns one serial queue of
map updates. Network requests run outside this queue. Every scheduled job has
its own paint boundary, even when earlier jobs have already painted. A new job
with the same string or object key supersedes older work. Jobs use
`context.isCurrent()` after asynchronous work, `context.shouldYield()` to check
the caller's current millisecond budget, and `await context.yield()` to give
input another turn and learn whether the job is still current.

Results have `applied`, `superseded`, `cancelled` or `failed` status. Failed
results retain the exact thrown value in `error`, including falsey values.
Cancellation settles the result and releases a pending paint gate; it cannot
interrupt a running JavaScript callback or an arbitrary awaited promise.
`whenIdle()` waits for those running callbacks to return as well as draining the
queue. Reporter exceptions and rejected reporter promises cannot stop
independent jobs or leak unhandled failures. An asynchronous `onError` reporter
runs independently; the queue and its idle state do not wait for reporting to
complete.

Call `cancelAll()` when the map owner tears down. Queues do not share mutable
state. The default `yieldViewerWork()` uses the browser scheduling API when
available and otherwise a zero-delay task; it never substitutes a resolved
promise for a real input opportunity.

## Camera intent

`createMapNavigation()` from `@speleodb/map-viewer/navigation` creates one
navigation owner. `begin(map, entityKey)` returns an intent whose `isCurrent()`
method allows a deferred camera operation only while that intent and map remain
current. Starting another intent invalidates the previous one across all entity
types. `cancel(key)` invalidates only that entity's active intent; `cancel()`
invalidates it unconditionally.

The narrow structural map port uses public `movestart` subscription methods. An
event with `originalEvent` invalidates pending navigation so a subsequent data
completion cannot override the user's camera gesture. Programmatic movement
alone does not invalidate it. `reset(map)` detaches the prior map and installs
the new subscription; `reset()` releases the subscription on teardown. An absent
map never produces a current intent. Independent owners remain isolated even
when they observe the same map.

## Globe styles and visible camera bounds

`normalizeGlobeStyle(style)` from `@speleodb/map-viewer/style` shallow-copies
the style root, forces MapLibre's globe projection, and removes provider
`center`, `zoom`, `bearing`, `pitch` and `roll`. Sources, layers, metadata and
provider or cache URLs retain their identity and values. The application retains
camera ownership across initial loading and later style changes. Style
downloading, provider selection and cache lifecycle remain application
responsibilities.

`computeCameraPadding(map, viewport, { padding, marginRatio, obstacles })` from
`@speleodb/map-viewer/camera-padding` computes transient padding around the
visible intersection of two rectangles. Rectangles use one coordinate system.
For each ordered obstacle, it keeps the largest rectangular remainder while
preserving clearance from earlier obstacles. Ties choose the first candidate;
this is a bounded per-panel algorithm, not a global polygon optimization. Empty
or external obstacles are ignored. A fully occluding obstacle retains the
previous region because no usable remainder exists. An empty map/viewport
intersection returns the caller's numeric padding fallback.

The caller supplies a nonnegative padding cap and a margin ratio below one half.
Web supplies its configured 50-pixel cap and 0.1 ratio, with rectangles from its
visual viewport and editor/panel selectors. Mobile supplies its visible-height
rectangle and 0.25 ratio. DOM measurement, selectors, padding policy, dateline
bounds normalization and `fitBounds` options stay in the app.

## Verification boundaries

The package tests deterministic frame/task ports, per-job paint gates,
coalescing, cooperative yielding, cancellation and failure containment. Camera
intent tests use MapLibre's actual `Evented` implementation and verify listener
removal and instance isolation. Style tests preserve frozen provider inputs and
source/layer identity. Camera padding tests cover occlusions, viewport offsets,
small dimensions, ordered cuts and caller policy.

Application tests retain singleton ownership, entity visibility policy, map
lifecycle and DOM integration. Real-browser gesture suites additionally measure
projected geographic anchors while panning across globe/Mercator transitions;
these unit tests do not replace renderer-level coverage.

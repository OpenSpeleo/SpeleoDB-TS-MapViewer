# Shared map boundaries

Reusable behavior belongs to the lowest package that can describe it without
application state. A mechanism can belong in a library even when only one app
currently needs it. Consumers supply explicit policies, narrow public renderer
ports and lifecycle ownership; shared code never branches on an app name.

| Owner              | Responsibilities                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| map-core           | Geometry validation primitives, geographic and coordinate bounds, distances, nearest candidates, depth arithmetic, cooperative traversal, bounded JSON transport, model colors and visibility calculations         |
| map-viewer         | MapLibre expressions/layers/assets, atmosphere, hit-query rectangles, paint scheduling, keyed update queues, navigation-intent invalidation, camera padding, globe-style normalization and map-created observation |
| map-viewer tooling | Version/hash-guarded engine backports, source-map composition and atomic package-file replacement; explicit installation calls only                                                                                |
| map-viewer testing | Real browser input, geographic-anchor measurement, transition checks and synthetic GeoJSON refresh workload; separate from production imports                                                                      |
| Applications       | Authentication, API/cache/worker lifecycle, permissions, framework state, DOM layout, native integration, configured gesture/fit policies and user-facing failure handling                                         |

Both applications consume the same browser gesture contract while retaining
their actual entrypoint suites. Library tests own portable algorithms and races;
app tests own configuration, adapters and lifecycle integration. Removing the
app suites would lose evidence about React camera ownership, public/private web
startup, native service integration and real source publication.

## Policies that must stay explicit

Mobile waits two frames with a stalled-frame deadline and visibility gate. Web
adds a future task after the second frame and owns a configured serial update
queue. The shared scheduler accepts both policies. It does not import React or
web configuration and does not introduce a cross-map singleton.

Mobile's north-up lock, disabled discrete tap zoom and background lifecycle
differ from the web editor's gesture/tool ownership. Startup differs too: web
sets its initial camera after installing the globe style, while mobile must
preserve the React wrapper's camera and intervening user input. Shared style
normalization removes provider camera metadata; app lifecycle callbacks retain
those distinct responsibilities.

Map-core distinguishes permissive camera coordinate accumulation from strict
directed-arc coverage. Web can trust top-level bbox metadata and normalize
wrapped longitudes; mobile validates actual positions and rejects malformed
survey data with app-specific footprint limits. Shared arithmetic must not
silently change those admission rules. The web depth/snap/altitude preparation
pass feeds shared bounds during its existing traversal instead of rescanning a
large GeoJSON object.

## Further extraction criteria

Provider catalogs and raster builders have reusable pieces, but their full
managers also encode different native/display zoom limits, offline availability,
label retention and cache policy. A shared builder should accept those choices
explicitly; moving an entire manager or applying one app's defaults to the other
would hide behavior changes. Tile fingerprint handling likewise has different
failure policies: mobile rejects unsafe cache payloads, while web can continue
without an available digest.

Measurement arc sampling, dateline/polar clipping and surface picking are
additional portable candidates. Their numerical tolerances, segment counts,
round-trip checks and rejected-click behavior need named contracts and tests
before moving them. Provider URL normalization is a suitable optional renderer
entry when separated from token retrieval and provider UI. These remaining
candidates mean this boundary is not a claim that every possible extraction is
finished. Consolidation should reduce duplicated behavior while retaining
observable contracts and bounded work.

## Distribution and verification

Shared source exports must be released before application exact registry pins
and standalone locks advance. Update the root integration and web-container
overlay locks as part of that dependency handoff. Workspace overrides do not
make unreleased exports available to standalone registry consumers. Test packed
candidates outside the monorepo to distinguish implementation compatibility from
publication readiness.

The browser entry exports no installation tooling or Playwright code. Tooling
and testing have explicit subpaths, and Playwright is an optional type-only
peer. Check package contents, independent frozen installation, library
lint/types/tests and browser compilation, then the apps' complete unit and
browser gates. Physical Android/iOS verification remains necessary for native
input arbitration and suspension; desktop browser automation cannot establish
those properties.

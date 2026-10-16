# Rendering ownership

This package holds rendering behavior shared by SpeleoDB's web and mobile apps.
It produces GL layer specifications and expressions without constructing maps,
fetching resources or owning framework lifecycle. The web adapter applies the
specifications imperatively; mobile binds them through `react-map-gl` with every
`Layer` directly under its owning `Source`.

Source IDs, geometry revisions, source lifetime, visibility intent, ordering,
camera effects, authentication and persistence belong to the consumer. Common
builders accept those identities and policies explicitly. They never branch on
an application name. Vector builders support both per-record and aggregate
sources without changing geometry or requiring a shared source registry.

The line-width interpolation and zero-simplification source policy are shared.
Apps retain close-up widths and any overview offset. Depth color construction
accepts the property's name, ramp stops, transfer function, zero-domain handling
and fallback: different current depth semantics remain visible in app code.
Shared filters normalize numeric feature IDs and the historical null/missing
sensor category; category and project gates compose without copying GeoJSON.

Seven identical map icons are distributed under `assets/`. The explicit `icons`
entry resolves their bundled URLs; callers own registration, error handling and
style reload. Importing expression/specification helpers does not initialize a
renderer or load icon resources.

## GIS aliases

`createGeometryLabelLayer` consumes the Point features produced by map-core's
`createGeometryLabelFeature`. Each point retains `id`, `alias`, `color`, and
`geometry_type`. Applications own the derived source and regenerate it only when
geometry/metadata changes. The label layer combines its nonempty-alias filter
with the consumer's per-record visibility filter. Its visibility flag combines
the saved label preference and the geometry category gate.

Polygon labels use a centered anchor. Line labels use a bottom anchor with a
small upward offset, with rotation and pitch aligned to the viewport. Both use
contrast halos and allow overlap, so another symbol cannot silently hide an
enabled alias. Very small polygons may have text wider than their footprint; the
anchor remains inside the polygon. Aliases never enter HTML. A single point per
geometry avoids tile-local line/polygon labeling changing its logical anchor or
repeating labels.

## Selectable landmark icons

The `landmark-icons` browser entry owns shared SVG assets and one image registry
per map. `LANDMARK_ICON_URLS` supplies CSS-mask previews for all five choices.
Each SVG's viewBox controls its artwork scale within the common 32-unit raster
canvas, with a two-unit contrast halo. DEFAULT uses a filled triangle; NOGO uses
a circle-free cross. The shared image scale applies to every choice; the
original `▼` glyph remains the loading/failure fallback. `createLandmarkLayers`
keeps the marker and name layer identities; a single marker layer chooses image
or triangle text according to the registered image IDs.

`createLandmarkIconRegistry(map, onChange)` returns `prepare(data)`,
`getAvailableImageIds()`, and `dispose()`. It reads `icon` and
`collection_color` without mutating source data. Missing/unknown icons become
DEFAULT in both the registry and layer image expression. Six-digit hex colors
are normalized to lowercase with `#94a3b8` fallback. The existing
white-collection halo policy is shared: white uses `#0f172a`, other colors use
white. The image key contains icon, normalized color, and halo, and the layer
expression computes the same key. Arbitrary CSS colors are not accepted as
collection model colors.

The registry decodes each SVG mask once and rasterizes it at 3× resolution. It
caches the mask's expanded halo and tints ordinary RGBA pixels for each current
icon/color pair. These are registered with `pixelRatio: 3` and `sdf: false`; the
source SVGs are not signed distance fields. This avoids runtime font
dependencies for custom artwork and requires no SDF-generation pipeline. Bundled
URLs work in native offline builds; anonymous CORS is requested before loading
images so CDN-hosted web assets can be read by canvas. Asset servers must
provide the normal cross-origin asset response headers.

Concurrent requests share pending work. The newest requested landmark set
controls publication, and obsolete color variants are removed. Loading failure
keeps the triangle and allows a later refresh to retry. `style.load` restores
the currently used cached pixels synchronously without another decode or network
request. Disposing removes owned images and listeners; map removal detaches
without accessing the destroyed style. Async decoding cannot publish after
disposal. The public `getStyle()` probe also protects disposal initiated by an
application's earlier `remove` listener, after MapLibre clears its style. The
consumer's callback refreshes layer specifications using the available IDs; it
does not call `prepare` recursively.

Unit tests evaluate image keys and zoom sizing with the actual MapLibre style
engine and exercise mask/color caching, tint/halo pixels, reload, failure,
latest-request behavior, and teardown. Browser checks must additionally cover
real SVG decoding, glyph/image rendering, picking through the existing marker
ID, style replacement, and both supported application engine versions.

Package tests evaluate production expressions with the actual MapLibre style
engine, including malformed shot colors, linear/square-root depth policies, zero
domains, bounds and category filters. Layer tests verify source bindings,
available-image admission and visibility composition. App tests establish actual
renderer and framework lifecycle behavior; mock specification tests alone do not
prove a map rendered correctly.

## Globe atmosphere

`attachGlobeAtmosphere(map)` installs SpeleoDB's dark space, static star field,
white outer rim and subtle inner haze. Call it once for a MapLibre map and
retain its returned disposer for component teardown. It also detaches on
`map.remove()`. It can attach before the initial style exists and waits for
`style.load` without querying style readiness prematurely. The
`GlobeAtmosphereMap` port contains only public MapLibre APIs; the helper never
changes the camera, projection, sources, requests, attribution or existing layer
order. Apps retain their own globe projection and initial France camera.

A single custom WebGL2 layer sits below the first symbol layer and above base
imagery. Consumers with an explicit foreground anchor can supply
`{ beforeId: anchorId }` so atmosphere stays below every foreground overlay,
including styles without labels. If the anchor has not mounted yet, the helper
uses the first symbol layer (or appends to a bare raster style); consumers must
mount their anchor and overlays above the atmosphere. Its fullscreen triangle
reconstructs camera rays and the unit globe using the public
`CustomRenderMethodInput.projectionMatrix` and
`defaultProjectionData.mainMatrix`. This follows the actual perspective,
rotation, pitch, padding and viewport; there is no guessed screen-space circle.
Only three vertices are submitted. Stars are generated deterministically in the
fragment shader without textures, network access or feature iteration. Rendering
occurs only when MapLibre repaints; there are no timers or animation loops.

Native sky remains responsible for the high-zoom horizon. The helper sets its
sky/horizon colors to `#121218` and disables native `atmosphere-blend`, whose
fixed blue atmosphere would otherwise paint over the white rim. Other sky
settings survive. Disposal restores the previous sky if another owner has not
changed it. The custom effect fades over the final five percent of globe
projection weight and submits no draw in Mercator, avoiding an incorrect
spherical silhouette over the interpolated planar map. Style replacement
reattaches the layer and retains the newly loaded sky's unrelated settings.

Programs and vertex arrays are released by the custom layer's `onRemove`; shader
objects are released after linking, including partial compilation failure.
MapLibre 6.10 destroys the style on WebGL context loss and reloads it after
restoration, so the same `style.load` listener rebuilds all GPU resources. The
map's `remove` event only detaches listeners because its style is already gone.
No application methods are called on the destroyed map.

The public projection contracts are documented in
[CustomRenderMethodInput](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CustomRenderMethodInput/)
and
[ProjectionData](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/ProjectionData/).
Lifecycle and transition unit tests supplement actual browser validation; they
do not substitute for rendering checks of halo alignment, navigation, style
replacement and context recovery.

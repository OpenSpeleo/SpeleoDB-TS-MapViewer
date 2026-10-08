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
`map.remove()`. The `GlobeAtmosphereMap` port contains only public MapLibre
APIs; the helper never changes the camera, projection, sources, requests,
attribution or existing layer order. Apps retain their own globe projection and
initial France camera.

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

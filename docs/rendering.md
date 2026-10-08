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

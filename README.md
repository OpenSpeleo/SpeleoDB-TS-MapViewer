# @speleodb/map-viewer

Shared MapLibre expressions, layer specifications, camera/scheduling mechanisms,
gesture compatibility, globe atmosphere, and marker assets for the SpeleoDB web
and mobile applications. The applications own map creation, source registration,
renderer lifecycle, network access, and UI state. This package has no React,
Capacitor, Django, or application singleton dependency.

Reuse `createPaintScheduler`, `createViewerUpdateScheduler`,
`createMapNavigation`, `normalizeGlobeStyle`, and `computeCameraPadding` for
renderer behavior with explicit app policies. See
[scheduling and navigation](docs/scheduling-and-navigation.md). The
[shared ownership boundary](docs/shared-boundaries.md) explains app policies,
data contracts and remaining extraction criteria. The isolated
`testing/gestures` entry owns the browser regression harness and is not imported
by the browser entry. Renderer fixes live in the MapLibre fork. See
[gesture contracts and renderer distribution](docs/gestures.md).

Import expression/layer builders from `@speleodb/map-viewer`, icon URLs from
`@speleodb/map-viewer/icons`, and assets through
`@speleodb/map-viewer/assets/*`. See
[rendering contracts and ownership](docs/rendering.md) for the API design and
behavioral boundaries. Core domain calculations belong to `@speleodb/map-core`.
Attach the shared dark space, stars and white globe halo with
`attachGlobeAtmosphere(map)` and call its disposer when the map owner unmounts.
Mobile, web and this package use MapLibre 6.14.0 from
[`DEKHTIARJonathan/maplibre-gl-js#hotpatch`](https://github.com/DEKHTIARJonathan/maplibre-gl-js/tree/hotpatch).
The fork contains the projection and pinch-release fixes; frozen locks pin its
resolved commit. The MapLibre peer range remains `>=6.14.0 <7.0.0`, and this
package does not bundle a second renderer or modify installed renderer files.
Renderer updates must pass the gesture regression suites.

GIS alias points from `@speleodb/map-core/geometry-labels` are rendered with
`createGeometryLabelLayer`. It centers polygon labels and places horizontal line
labels just above their midpoint. Consumers pass their visibility filter and
persist the label preference.

For selectable landmark artwork, import `LANDMARK_ICON_URLS` and
`createLandmarkIconRegistry` from `@speleodb/map-viewer/landmark-icons`. Create
one registry per map, call `prepare(featureCollection)` when landmark data
changes, and pass `getAvailableImageIds()` to `createLandmarkLayers` as
`availableIconIds`. Its change callback refreshes those specifications after
artwork loads or the style changes; it must not recursively call `prepare`. Call
`dispose()` when the map owner unmounts. Icon choices use the shared SVG URLs as
CSS masks colored with the landmark collection color. All five choices,
including the default triangle, use the same image sizing and contrast halo. The
original triangle glyph remains a fallback while artwork is unavailable.

## Development and distribution

Use the Bun version in `.bun-version`. In a standalone clone, install
dependencies with `bun install --frozen-lockfile`; in the monorepo, run
`bun run install:local` from the root.

Run `prek run -a` from this package to check file hygiene, Prettier formatting,
ESLint, the standalone Bun lockfile, TypeScript types and source compilation. No
Git hook installation is needed. Prettier fixes formatting; rerun the checks
after reviewing its changes.

Individual checks are available as `bun run lint`, `bun run format:check`,
`bun run check:lockfile`, `bun run typecheck`, and `bun run test`. Use
`bun run lint:fix` or `bun run format` to apply fixes. The lockfile check uses a
temporary standalone directory so the parent workspace cannot hide missing or
stale dependencies. CI also runs unit tests and checks package contents.

`bun run test` runs the configured Vitest suite; `bun test` selects Bun's
separate built-in test runner. CI runs both commands to verify the complete
library suite with both runners.

Package exports point directly to `src/*.ts`, including type exports. Bun can
execute these sources; web and mobile compile them in their normal Vite builds.
Both standalone installs and monorepo links use source. The `speleodb-source`
condition remains in the development configuration only for compatibility with
older core Git pins. `bun run build` smoke-tests browser compilation with Bun;
its disposable `dist/` output is ignored and excluded from the package.

The package is configured for public npm publication as `@speleodb/map-viewer`.
Its source repository is
[SpeleoDB-TS-MapViewer](https://github.com/OpenSpeleo/SpeleoDB-TS-MapViewer).
There are no automatic install, preparation, or build lifecycle hooks. Its
`@speleodb/map-core` runtime dependency accepts npm versions `>=0.2.0 <1.0.0`.
Standalone CI uses the registry version recorded in the frozen Bun lockfile;
root integration projects the dependency to the live local core workspace before
resolution.

The landmark icon additions require the corresponding map-core release. Before
publishing them, raise this package's minimum core version and refresh its
standalone lock after that core version is available. Applications then update
their exact shared package pins and standalone locks. Workspace overrides alone
do not establish compatibility with older published core versions.

Source, assets, and the AGPL-3.0 license travel together. Preserve the original
source comments and asset notices. Regenerate the standalone and integration
locks together when updating dependencies.

## npm releases

A pushed `v<package.json version>` tag runs the full CI verification and then
builds and publishes the package with npm trusted publishing. The publish job
requires the tag to match the package version. Configure `@speleodb/map-viewer`
on npmjs.com with a GitHub Actions trusted publisher for organization
`OpenSpeleo`, repository `SpeleoDB-TS-MapViewer`, workflow filename `ci.yml`,
environment name `publish`, label `github`, and permission to run `npm publish`.
The job uses GitHub OIDC; no npm write token is needed.

## Locking inside the monorepo

Run `bun run lock` here to resolve only this package's standalone `bun.lock`.
Use `bun run lock --upgrade` to refresh direct and transitive resolutions within
the existing manifest constraints. Both delegate to the monorepo's shared
`utilities/bun-lock/lock.mjs`, using external temporary staging without
installing dependencies or running lifecycle scripts. Only the child lock is
published after success; refresh the root integration lock separately.

This convenience command requires the monorepo. In a standalone clone, use
`bun install --lockfile-only --ignore-scripts`. Existing standalone lock checks,
builds and CI remain independent of the shared utility.

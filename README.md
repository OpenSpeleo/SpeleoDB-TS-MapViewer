# @speleodb/map-viewer

Shared MapLibre expressions, layer specifications, globe atmosphere, and marker
assets for the SpeleoDB web and mobile applications. The applications own map
creation, source registration, renderer lifecycle, network access, and UI state.
This package has no React, Capacitor, Django, or application singleton
dependency.

Import expression/layer builders from `@speleodb/map-viewer`, icon URLs from
`@speleodb/map-viewer/icons`, and assets through
`@speleodb/map-viewer/assets/*`. See
[rendering contracts and ownership](docs/rendering.md) for the API design and
behavioral boundaries. Core domain calculations belong to `@speleodb/map-core`.
Attach the shared dark space, stars and white globe halo with
`attachGlobeAtmosphere(map)` and call its disposer when the map owner unmounts.
Both applications supply MapLibre 6.10.0 and core through explicit dependencies;
this package declares compatible peers and does not bundle a second renderer.

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

Package exports point directly to `src/*.ts`, including type exports. Bun can
execute these sources; web and mobile compile them in their normal Vite builds.
Both standalone installs and monorepo links use source. The `speleodb-source`
condition remains in the development configuration only for compatibility with
older core Git pins. `bun run build` smoke-tests browser compilation with Bun;
its disposable `dist/` output is ignored and excluded from the package.

The package is distributed from
[SpeleoDB-TS-MapViewer](https://github.com/OpenSpeleo/SpeleoDB-TS-MapViewer)
through full commit SHA dependencies, **never published to npm**. The manifest
intentionally remains private. There are no automatic install, preparation, or
build lifecycle hooks. Its core development dependency pins a published
[SpeleoDB-TS-MapCore](https://github.com/OpenSpeleo/SpeleoDB-TS-MapCore) commit.
Standalone CI checks the Git pin before its frozen Bun install; root integration
projects the dependency to the live local core workspace before resolution.

Source, assets, and the AGPL-3.0 license travel together. Preserve the original
source comments and asset notices. Update dependency pins only to commits that
are reachable from the public repositories, and regenerate the standalone and
integration locks together.

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

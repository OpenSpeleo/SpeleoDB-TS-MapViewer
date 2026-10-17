import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import MagicString from "magic-string";
import remapping from "@jridgewell/remapping";
import { writePackagePatch } from "./package-patch.js";

// A narrowly pinned engine backport, not a runtime mutation of map internals.
// See docs/gestures.md for the source-level changes and removal gate.
export interface GesturePatchArtifact {
  name: string;
  original: string;
  originalMap: string;
  patched: string;
  patchedMap: string;
  edits: readonly (readonly [before: string, after: string, count: number])[];
}

export const gesturePatchVersions: Readonly<
  Record<string, readonly GesturePatchArtifact[]>
> = {
  "6.10.0": [
    {
      name: "maplibre-gl.mjs",
      original:
        "454e0bbb16c721cfbf952a92ff3e4362130346ed59a5bff56ae5d6fbebb651f7",
      originalMap:
        "2edf94a8d18f4f6da1a51a978e0d6adf76b7d80b7dbbae986d8e48760a4918a5",
      patched:
        "1038184a5bf35471486f3acfdae47fd633735ce2e151e7804af36bbf9b2c1b2c",
      patchedMap:
        "934696bc442cef06efc02ae3038aecd8a57fe1f6a53008884aeb35da3d043643",
      edits: [
        [
          "this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          "this._handlersById.touchPan.isActive()?(this._inertia.clear(),undefined):this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          1,
        ],
        [
          "this._camera.transform.setTransitionState(this.style.projection?.transitionState)",
          "this._camera.transform.setTransitionState(this.style.projection?.transitionState),this._camera._requestedCameraState?.setTransitionState(this.style.projection?.transitionState)",
          1,
        ],
        ["this._map.fire(new K(", "this._camera.fire(new K(", 2],
      ],
    },
    {
      name: "maplibre-gl-dev.mjs",
      original:
        "c515d05286ffeec24e79a43bd78775de392add60064e1cb9c4766c19d52f8c96",
      originalMap:
        "b377fe19e82f71871ed5bb99833243380cfcfa058d4360a72988a15c8005045f",
      patched:
        "3deac448fc0a9dc189f27c65b73ba730f165a1e6fceb5c808cdefc6d0dc0569a",
      patchedMap:
        "947ef24bc31d8ce510174f557834e43567b6f248ab2a3438b9496eddc6743288",
      edits: [
        [
          "this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          "this._handlersById.touchPan.isActive()?(this._inertia.clear(),undefined):this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          1,
        ],
        [
          "this._camera.transform.setTransitionState(this.style.projection?.transitionState);",
          "this._camera.transform.setTransitionState(this.style.projection?.transitionState);\n\t\tthis._camera._requestedCameraState?.setTransitionState(this.style.projection?.transitionState);",
          1,
        ],
        [
          "this._map.fire(new MapMovementEvent(",
          "this._camera.fire(new MapMovementEvent(",
          2,
        ],
      ],
    },
  ],
  "6.14.0": [
    {
      name: "maplibre-gl.mjs",
      original:
        "244d36122c1398da3a8259817cc6d71e04321afe6404f32606b4b6c6cc4f26fb",
      originalMap:
        "6c1fc9a644bebfdad1f655fdd5122bad50f36595d69236eadb35c0f3213618d0",
      patched:
        "4f7a34ad146e250976e8bc3721f0c7cdd2c97585e15d11c84f9a3d52a5099708",
      patchedMap:
        "b75296313987d368ffb3e69c3b9c79f9757084228145822de06f799ecda46c55",
      edits: [
        [
          "this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          "this._handlersById.touchPan.isActive()?(this._inertia.clear(),undefined):this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          1,
        ],
      ],
    },
    {
      name: "maplibre-gl-dev.mjs",
      original:
        "3db405e92e7993a83a79974b2e73760f80cce8b133a8602ed6f33375f345a034",
      originalMap:
        "9db0cd405997620e23f615b13ed22be35e4542deffdd640662b5cb5a104c180c",
      patched:
        "f908645bb931f49bd8cab1ce0a2a73fca5fc20bdfdc6dc86c586ac2e22f46aa3",
      patchedMap:
        "7fef1764ad35e5e13561fc156da77271ca243720b69f98ef2fd278bc798e8de6",
      edits: [
        [
          "this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          "this._handlersById.touchPan.isActive()?(this._inertia.clear(),undefined):this._inertia._onMoveEnd(this._map.dragPan._inertiaOptions)",
          1,
        ],
      ],
    },
  ],
};

export const sha256 = (text: string) =>
  createHash("sha256").update(text).digest("hex");

/** Preserve the upstream source mappings after editing either compiled ESM entry. */
export function transformArtifact(
  source: string,
  sourceMap: string | null,
  artifact: GesturePatchArtifact,
) {
  const edited = new MagicString(source);
  for (const [before, after, count] of artifact.edits) {
    const matches = [
      ...source.matchAll(
        new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      ),
    ];
    if (matches.length !== count)
      throw new Error(
        `[maplibre-patch] ${artifact.name}: expected ${count} matches for ${before}, found ${matches.length}.`,
      );
    for (const match of matches)
      edited.overwrite(match.index, match.index + before.length, after);
  }
  const code = edited.toString();
  // The old map still describes the original upstream sources. Compose it with
  // our edit map instead of leaving every subsequent minified column incorrect.
  const map =
    sourceMap === null
      ? null
      : JSON.stringify(
          remapping(
            [
              JSON.parse(
                edited
                  .generateMap({ source: artifact.name, hires: true })
                  .toString(),
              ),
              JSON.parse(sourceMap),
            ],
            () => null,
          ),
        );
  return { code, map };
}

export function patchMapLibre(packageRoot: string): number {
  const { version } = JSON.parse(
    readFileSync(path.join(packageRoot, "package.json"), "utf8"),
  );
  if (!Object.hasOwn(gesturePatchVersions, version))
    throw new Error(
      `[maplibre-patch] Review the gesture backport before upgrading MapLibre ${version}; supported versions: ${Object.keys(gesturePatchVersions).join(", ")}.`,
    );

  // Validate and prepare every output before writing anything. Both states of
  // each file are accepted so an interrupted installation can safely resume.
  const artifacts = gesturePatchVersions[version]!;
  const outputs: [string, string][] = [];
  for (const artifact of artifacts) {
    const codePath = path.join(packageRoot, "dist", artifact.name);
    const mapPath = `${codePath}.map`;
    let source = readFileSync(codePath, "utf8");
    const sourceMap = readFileSync(mapPath, "utf8");
    const codeHash = sha256(source);
    const mapHash = sha256(sourceMap);
    if (
      ![artifact.original, artifact.patched].includes(codeHash) ||
      ![artifact.originalMap, artifact.patchedMap].includes(mapHash)
    ) {
      throw new Error(
        `[maplibre-patch] Unexpected contents for ${artifact.name}. Reinstall the pinned package; never silently bypass this patch.`,
      );
    }
    if (codeHash === artifact.patched && mapHash === artifact.patchedMap)
      continue;
    if (codeHash === artifact.patched) {
      for (const [before, after] of artifact.edits)
        source = source.split(after).join(before);
      if (sha256(source) !== artifact.original)
        throw new Error(
          `[maplibre-patch] Could not recover original ${artifact.name}.`,
        );
    }
    const { code, map } = transformArtifact(
      source,
      mapHash === artifact.originalMap ? sourceMap : null,
      artifact,
    );
    if (
      sha256(code) !== artifact.patched ||
      (map !== null && sha256(map) !== artifact.patchedMap)
    ) {
      throw new Error(
        `[maplibre-patch] Unexpected output for ${artifact.name}; review the patch tooling.`,
      );
    }
    if (codeHash !== artifact.patched) outputs.push([codePath, code]);
    if (map !== null) outputs.push([mapPath, map]);
  }
  for (const [file, contents] of outputs) writePackagePatch(file, contents);
  return outputs.length;
}

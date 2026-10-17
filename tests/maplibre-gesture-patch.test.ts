import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  copyFileSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import os from "node:os";
import MagicString from "magic-string";
import remapping from "@jridgewell/remapping";
import {
  gesturePatchVersions,
  patchMapLibre,
  sha256,
  transformArtifact,
} from "../src/tooling/maplibre-gestures.js";

describe.each(Object.entries(gesturePatchVersions))(
  "MapLibre %s",
  (version, artifacts) => {
    const directories: string[] = [];
    let fixtureRoot: string;
    beforeAll(() => {
      fixtureRoot = copyPackage(
        path.resolve(
          version === "6.10.0"
            ? "node_modules/maplibre-gl"
            : "node_modules/maplibre-gl-current",
        ),
      );
      patchMapLibre(fixtureRoot);
    });
    afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));
    afterEach(() => {
      for (const directory of directories.splice(0))
        rmSync(directory, { recursive: true, force: true });
    });

    function copyPackage(sourceRoot: string) {
      const root = mkdtempSync(
        path.join(os.tmpdir(), "speleodb-maplibre-patch-"),
      );
      mkdirSync(path.join(root, "dist"));
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ version }),
      );
      for (const { name } of artifacts) {
        for (const suffix of ["", ".map"])
          copyFileSync(
            path.join(sourceRoot, "dist", name + suffix),
            path.join(root, "dist", name + suffix),
          );
      }
      return root;
    }

    function packageCopy() {
      const root = copyPackage(fixtureRoot);
      directories.push(root);
      return root;
    }

    function contents(root: string) {
      return artifacts.flatMap(({ name }: { name: string }) =>
        ["", ".map"].map((suffix) =>
          readFileSync(path.join(root, "dist", name + suffix), "utf8"),
        ),
      );
    }

    describe("MapLibre gesture backport", () => {
      it("keeps both installed ESM entries and their maps pinned and is idempotent", () => {
        const root = packageCopy();
        const before = contents(root);
        const inode = statSync(path.join(root, "dist", artifacts[0]!.name)).ino;
        expect(patchMapLibre(root)).toBe(0);
        expect(contents(root)).toEqual(before);
        expect(statSync(path.join(root, "dist", artifacts[0]!.name)).ino).toBe(
          inode,
        );
        for (const artifact of artifacts) {
          expect(
            sha256(
              readFileSync(path.join(root, "dist", artifact.name), "utf8"),
            ),
          ).toBe(artifact.patched);
          expect(
            sha256(
              readFileSync(
                path.join(root, "dist", `${artifact.name}.map`),
                "utf8",
              ),
            ),
          ).toBe(artifact.patchedMap);
        }
      });

      it("resumes a partially patched installation without changing hardlinked cache files", () => {
        const root = packageCopy();
        for (const artifact of artifacts) {
          const file = path.join(root, "dist", artifact.name);
          let original = readFileSync(file, "utf8");
          for (const [before, after] of artifact.edits)
            original = original.split(after).join(before);
          expect(sha256(original)).toBe(artifact.original);
          const cache = path.join(root, artifact.name);
          writeFileSync(cache, original);
          unlinkSync(file);
          linkSync(cache, file);
        }
        expect(patchMapLibre(root)).toBe(2);
        for (const artifact of artifacts) {
          expect(
            sha256(readFileSync(path.join(root, artifact.name), "utf8")),
          ).toBe(artifact.original);
          expect(
            sha256(
              readFileSync(path.join(root, "dist", artifact.name), "utf8"),
            ),
          ).toBe(artifact.patched);
        }
        expect(patchMapLibre(root)).toBe(0);
      });

      it("rejects a changed package version before writing anything", () => {
        const root = packageCopy();
        const before = contents(root);
        writeFileSync(
          path.join(root, "package.json"),
          JSON.stringify({ version: "6.15.0" }),
        );
        expect(() => patchMapLibre(root)).toThrow(
          "Review the gesture backport",
        );
        expect(contents(root)).toEqual(before);
      });

      it.each(["", ".map"])(
        "rejects unknown %s contents before modifying other artifacts",
        (suffix) => {
          const root = packageCopy();
          // Leave an earlier artifact needing work: validation of a later bad file
          // must not leave the package partially modified as a side effect.
          const pending = path.join(root, "dist", artifacts[0]!.name);
          let original = readFileSync(pending, "utf8");
          for (const [before, after] of artifacts[0]!.edits)
            original = original.split(after).join(before);
          writeFileSync(pending, original);
          const file = path.join(root, "dist", artifacts[1]!.name + suffix);
          writeFileSync(file, readFileSync(file, "utf8") + "\nchanged");
          const before = contents(root);
          expect(() => patchMapLibre(root)).toThrow("Unexpected contents");
          expect(contents(root)).toEqual(before);
        },
      );

      it.each(artifacts)(
        "composes source maps across every edit in $name",
        (artifact) => {
          const source =
            artifact.edits
              .flatMap(([before, , count]) => Array(count).fill(before))
              .join(";") + ";finish();";
          const sourceMap = new MagicString(source)
            .generateMap({
              source: "original.ts",
              includeContent: true,
              hires: true,
            })
            .toString();
          const result = transformArtifact(source, sourceMap, artifact);
          const decoded = remapping(JSON.parse(result.map!), () => null, {
            decodedMappings: true,
          });
          expect(decoded.sources).toEqual(["original.ts"]);
          expect(decoded.sourcesContent).toEqual([source]);
          // A tail location after every replacement must still point to the original
          // column, including the extra newline in the development entry.
          const prefix = result.code.slice(0, result.code.indexOf("finish()"));
          const lines = prefix.split("\n");
          const column = lines.at(-1)!.length;
          const mappings = decoded.mappings as number[][][];
          const segment = mappings[lines.length - 1]!.find(
            (segment) => segment[0] === column,
          );
          expect(segment?.slice(1)).toEqual([0, 0, source.indexOf("finish()")]);
          expect(result.code).toContain(
            "touchPan.isActive()?(this._inertia.clear(),undefined)",
          );
          if (version === "6.10.0") {
            expect(result.code).toContain(
              "_camera._requestedCameraState?.setTransitionState",
            );
            expect(result.code.match(/this\._camera\.fire/g)).toHaveLength(2);
          }
          expect(() =>
            transformArtifact(
              source + artifact.edits[0]![0],
              sourceMap,
              artifact,
            ),
          ).toThrow("expected 1 matches");
          expect(() =>
            transformArtifact("missing", sourceMap, artifact),
          ).toThrow("found 0");
        },
      );
    });
  },
);

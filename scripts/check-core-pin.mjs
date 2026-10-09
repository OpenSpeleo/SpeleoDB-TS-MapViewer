import { readFileSync } from "node:fs";

const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const core = manifest.dependencies?.["@speleodb/map-core"];
if (!/^git\+https:\/\/github\.com\/[^/]+\/[^#]+#[a-f0-9]{40}$/.test(core)) {
  console.error(
    "Standalone viewer CI requires @speleodb/map-core pinned to a public GitHub URL and full 40-character commit SHA. Update package.json and regenerate bun.lock.",
  );
  process.exitCode = 1;
}

import { describe, expect, it } from "vitest";
import { normalizeGlobeStyle } from "../src/style.js";

describe("application-owned globe styles", () => {
  it.each([{ name: "globe" }, { type: "mercator" }, undefined])(
    "normalizes provider projections while preserving sources, layers and URLs (%j)",
    (projection) => {
      const style = Object.freeze({
        version: 8,
        sources: {
          imagery: { type: "raster", tiles: ["speleo-cache://provider/tiles"] },
        },
        layers: [{ id: "labels", type: "symbol", source: "composite" }],
        glyphs: "mapbox://fonts/mapbox/{fontstack}/{range}.pbf",
        sprite: "https://provider.example/sprite",
        metadata: { provider: "example" },
        projection,
      });
      const normalized = normalizeGlobeStyle(style);
      expect(normalized).not.toBe(style);
      expect(normalized.projection).toEqual({ type: "globe" });
      expect(normalized.sources).toBe(style.sources);
      expect(normalized.layers).toBe(style.layers);
      expect(normalized.metadata).toBe(style.metadata);
      expect(normalized.glyphs).toBe(style.glyphs);
      expect(normalized.sprite).toBe(style.sprite);
      expect(style.projection).toBe(projection);
    },
  );

  it("removes all provider camera metadata without mutating the downloaded style", () => {
    const style = Object.freeze({
      version: 8,
      sources: {},
      layers: [],
      center: [55.13, 25.12],
      zoom: 12,
      bearing: 30,
      pitch: 45,
      roll: 10,
    });
    const normalized = normalizeGlobeStyle(style);
    for (const key of ["center", "zoom", "bearing", "pitch", "roll"] as const) {
      expect(normalized).not.toHaveProperty(key);
      expect(style).toHaveProperty(key);
    }
  });

  it("does not reintroduce zero-valued camera metadata on repeated style loads", () => {
    const first = normalizeGlobeStyle({
      center: [0, 0],
      zoom: 0,
      bearing: 0,
      pitch: 0,
      roll: 0,
      layers: [],
      sources: {},
    });
    const second = normalizeGlobeStyle(first);
    expect(second).toEqual(first);
    expect(second.layers).toBe(first.layers);
    expect(second.sources).toBe(first.sources);
    expect(Object.keys(second).sort()).toEqual([
      "layers",
      "projection",
      "sources",
    ]);
  });
});

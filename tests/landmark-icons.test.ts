import type { FeatureCollection } from "geojson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLandmarkIconRegistry,
  LANDMARK_ICON_URLS,
  type LandmarkIconMap,
} from "@speleodb/map-viewer/landmark-icons";
import { landmarkIconImageId } from "@speleodb/map-viewer";

class FakeImage {
  static instances: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  src = "";
  constructor() {
    FakeImage.instances.push(this);
  }
}

class ImageMap implements LandmarkIconMap {
  stylePresent = true;
  getStyle = () => (this.stylePresent ? { version: 8 } : undefined);
  images = new Set<string>();
  listeners = new Map<string, Set<() => void>>();
  hasImage = vi.fn((id: string) => this.images.has(id));
  addImage = vi.fn(
    (
      id: string,
      _image: Parameters<LandmarkIconMap["addImage"]>[1],
      _options: Parameters<LandmarkIconMap["addImage"]>[2],
    ) => {
      void _image;
      void _options;
      this.images.add(id);
    },
  );
  removeImage = vi.fn((id: string) => {
    this.images.delete(id);
  });
  on(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  off(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function data(...properties: Record<string, unknown>[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: properties.map((properties, id) => ({
      type: "Feature",
      id: String(id),
      properties,
      geometry: { type: "Point", coordinates: [0, 0] },
    })),
  };
}

beforeEach(() => {
  FakeImage.instances = [];
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", {
    createElement: () => ({
      getContext: () => ({
        drawImage: vi.fn(),
        getImageData: () => {
          const rgba = new Uint8ClampedArray(96 * 96 * 4);
          rgba[(48 * 96 + 48) * 4 + 3] = 255;
          return { data: rgba };
        },
      }),
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("shared landmark image lifecycle", () => {
  it("decodes one mask per icon, deduplicates normalized colors and creates real color pixels with contrast halos", async () => {
    const map = new ImageMap();
    const changed = vi.fn();
    const registry = createLandmarkIconRegistry(map, changed);
    const input = data(
      { icon: "CAVE", collection_color: "#12AB34" },
      { icon: "CAVE", collection_color: "#12ab34" },
      { icon: "CAVE", collection_color: "#FFFFFF" },
      { icon: "CAVE", collection_color: "invalid" },
    );
    const original = JSON.stringify(input);
    const prepared = registry.prepare(input);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]?.crossOrigin).toBe("anonymous");
    FakeImage.instances[0]!.onload!();
    await prepared;
    expect(map.addImage).toHaveBeenCalledTimes(3);
    expect(registry.getAvailableImageIds()).toEqual(
      [
        landmarkIconImageId("CAVE", "#12ab34"),
        landmarkIconImageId("CAVE", "#94a3b8"),
        landmarkIconImageId("CAVE", "#ffffff"),
      ].sort(),
    );
    const [, white, options] = map.addImage.mock.calls.find(([id]) =>
      id.includes("ffffff-0f172a"),
    )!;
    const center = (48 * 96 + 48) * 4;
    expect([...white.data.slice(center, center + 4)]).toEqual([
      255, 255, 255, 255,
    ]);
    expect([...white.data.slice(center + 4, center + 8)]).toEqual([
      15, 23, 42, 255,
    ]);
    expect(options).toEqual({ pixelRatio: 3, sdf: false });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(input)).toBe(original);
    await registry.prepare(input);
    expect(map.addImage).toHaveBeenCalledTimes(3);
    registry.dispose();
  });

  it("restores live cached pixels after style replacement without image decoding", async () => {
    const map = new ImageMap();
    const registry = createLandmarkIconRegistry(map);
    const prepared = registry.prepare(
      data({ icon: "UNKNOWN", collection_color: "#123456" }),
    );
    FakeImage.instances[0]!.onload!();
    await prepared;
    map.images.clear();
    map.emit("style.load");
    expect(map.addImage).toHaveBeenCalledTimes(2);
    expect(FakeImage.instances).toHaveLength(1);
    map.emit("style.load");
    registry.dispose();
    expect(map.images.size).toBe(0);
    expect(map.listeners.get("style.load")?.size).toBe(0);
  });

  it("publishes only the latest requested colors and removes obsolete variants", async () => {
    const map = new ImageMap();
    const registry = createLandmarkIconRegistry(map);
    const first = registry.prepare(
      data({ icon: "NOGO", collection_color: "#ff0000" }),
    );
    const second = registry.prepare(
      data({ icon: "NOGO", collection_color: "#0000ff" }),
    );
    map.emit("style.load");
    FakeImage.instances[0]!.onload!();
    await Promise.all([first, second]);
    expect(registry.getAvailableImageIds()).toEqual([
      landmarkIconImageId("NOGO", "#0000ff"),
    ]);
    expect(map.addImage).toHaveBeenCalledTimes(1);
    await registry.prepare(data());
    expect(registry.getAvailableImageIds()).toEqual([]);
    expect(map.images.size).toBe(0);
    expect(FakeImage.instances).toHaveLength(1);
    registry.dispose();
  });

  it("renders DEFAULT and legacy choices through the same sized image pipeline", async () => {
    const map = new ImageMap();
    const registry = createLandmarkIconRegistry(map);
    const prepared = registry.prepare(
      data({ icon: "DEFAULT" }, { icon: "FUTURE" }, {}, { icon: "CAVE" }),
    );
    expect(FakeImage.instances).toHaveLength(2);
    expect(FakeImage.instances[0]!.src).toBe(LANDMARK_ICON_URLS.DEFAULT);
    for (const image of FakeImage.instances) image.onload!();
    await prepared;
    expect(registry.getAvailableImageIds()).toEqual(
      ["DEFAULT", "CAVE"].map((icon) => landmarkIconImageId(icon, null)).sort(),
    );
    expect(map.addImage).toHaveBeenCalledTimes(2);
    for (const [, image, options] of map.addImage.mock.calls) {
      expect([image.width, image.height]).toEqual([96, 96]);
      expect(options).toEqual({ pixelRatio: 3, sdf: false });
    }
    registry.dispose();
  });

  it("keeps fallback triangles on decoding failure and retries on the next prepare", async () => {
    const map = new ImageMap();
    const registry = createLandmarkIconRegistry(map);
    const input = data({ icon: "ATTENTION", collection_color: null });
    const failed = registry.prepare(input);
    FakeImage.instances[0]!.onerror!();
    await failed;
    expect(registry.getAvailableImageIds()).toEqual([]);
    const retry = registry.prepare(input);
    FakeImage.instances[1]!.onload!();
    await retry;
    expect(registry.getAvailableImageIds()).toHaveLength(1);
    registry.dispose();
  });

  it.each(["dispose", "remove"])(
    "never touches the map after %s while artwork loads",
    async (action) => {
      const map = new ImageMap();
      const changed = vi.fn();
      const registry = createLandmarkIconRegistry(map, changed);
      const pending = registry.prepare(data({ icon: "CAVE" }));
      if (action === "dispose") registry.dispose();
      else map.emit("remove");
      FakeImage.instances[0]!.onload!();
      await pending;
      expect(map.addImage).not.toHaveBeenCalled();
      expect(map.hasImage).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      expect(registry.getAvailableImageIds()).toEqual([]);
      registry.dispose();
    },
  );

  it("provides picker artwork for every supported choice", () => {
    expect(Object.keys(LANDMARK_ICON_URLS)).toEqual([
      "DEFAULT",
      "CAVE",
      "UNKNOWN",
      "ATTENTION",
      "NOGO",
    ]);
    expect(
      Object.values(LANDMARK_ICON_URLS).every((url) => url.endsWith(".svg")),
    ).toBe(true);
  });

  it("can be disposed by an earlier remove listener after MapLibre has cleared the style", async () => {
    const map = new ImageMap();
    // MapCore's cleanup listener is registered before the landmark adapter.
    map.on("remove", () => registry.dispose());
    const registry = createLandmarkIconRegistry(map);
    const prepared = registry.prepare(
      data({ icon: "CAVE", collection_color: "#123456" }),
    );
    FakeImage.instances[0]!.onload!();
    await prepared;
    map.hasImage.mockClear();
    map.stylePresent = false;
    expect(() => map.emit("remove")).not.toThrow();
    expect(map.hasImage).not.toHaveBeenCalled();
    expect(map.removeImage).not.toHaveBeenCalled();
    expect(registry.getAvailableImageIds()).toEqual([]);
    expect(map.listeners.get("style.load")?.size).toBe(0);
  });
});

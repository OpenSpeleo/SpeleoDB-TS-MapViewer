import type { FeatureCollection } from "geojson";
import {
  normalizeLandmarkIcon,
  type LandmarkIcon,
} from "@speleodb/map-core/landmark-icons";
import {
  landmarkIconColor,
  landmarkIconHalo,
  landmarkIconImageId,
} from "./landmark-style.js";

/** Use as CSS masks with the collection color for accessible icon choices. */
export const LANDMARK_ICON_URLS: Readonly<Record<LandmarkIcon, string>> = {
  DEFAULT: new URL("../assets/landmark-default.svg", import.meta.url).href,
  CAVE: new URL("../assets/landmark-cave.svg", import.meta.url).href,
  UNKNOWN: new URL("../assets/landmark-unknown.svg", import.meta.url).href,
  ATTENTION: new URL("../assets/landmark-attention.svg", import.meta.url).href,
  NOGO: new URL("../assets/landmark-nogo.svg", import.meta.url).href,
};

interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}
interface Mask {
  alpha: Uint8Array;
  halo: Uint8Array;
}
interface IconRequest {
  icon: LandmarkIcon;
  color: string;
}

export interface LandmarkIconMap {
  /** Public MapLibre probe remains safe after map.remove() clears the style. */
  getStyle?(): unknown;
  hasImage(id: string): boolean;
  addImage(
    id: string,
    image: Raster,
    options: { pixelRatio: number; sdf: boolean },
  ): unknown;
  removeImage(id: string): unknown;
  on(type: "style.load" | "remove", listener: () => void): unknown;
  off(type: "style.load" | "remove", listener: () => void): unknown;
}

export interface LandmarkIconRegistry {
  /** Reconcile the current data set; source GeoJSON is never modified. */
  prepare(data: FeatureCollection | null | undefined): Promise<void>;
  getAvailableImageIds(): readonly string[];
  dispose(): void;
}

const PIXEL_RATIO = 3;
const SIZE = 32 * PIXEL_RATIO;
const HALO_RADIUS = 2 * PIXEL_RATIO;

function loadMask(icon: LandmarkIcon): Promise<Mask> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Cannot create landmark icon canvas");
        context.drawImage(image, 0, 0, SIZE, SIZE);
        const rgba = context.getImageData(0, 0, SIZE, SIZE).data;
        const alpha = new Uint8Array(SIZE * SIZE);
        const halo = new Uint8Array(alpha.length);
        const offsets: [number, number][] = [];
        for (let dy = -HALO_RADIUS; dy <= HALO_RADIUS; dy += 1)
          for (let dx = -HALO_RADIUS; dx <= HALO_RADIUS; dx += 1)
            if (dx * dx + dy * dy <= HALO_RADIUS * HALO_RADIUS)
              offsets.push([dx, dy]);
        for (let index = 0; index < alpha.length; index += 1)
          alpha[index] = rgba[index * 4 + 3]!;
        for (let y = 0; y < SIZE; y += 1)
          for (let x = 0; x < SIZE; x += 1) {
            let opacity = 0;
            for (const [dx, dy] of offsets) {
              const sx = x + dx;
              const sy = y + dy;
              if (sx >= 0 && sx < SIZE && sy >= 0 && sy < SIZE)
                opacity = Math.max(opacity, alpha[sy * SIZE + sx]!);
              if (opacity === 255) break;
            }
            halo[y * SIZE + x] = opacity;
          }
        resolve({ alpha, halo });
      } catch (error) {
        reject(error);
      } finally {
        image.onload = image.onerror = null;
      }
    };
    image.onerror = () => {
      image.onload = image.onerror = null;
      reject(new Error(`Cannot load landmark icon ${icon}`));
    };
    // Bundled asset URLs work in web builds and Capacitor's offline asset server.
    image.src = LANDMARK_ICON_URLS[icon];
  });
}

function colorChannels(color: string): number[] {
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
}

function tint(mask: Mask, color: string): Raster {
  const foreground = colorChannels(color);
  const background = colorChannels(landmarkIconHalo(color));
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let index = 0; index < mask.alpha.length; index += 1) {
    const foregroundAlpha = mask.alpha[index]! / 255;
    const backgroundAlpha = (mask.halo[index]! / 255) * (1 - foregroundAlpha);
    const alpha = foregroundAlpha + backgroundAlpha;
    if (alpha === 0) continue;
    for (let channel = 0; channel < 3; channel += 1)
      data[index * 4 + channel] = Math.round(
        (foreground[channel]! * foregroundAlpha +
          background[channel]! * backgroundAlpha) /
          alpha,
      );
    data[index * 4 + 3] = Math.round(alpha * 255);
  }
  return { width: SIZE, height: SIZE, data };
}

/**
 * One registry per map. It owns only its image namespace, never sources/layers.
 * All five icons use the same artwork scale; unavailable artwork uses the glyph.
 */
export function createLandmarkIconRegistry(
  map: LandmarkIconMap,
  onChange: () => void = () => {},
): LandmarkIconRegistry {
  let disposed = false;
  let revision = 0;
  let desired = new Map<string, IconRequest>();
  const masks = new Map<LandmarkIcon, Promise<Mask>>();
  const pending = new Map<string, Promise<void>>();
  const rasters = new Map<string, Raster>();
  const available = new Set<string>();
  const owned = new Set<string>();

  function register(id: string, raster: Raster): void {
    if (disposed || !desired.has(id)) return;
    if (!map.hasImage(id)) {
      map.addImage(id, raster, { pixelRatio: PIXEL_RATIO, sdf: false });
      owned.add(id);
    }
    available.add(id);
  }

  function restore(): void {
    if (disposed) return;
    available.clear();
    for (const [id, raster] of rasters) register(id, raster);
    onChange();
  }

  function release(removeImages: boolean): void {
    if (disposed) return;
    disposed = true;
    revision += 1;
    map.off("style.load", restore);
    map.off("remove", removed);
    // An application's earlier remove listener can dispose this registry before
    // our own listener runs. MapLibre has already cleared its style in that case.
    if (removeImages && (!map.getStyle || map.getStyle()))
      for (const id of owned) if (map.hasImage(id)) map.removeImage(id);
    desired.clear();
    masks.clear();
    rasters.clear();
    pending.clear();
    available.clear();
    owned.clear();
  }

  function removed(): void {
    // MapLibre has already destroyed the style before emitting remove.
    release(false);
  }

  function ensure(id: string, request: IconRequest): Promise<void> {
    const raster = rasters.get(id);
    if (raster) {
      register(id, raster);
      return Promise.resolve();
    }
    const existing = pending.get(id);
    if (existing) return existing;
    let mask = masks.get(request.icon);
    if (!mask) {
      mask = loadMask(request.icon);
      masks.set(request.icon, mask);
    }
    const work = mask
      .then((decoded) => {
        if (disposed || !desired.has(id)) return;
        const image = tint(decoded, request.color);
        rasters.set(id, image);
        register(id, image);
      })
      .catch(() => {
        // A later prepare can retry a transient asset failure; no broken marker.
        masks.delete(request.icon);
      })
      .finally(() => pending.delete(id));
    pending.set(id, work);
    return work;
  }

  map.on("style.load", restore);
  map.on("remove", removed);
  return {
    async prepare(data) {
      if (disposed) return;
      const currentRevision = ++revision;
      desired = new Map();
      for (const feature of data?.features ?? []) {
        const icon = normalizeLandmarkIcon(feature.properties?.icon);
        const color = landmarkIconColor(feature.properties?.collection_color);
        desired.set(landmarkIconImageId(icon, color), { icon, color });
      }
      await Promise.all(
        [...desired].map(([id, request]) => ensure(id, request)),
      );
      if (disposed || currentRevision !== revision) return;
      for (const id of rasters.keys())
        if (!desired.has(id)) {
          rasters.delete(id);
          available.delete(id);
          if (owned.delete(id) && map.hasImage(id)) map.removeImage(id);
        }
      onChange();
    },
    getAvailableImageIds: () => [...available].sort(),
    dispose: () => release(true),
  };
}

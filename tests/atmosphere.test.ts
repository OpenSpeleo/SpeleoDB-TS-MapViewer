import { describe, expect, it, vi } from "vitest";
import type { CustomLayerInterface, SkySpecification } from "maplibre-gl";
import {
  attachGlobeAtmosphere,
  GLOBE_ATMOSPHERE_LAYER_ID,
  globeAtmosphereOpacity,
  type GlobeAtmosphereMap,
} from "../src/atmosphere.js";

function fixture(loaded = true) {
  let layer: CustomLayerInterface | undefined;
  let sky: SkySpecification = { "sky-color": "red", "fog-color": "gray" };
  const listeners = new Map<string, Set<() => void>>();
  const map: GlobeAtmosphereMap = {
    on(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(callback);
    },
    off: (type, callback) => listeners.get(type)?.delete(callback),
    isStyleLoaded: () => loaded,
    getLayersOrder: () => ["satellite", "roads", "labels"],
    getLayer: (id) =>
      id === GLOBE_ATMOSPHERE_LAYER_ID
        ? layer
        : (
            {
              satellite: { type: "raster" },
              roads: { type: "line" },
              labels: { type: "symbol" },
            } as Record<string, { type: string }>
          )[id],
    addLayer: vi.fn((value) => {
      layer = value;
    }),
    removeLayer: vi.fn(() => {
      layer = undefined;
    }),
    getSky: () => sky,
    setSky: vi.fn((value) => {
      sky = value;
    }),
  };
  return {
    map,
    listeners,
    get layer() {
      return layer;
    },
    emit(type: string) {
      listeners.get(type)?.forEach((callback) => callback());
    },
    replaceStyle() {
      layer = undefined;
      sky = { "sky-color": "blue" };
      this.emit("style.load");
    },
  };
}

describe("globe atmosphere lifecycle", () => {
  it("attaches under labels without changing existing layers and restores sky on disposal", () => {
    const { map, listeners } = fixture();
    const dispose = attachGlobeAtmosphere(map);
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: GLOBE_ATMOSPHERE_LAYER_ID,
        type: "custom",
      }),
      "labels",
    );
    expect(map.getSky()).toEqual({
      "sky-color": "#121218",
      "horizon-color": "#121218",
      "fog-color": "gray",
      "atmosphere-blend": 0,
    });
    dispose();
    dispose();
    expect(map.removeLayer).toHaveBeenCalledTimes(1);
    expect(map.getSky()).toEqual({ "sky-color": "red", "fog-color": "gray" });
    expect(
      [...listeners.values()].every((callbacks) => callbacks.size === 0),
    ).toBe(true);
  });

  it("respects the consumer foreground anchor even without label layers", () => {
    const target = fixture();
    target.map.getLayersOrder = () => ["satellite", "foreground", "surveys"];
    const originalGetLayer = target.map.getLayer;
    target.map.getLayer = (id) =>
      id === "foreground" ? { type: "background" } : originalGetLayer(id);
    attachGlobeAtmosphere(target.map, { beforeId: "foreground" });
    expect(target.map.addLayer).toHaveBeenCalledWith(
      expect.anything(),
      "foreground",
    );
  });

  it("waits for a loaded style and recreates its layer on style/context restoration", () => {
    const target = fixture(false);
    const dispose = attachGlobeAtmosphere(target.map);
    expect(target.map.addLayer).not.toHaveBeenCalled();
    target.emit("style.load");
    const first = target.layer;
    target.emit("style.load");
    expect(target.map.addLayer).toHaveBeenCalledTimes(1);
    target.replaceStyle();
    expect(target.map.addLayer).toHaveBeenCalledTimes(2);
    expect(target.layer).not.toBe(first);
    dispose();
    expect(target.map.getSky()).toEqual({ "sky-color": "blue" });
    target.emit("style.load");
    expect(target.map.addLayer).toHaveBeenCalledTimes(2);
  });

  it("does not access destroyed map state on map.remove or later disposal", () => {
    const target = fixture();
    const dispose = attachGlobeAtmosphere(target.map);
    target.map.getLayer = () => {
      throw new Error("map destroyed");
    };
    target.emit("remove");
    expect(dispose).not.toThrow();
    expect(target.map.removeLayer).not.toHaveBeenCalled();
    expect(
      [...target.listeners.values()].every((callbacks) => callbacks.size === 0),
    ).toBe(true);
  });

  it("preserves subsequent consumer sky changes on disposal", () => {
    const target = fixture();
    const dispose = attachGlobeAtmosphere(target.map);
    target.map.setSky({ "sky-color": "green" });
    dispose();
    expect(target.map.getSky()).toEqual({ "sky-color": "green" });
  });
});

describe("projection transition", () => {
  it("fades the spherical effect before Mercator interpolation and draws nothing in Mercator", () => {
    expect(globeAtmosphereOpacity(1)).toBe(1);
    expect(globeAtmosphereOpacity(0.975)).toBeCloseTo(0.5);
    for (const transition of [0, 0.1, 0.5, 0.9, 0.95]) {
      expect(globeAtmosphereOpacity(transition)).toBe(0);
    }
  });
});

function gpuFixture() {
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    canvas: { clientWidth: 800 },
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => "compiler error"),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    createVertexArray: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getUniformLocation: vi.fn(() => ({})),
    deleteProgram: vi.fn(),
    deleteVertexArray: vi.fn(),
    useProgram: vi.fn(),
    drawArrays: vi.fn(),
  };
  return { gl, context: gl as unknown as WebGL2RenderingContext };
}

describe("GPU ownership", () => {
  it("releases linked shaders immediately and GPU objects exactly once on removal", () => {
    const target = fixture();
    attachGlobeAtmosphere(target.map);
    const { gl, context } = gpuFixture();
    const layer = target.layer!;
    const map = target.map as Parameters<NonNullable<typeof layer.onAdd>>[0];
    layer.onAdd?.(map, context);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    layer.onRemove?.(map, context);
    layer.onRemove?.(map, context);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
  });

  it("releases both shaders when fragment compilation fails", () => {
    const target = fixture();
    attachGlobeAtmosphere(target.map);
    const { gl, context } = gpuFixture();
    gl.getShaderParameter.mockReturnValueOnce(true).mockReturnValueOnce(false);
    const layer = target.layer!;
    const map = target.map as Parameters<NonNullable<typeof layer.onAdd>>[0];
    expect(() => layer.onAdd?.(map, context)).toThrow("compiler error");
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.createProgram).not.toHaveBeenCalled();
  });

  it("does not touch GPU state in Mercator", () => {
    const target = fixture();
    attachGlobeAtmosphere(target.map);
    const { gl, context } = gpuFixture();
    const layer = target.layer!;
    const map = target.map as Parameters<NonNullable<typeof layer.onAdd>>[0];
    layer.onAdd?.(map, context);
    layer.render(context, {
      defaultProjectionData: { projectionTransition: 0 },
    } as Parameters<typeof layer.render>[1]);
    expect(gl.useProgram).not.toHaveBeenCalled();
    expect(gl.drawArrays).not.toHaveBeenCalled();
  });
});

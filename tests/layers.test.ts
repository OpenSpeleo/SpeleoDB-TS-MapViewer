import { describe, expect, it } from "vitest";
import {
  createLandmarkLayers,
  createStationLayers,
  createSurfaceStationLayers,
  createVectorOverlayLayers,
  GEOJSON_LINE_SOURCE_OPTIONS,
} from "@speleodb/map-viewer";

describe("shared layer specifications", () => {
  it("creates vector specifications without owning source identity, geometry or lifecycle", () => {
    const layers = createVectorOverlayLayers({
      sourceId: "app-source",
      layerIds: { fill: "fill", outline: "outline", line: "line" },
      color: ["get", "color"],
      fillOpacity: 0.175,
      lineOpacity: 0.95,
      lineWidth: 2.5,
      outlineWidth: 1.5,
    });
    expect(
      layers.map((layer) => [
        layer.id,
        layer.type,
        "source" in layer && layer.source,
      ]),
    ).toEqual([
      ["fill", "fill", "app-source"],
      ["outline", "line", "app-source"],
      ["line", "line", "app-source"],
    ]);
    expect(layers[0]).toMatchObject({
      filter: ["==", ["geometry-type"], "Polygon"],
    });
    expect(GEOJSON_LINE_SOURCE_OPTIONS.tolerance).toBe(0);
  });

  it("supports app-owned geometry filtering and optional point presentation", () => {
    const layers = createVectorOverlayLayers({
      sourceId: "source",
      layerIds: {
        fill: "fill",
        outline: "outline",
        line: "line",
        point: "point",
      },
      color: "#123456",
      fillOpacity: 0.1,
      lineOpacity: 0.8,
      lineWidth: 2,
      outlineWidth: 1,
      outlineLayout: {},
      filterForGeometry: (type) => [
        "all",
        ["==", ["geometry-type"], type],
        ["==", ["get", "visible"], true],
      ],
      point: { radius: 4, strokeColor: "#ffffff", strokeWidth: 1 },
    });
    expect(layers).toHaveLength(4);
    expect(layers[3]).toMatchObject({
      type: "circle",
      source: "source",
      paint: { "circle-radius": 4 },
    });
    expect(layers[1]?.layout).toEqual({});
    expect(layers[2]).toMatchObject({
      filter: [
        "all",
        ["==", ["geometry-type"], "LineString"],
        ["==", ["get", "visible"], true],
      ],
    });
  });

  it("preserves marker-label roles, source binding and independently supplied size policy", () => {
    const options = {
      sourceId: "landmarks",
      markerId: "marker",
      labelId: "label",
      markerMinZoom: 2,
      labelMinZoom: 8,
      markerSize: 22,
      labelSize: 12,
      color: "#ffffff",
      haloColor: "#000000",
      visible: false,
    };
    const layers = createLandmarkLayers(options);
    expect(layers).toHaveLength(2);
    expect(layers[0]).toMatchObject({
      source: "landmarks",
      layout: { visibility: "none", "text-field": "▼", "text-size": 22 },
    });
    expect(layers[1]).toMatchObject({
      minzoom: 8,
      layout: { "text-offset": [0, 1.5] },
    });
    expect(
      createSurfaceStationLayers({ ...options, visible: true })[0],
    ).toMatchObject({ layout: { visibility: "visible", "text-field": "◆" } });
  });

  it("admits only available icons while composing parent visibility and station subtype intent", () => {
    const options = {
      sourceId: "stations",
      circleId: "sensor",
      labelId: "labels",
      color: "#fb923c",
      markerSize: 5,
      iconSize: 1,
      labelSize: 12,
      markerMinZoom: 14,
      labelMinZoom: 16,
      stationTypes: { sensor: true, biology: false, bone: true },
      icons: [
        {
          layerId: "biology",
          stationType: "biology",
          iconId: "fish",
          available: true,
        },
        {
          layerId: "bone",
          stationType: "bone",
          iconId: "bone",
          available: false,
        },
      ],
    };
    const layers = createStationLayers(options);
    expect(layers.map((layer) => layer.id)).toEqual([
      "sensor",
      "biology",
      "labels",
    ]);
    expect(layers[0]?.layout).toEqual({ visibility: "visible" });
    expect(layers[1]?.layout).toMatchObject({
      visibility: "none",
      "icon-image": "fish",
    });
    expect(
      createStationLayers({ ...options, visible: false }).every(
        (layer) => layer.layout?.visibility === "none",
      ),
    ).toBe(true);
  });
});

import {
  createExpression,
  createPropertyExpression,
  latest,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import {
  LANDMARK_ICON_OPTIONS,
  normalizeLandmarkIcon,
} from "@speleodb/map-core";
import {
  createGeometryLabelLayer,
  createLandmarkLayers,
  landmarkColorExpression,
  landmarkHaloExpression,
  landmarkIconImageExpression,
  landmarkIconImageId,
} from "@speleodb/map-viewer";

function evaluate(expression: unknown, properties: Record<string, unknown>) {
  const result = createExpression(expression, "test");
  expect(result.result).toBe("success");
  if (result.result !== "success")
    throw new Error(JSON.stringify(result.value));
  return result.value.evaluate({ zoom: 14 }, { type: "Point", properties });
}

describe("landmark image and geometry label specifications", () => {
  it("uses identical safe color/image keys in JavaScript and the actual MapLibre expression engine", () => {
    for (const color of [
      "#ABCdef",
      "#FFFFFF",
      "#000000",
      "#ffF",
      "red",
      "#gg0000",
      "#ffffff00",
      "",
      null,
      123,
      undefined,
    ]) {
      expect(
        evaluate(landmarkIconImageExpression(), {
          icon: "CAVE",
          collection_color: color,
        }),
      ).toBe(landmarkIconImageId("CAVE", color));
    }
    expect(
      evaluate(landmarkColorExpression(), { collection_color: "#ABCDEF" }),
    ).toBe("#abcdef");
    expect(
      evaluate(landmarkHaloExpression(), { collection_color: "#FFFFFF" }),
    ).toBe("#0f172a");
    expect(
      evaluate(landmarkHaloExpression(), { collection_color: "#123456" }),
    ).toBe("#ffffff");
    for (const icon of [
      ...LANDMARK_ICON_OPTIONS.map(({ value }) => value),
      "FUTURE",
      "",
      null,
      123,
      undefined,
    ]) {
      expect(evaluate(landmarkIconImageExpression(), { icon })).toBe(
        landmarkIconImageId(icon, undefined),
      );
    }
  });

  it("renders the default triangle at the same image scale as every other choice", () => {
    const availableIconIds = LANDMARK_ICON_OPTIONS.map(({ value }) =>
      landmarkIconImageId(value, "#123456"),
    );
    const [marker] = createLandmarkLayers({
      sourceId: "s",
      markerId: "m",
      labelId: "l",
      markerMinZoom: 2,
      labelMinZoom: 10,
      markerSize: 24,
      labelSize: 12,
      color: "#123456",
      haloColor: "#ffffff",
      availableIconIds,
    });
    for (const icon of [
      ...LANDMARK_ICON_OPTIONS.map(({ value }) => value),
      "FUTURE",
      null,
      undefined,
    ]) {
      const properties = { icon, collection_color: "#123456" };
      expect(evaluate(marker!.layout!["text-field"], properties)).toBe("");
      expect(evaluate(marker!.layout!["icon-image"], properties)).toBe(
        landmarkIconImageId(normalizeLandmarkIcon(icon), "#123456"),
      );
    }
    expect(marker!.layout!["icon-size"]).toBe(1);
  });

  it("keeps the existing hit-test ID and triangle fallback alongside available custom icons", () => {
    const id = landmarkIconImageId("CAVE", "#123456");
    const [marker, label] = createLandmarkLayers({
      sourceId: "landmarks-source",
      markerId: "landmarks-layer",
      labelId: "landmarks-labels",
      markerMinZoom: 2,
      labelMinZoom: 10,
      markerSize: 24,
      labelSize: 12,
      color: "#123456",
      haloColor: "#ffffff",
      availableIconIds: [id],
    });
    expect([marker!.id, label!.id]).toEqual([
      "landmarks-layer",
      "landmarks-labels",
    ]);
    expect(
      evaluate(marker!.layout!["text-field"], {
        icon: "CAVE",
        collection_color: "#123456",
      }),
    ).toBe("");
    expect(
      evaluate(marker!.layout!["icon-image"], {
        icon: "CAVE",
        collection_color: "#123456",
      }),
    ).toBe(id);
    for (const icon of ["DEFAULT", "UNKNOWN", "FUTURE", null, undefined])
      expect(
        evaluate(marker!.layout!["text-field"], {
          icon,
          collection_color: "#123456",
        }),
      ).toBe("▼");
    expect(marker!.layout).toMatchObject({
      "text-allow-overlap": true,
      "icon-allow-overlap": true,
      "icon-size": 1,
    });
  });

  it("scales zoom-driven image sizes without nesting the zoom expression illegally", () => {
    const [marker] = createLandmarkLayers({
      sourceId: "s",
      markerId: "m",
      labelId: "l",
      markerMinZoom: 2,
      labelMinZoom: 10,
      markerSize: ["interpolate", ["linear"], ["zoom"], 6, 12, 14, 24],
      labelSize: 12,
      color: "#123456",
      haloColor: "#ffffff",
      availableIconIds: [landmarkIconImageId("CAVE", "#123456")],
    });
    const expression = createPropertyExpression(
      marker!.layout!["icon-size"],
      "icon-size",
      latest.layout_symbol[
        "icon-size"
      ] as unknown as StylePropertySpecification,
    );
    expect(expression.result).toBe("success");
    if (expression.result !== "success")
      throw new Error(JSON.stringify(expression.value));
    expect(
      expression.value.evaluate({ zoom: 6 }, { type: "Point", properties: {} }),
    ).toBe(0.5);
    expect(
      expression.value.evaluate(
        { zoom: 14 },
        { type: "Point", properties: {} },
      ),
    ).toBe(1);
  });

  it("centers polygon aliases and places horizontal line aliases just above their shared midpoint", () => {
    const layer = createGeometryLabelLayer({
      sourceId: "anchors",
      layerId: "aliases",
      visible: false,
      filter: ["==", ["get", "id"], "visible"],
    });
    expect(layer.layout).toMatchObject({
      visibility: "none",
      "text-rotation-alignment": "viewport",
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    });
    expect(
      evaluate(layer.layout!["text-anchor"], { geometry_type: "LineString" }),
    ).toBe("bottom");
    expect(
      evaluate(layer.layout!["text-offset"], { geometry_type: "LineString" }),
    ).toEqual([0, -0.2]);
    expect(
      evaluate(layer.layout!["text-anchor"], { geometry_type: "Polygon" }),
    ).toBe("center");
    expect(
      evaluate(layer.layout!["text-offset"], { geometry_type: "Polygon" }),
    ).toEqual([0, 0]);
    expect(evaluate(layer.filter, { id: "hidden", alias: "No" })).toBe(false);
    expect(evaluate(layer.filter, { id: "visible", alias: "" })).toBe(false);
    expect(evaluate(layer.filter, { id: "visible", alias: "Middle" })).toBe(
      true,
    );
    for (const [key, value] of Object.entries(layer.layout!)) {
      if (!Array.isArray(value) || key === "text-font") continue;
      const spec =
        latest.layout_symbol[key as keyof typeof latest.layout_symbol];
      const expression = createPropertyExpression(
        value,
        key,
        spec as unknown as StylePropertySpecification,
      );
      expect(expression.result, key).toBe("success");
    }
  });
});

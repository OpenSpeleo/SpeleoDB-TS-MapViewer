import {
  createExpression,
  latest,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import {
  createDepthColorExpression,
  createGeoJSONLineWidth,
  createShotColorExpression,
  hitQueryBounds,
  landmarkCollectionsFilter,
  stationTypeFilter,
  stationTypesFilter,
  visibleIdsFilter,
  visibleRecordsFilter,
} from "@speleodb/map-viewer";

function evaluate(
  expression: unknown,
  properties: Record<string, unknown>,
  type: "color" | "number" | "boolean" = "color",
  zoom = 0,
) {
  const spec =
    type === "color"
      ? latest.paint_line["line-color"]
      : type === "number"
        ? latest.paint_line["line-width"]
        : {
            type: "boolean",
            default: false,
            expression: { interpolated: false, parameters: ["feature"] },
            "property-type": "data-driven",
          };
  const result = createExpression(
    expression,
    type === "boolean"
      ? "filter"
      : type === "number"
        ? "line-width"
        : "line-color",
    spec as StylePropertySpecification,
  );
  expect(result.result).toBe("success");
  if (result.result !== "success")
    throw new Error(JSON.stringify(result.value));
  return result.value.evaluate({ zoom }, { type: "Point", properties });
}

describe("shared renderer expressions", () => {
  it("preserves thin overview widths and caller-specific detail widths", () => {
    const expression = createGeoJSONLineWidth(6, 7);
    for (const [zoom, width] of [
      [0, 1],
      [8, 1],
      [10, 1.25],
      [12, 1.5],
      [14, 2],
      [16, 6],
      [18, 7],
      [22, 7],
    ]) {
      expect(evaluate(expression, {}, "number", zoom)).toBe(width);
    }
    expect(evaluate(createGeoJSONLineWidth(0.5), {}, "number", 0)).toBe(0.5);
    expect(evaluate(createGeoJSONLineWidth(6, 7, 1), {}, "number", 0)).toBe(2);
  });

  it("uses model fallback for malformed or missing shot colors and supports alpha colors", () => {
    const expression = createShotColorExpression("#ffffff");
    for (const color of [undefined, "", "broken"])
      expect(evaluate(expression, { color })).toMatchObject({
        r: 1,
        g: 1,
        b: 1,
        a: 1,
      });
    expect(evaluate(expression, { color: "#ff000080" })).toMatchObject({
      a: 128 / 255,
    });
  });

  it("keeps ramp, transfer function, depth property and no-depth fallback caller-owned", () => {
    const options = {
      domain: { min: 0, max: 100 },
      fallbackColor: "#00ff00",
      property: "depth",
      stops: [
        { ratio: 0, color: "#000000" },
        { ratio: 1, color: "#ffffff" },
      ],
    };
    expect(
      evaluate(createDepthColorExpression(options), { depth: 25 }),
    ).toMatchObject({ r: 0.25, g: 0.25, b: 0.25 });
    expect(
      evaluate(createDepthColorExpression({ ...options, transform: "sqrt" }), {
        depth: 25,
      }),
    ).toMatchObject({ r: 0.5, g: 0.5, b: 0.5 });
    expect(evaluate(createDepthColorExpression(options), {})).toMatchObject({
      r: 0,
      g: 1,
      b: 0,
    });
    expect(
      evaluate(createDepthColorExpression(options), { depth: -20 }),
    ).toMatchObject({ r: 0 });
    expect(
      evaluate(createDepthColorExpression(options), { depth: 200 }),
    ).toMatchObject({ r: 1 });
    expect(createDepthColorExpression({ ...options, domain: null })).toBe(
      "#00ff00",
    );
    expect(
      createDepthColorExpression({ ...options, domain: { min: 0, max: NaN } }),
    ).toBe("#00ff00");
    expect(createDepthColorExpression({ ...options, stops: [] })).toBe(
      "#00ff00",
    );
    expect(
      evaluate(
        createDepthColorExpression({ ...options, domain: { min: 0, max: 0 } }),
        { depth: 5 },
      ),
    ).toMatchObject({ r: 0 });
    expect(
      evaluate(
        createDepthColorExpression({
          ...options,
          domain: { min: 0, max: 0 },
          zeroDomainMax: 10,
        }),
        { depth: 5 },
      ),
    ).toMatchObject({ r: 0.5 });
  });

  it("handles numeric feature identifiers without mutating source geometry", () => {
    const filter = visibleIdsFilter(["1", "a"], "project");
    expect(evaluate(filter, { project: 1 }, "boolean")).toBe(true);
    expect(evaluate(filter, { project: "a" }, "boolean")).toBe(true);
    expect(evaluate(filter, {}, "boolean")).toBe(false);
    expect(
      evaluate(
        visibleRecordsFilter({ a: true, b: false }),
        { id: "b" },
        "boolean",
      ),
    ).toBe(false);
  });

  it("composes category filters with legacy sensor and personal collection values", () => {
    for (const properties of [{}, { type: null }, { type: "sensor" }]) {
      expect(evaluate(stationTypeFilter("sensor"), properties, "boolean")).toBe(
        true,
      );
      expect(
        evaluate(
          stationTypesFilter({ sensor: true, biology: false }),
          properties,
          "boolean",
        ),
      ).toBe(true);
    }
    expect(
      evaluate(stationTypeFilter("biology"), { type: "biology" }, "boolean"),
    ).toBe(true);
    expect(
      evaluate(
        stationTypesFilter({ sensor: false, biology: true }),
        {},
        "boolean",
      ),
    ).toBe(false);
    const collections = landmarkCollectionsFilter({
      __personal__: false,
      visible: true,
    });
    for (const collection of [null, "", undefined])
      expect(evaluate(collections, { collection }, "boolean")).toBe(false);
    expect(evaluate(collections, { collection: "visible" }, "boolean")).toBe(
      true,
    );
    expect(hitQueryBounds({ x: 50, y: 100 }, 10)).toEqual([
      [40, 90],
      [60, 110],
    ]);
  });
});

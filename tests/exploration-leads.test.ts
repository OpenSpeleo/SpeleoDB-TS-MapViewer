import { MAP_LAYER_MIN_ZOOM } from "../src/visibility.js";
import { describe, expect, it } from "vitest";
import type { ExpressionSpecification } from "maplibre-gl";
import { createExplorationLeadConeLayer } from "../src/exploration-leads.js";
import * as leads from "../src/exploration-leads.js";
import {
  createExpression,
  type StylePropertySpecification,
} from "@maplibre/maplibre-gl-style-spec";

function evaluate(
  expression: unknown,
  properties: Record<string, unknown>,
  type: "boolean" | "number" | "string",
) {
  const result = createExpression(expression, "lead-state", {
    type,
    expression: { interpolated: false, parameters: ["feature"] },
    "property-type": "data-driven",
  } as StylePropertySpecification);
  expect(result.result).toBe("success");
  if (result.result !== "success")
    throw new Error(JSON.stringify(result.value));
  return result.value.evaluate({ zoom: 16 }, { type: "Point", properties });
}

describe("exploration lead marker completion", () => {
  it.each([false, true])(
    "hides fully checked markers unless requested, icon=%s",
    (iconAvailable) => {
      const filter: ExpressionSpecification = [
        "==",
        ["get", "project"],
        "visible",
      ];
      for (const showChecked of [false, true]) {
        const layer = leads.createExplorationLeadMarkerLayer({
          sourceId: "leads",
          layerId: "markers",
          iconAvailable,
          filter,
          showChecked,
        });
        expect(layer.minzoom).toBe(MAP_LAYER_MIN_ZOOM.EXPLORATION_LEAD_SYMBOL);
        expect(
          evaluate(
            layer.filter,
            { project: "visible", is_fully_checked: false },
            "boolean",
          ),
        ).toBe(true);
        expect(
          evaluate(
            layer.filter,
            { project: "visible", is_fully_checked: true },
            "boolean",
          ),
        ).toBe(showChecked);
        expect(
          evaluate(
            layer.filter,
            { project: "hidden", is_fully_checked: true },
            "boolean",
          ),
        ).toBe(false);
      }
    },
  );

  it.each([false, true])(
    "uses checked color and 75% opacity without changing open markers, icon=%s",
    (iconAvailable) => {
      const layer = leads.createExplorationLeadMarkerLayer({
        sourceId: "leads",
        layerId: "markers",
        iconAvailable,
        showChecked: true,
        visible: false,
        iconSize: 0.75,
        circleRadius: 10,
      });
      expect(layer.filter).toBeUndefined();
      expect(layer.layout?.visibility).toBe("none");
      for (const checked of [false, true]) {
        const properties = { is_fully_checked: checked };
        const expectedOpacity = checked ? 0.75 : 1;
        if (layer.type === "symbol") {
          expect(layer.layout?.["icon-size"]).toBe(0.75);
          expect(
            evaluate(layer.paint?.["icon-opacity"], properties, "number"),
          ).toBe(expectedOpacity);
          expect(
            evaluate(layer.layout?.["icon-image"], properties, "string"),
          ).toBe(
            checked
              ? leads.EXPLORATION_LEAD_ICON_IDS.checked
              : leads.EXPLORATION_LEAD_ICON_IDS.unchecked,
          );
        } else {
          expect(layer.paint?.["circle-radius"]).toBe(10);
          expect(
            evaluate(layer.paint?.["circle-opacity"], properties, "number"),
          ).toBe(expectedOpacity);
          expect(
            evaluate(
              layer.paint?.["circle-stroke-opacity"],
              properties,
              "number",
            ),
          ).toBe(expectedOpacity);
          expect(
            evaluate(layer.paint?.["circle-color"], properties, "string"),
          ).toBe(
            checked
              ? leads.EXPLORATION_LEAD_CHECKED_COLOR
              : leads.EXPLORATION_LEAD_MARKER_COLOR,
          );
        }
      }
    },
  );

  it("defaults to hiding checked markers and keeps project conditions when toggled", () => {
    const layer = leads.createExplorationLeadMarkerLayer({
      sourceId: "leads",
      layerId: "markers",
      iconAvailable: false,
    });
    expect(evaluate(layer.filter, { is_fully_checked: true }, "boolean")).toBe(
      false,
    );
    expect(evaluate(layer.filter, { is_fully_checked: false }, "boolean")).toBe(
      true,
    );
    const projectFilter: ExpressionSpecification = [
      "==",
      ["get", "project"],
      "visible",
    ];
    expect(leads.explorationLeadFilter(true, projectFilter)).toEqual(
      projectFilter,
    );
    expect(leads.explorationLeadFilter(true)).toBeUndefined();
  });

  it("prepares the checked image without changing its white artwork, alpha or source", () => {
    const data = new Uint8Array([
      239, 68, 68, 255, 255, 255, 255, 255, 247, 162, 162, 128, 0, 0, 0, 0,
    ]);
    const original = data.slice();
    const image = leads.createCheckedExplorationLeadIcon({
      width: 2,
      height: 2,
      data,
    });
    expect(image).toEqual({
      width: 2,
      height: 2,
      data: new Uint8Array([
        34, 197, 94, 255, 255, 255, 255, 255, 145, 226, 175, 128, 0, 0, 0, 0,
      ]),
    });
    expect(data).toEqual(original);
  });
});

describe("exploration lead cone layer", () => {
  it("uses the shared lead visibility threshold while preserving category and project filters", () => {
    const filter: ExpressionSpecification = [
      "==",
      ["get", "project"],
      "visible-project",
    ];
    const layer = createExplorationLeadConeLayer({
      sourceId: "cones",
      layerId: "cone-layer",
      visible: false,
      filter,
    });
    expect(layer).toMatchObject({
      source: "cones",
      minzoom: MAP_LAYER_MIN_ZOOM.EXPLORATION_LEAD_SYMBOL,
      type: "fill",
      filter,
      layout: { visibility: "none" },
      paint: { "fill-color": "#ef4444", "fill-opacity": 0.8 },
    });
  });
});

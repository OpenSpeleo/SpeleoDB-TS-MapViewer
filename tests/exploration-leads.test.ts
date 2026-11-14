import { MAP_LAYER_MIN_ZOOM } from "../src/visibility.js";
import { describe, expect, it } from "vitest";
import type { ExpressionSpecification } from "maplibre-gl";
import { createExplorationLeadConeLayer } from "../src/exploration-leads.js";

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

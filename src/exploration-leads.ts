import type {
  ExpressionSpecification,
  FillLayerSpecification,
} from "maplibre-gl";
import { MAP_LAYER_MIN_ZOOM } from "./visibility.js";

export const EXPLORATION_LEAD_CONE_SOURCE_OPTIONS = { tolerance: 0 } as const;
export const EXPLORATION_LEAD_CONE_COLOR = "#ef4444";
export const EXPLORATION_LEAD_CONE_OPACITY = 0.8;

export interface ExplorationLeadConeLayerOptions {
  sourceId: string;
  layerId: string;
  visible?: boolean;
  filter?: ExpressionSpecification | undefined;
}

/** Applications place this translucent fill above their exploration lead markers. */
export function createExplorationLeadConeLayer({
  sourceId,
  layerId,
  visible = true,
  filter,
}: ExplorationLeadConeLayerOptions): FillLayerSpecification {
  return {
    id: layerId,
    source: sourceId,
    type: "fill",
    minzoom: MAP_LAYER_MIN_ZOOM.EXPLORATION_LEAD_SYMBOL,
    ...(filter ? { filter } : {}),
    layout: { visibility: visible ? "visible" : "none" },
    paint: {
      "fill-color": EXPLORATION_LEAD_CONE_COLOR,
      "fill-opacity": EXPLORATION_LEAD_CONE_OPACITY,
    },
  };
}

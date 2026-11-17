import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { combineFilters } from "./expressions.js";
import { MAP_LAYER_MIN_ZOOM } from "./visibility.js";

export const EXPLORATION_LEAD_CONE_SOURCE_OPTIONS = { tolerance: 0 } as const;
export const EXPLORATION_LEAD_CONE_COLOR = "#ef4444";
export const EXPLORATION_LEAD_CONE_OPACITY = 0.8;
export const EXPLORATION_LEAD_SHOW_CHECKED_DEFAULT = false;
export const EXPLORATION_LEAD_MARKER_COLOR = "#ef4444";
export const EXPLORATION_LEAD_CHECKED_COLOR = "#22c55e";
export const EXPLORATION_LEAD_CHECKED_OPACITY = 0.75;
export const EXPLORATION_LEAD_MARKER_OPACITY = 1;
export const EXPLORATION_LEAD_MARKER_STROKE_COLOR = "#ffffff";
export const EXPLORATION_LEAD_MARKER_STROKE_WIDTH = 2;
export const EXPLORATION_LEAD_ICON_IDS = {
  unchecked: "exploration-lead-icon",
  checked: "exploration-lead-checked-icon",
} as const;
export const EXPLORATION_LEAD_ICON_SIZE: DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["zoom"], 14, 0.4, 18, 0.6];
export const EXPLORATION_LEAD_CIRCLE_RADIUS: DataDrivenPropertyValueSpecification<number> =
  ["interpolate", ["linear"], ["zoom"], 14, 8, 18, 12];

function checkedExpression(): ExpressionSpecification {
  return ["==", ["get", "is_fully_checked"], true];
}

/** Completion is a presentation gate composed with the caller's project filter. */
export function explorationLeadFilter(
  showChecked: boolean,
  filter?: ExpressionSpecification,
): ExpressionSpecification | undefined {
  return showChecked
    ? filter
    : combineFilters(filter, ["!", checkedExpression()]);
}

export interface ExplorationLeadMarkerLayerOptions {
  sourceId: string;
  layerId: string;
  visible?: boolean;
  filter?: ExpressionSpecification | undefined;
  showChecked?: boolean;
  /** Both normal and checked image variants must be available. */
  iconAvailable: boolean;
  iconSize?: DataDrivenPropertyValueSpecification<number> | undefined;
  circleRadius?: DataDrivenPropertyValueSpecification<number> | undefined;
}

/** Identical status, opacity and visibility policy for app-owned marker layers. */
export function createExplorationLeadMarkerLayer({
  sourceId,
  layerId,
  visible = true,
  filter,
  showChecked = EXPLORATION_LEAD_SHOW_CHECKED_DEFAULT,
  iconAvailable,
  iconSize = EXPLORATION_LEAD_ICON_SIZE,
  circleRadius = EXPLORATION_LEAD_CIRCLE_RADIUS,
}: ExplorationLeadMarkerLayerOptions):
  SymbolLayerSpecification | CircleLayerSpecification {
  const markerFilter = explorationLeadFilter(showChecked, filter);
  const opacity: ExpressionSpecification = [
    "case",
    checkedExpression(),
    EXPLORATION_LEAD_CHECKED_OPACITY,
    EXPLORATION_LEAD_MARKER_OPACITY,
  ];
  const base = {
    id: layerId,
    source: sourceId,
    minzoom: MAP_LAYER_MIN_ZOOM.EXPLORATION_LEAD_SYMBOL,
    ...(markerFilter ? { filter: markerFilter } : {}),
    layout: { visibility: visible ? ("visible" as const) : ("none" as const) },
  };
  if (iconAvailable)
    return {
      ...base,
      type: "symbol",
      layout: {
        ...base.layout,
        "icon-image": [
          "case",
          checkedExpression(),
          EXPLORATION_LEAD_ICON_IDS.checked,
          EXPLORATION_LEAD_ICON_IDS.unchecked,
        ],
        "icon-size": iconSize,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": opacity },
    };
  return {
    ...base,
    type: "circle",
    paint: {
      "circle-radius": circleRadius,
      "circle-color": [
        "case",
        checkedExpression(),
        EXPLORATION_LEAD_CHECKED_COLOR,
        EXPLORATION_LEAD_MARKER_COLOR,
      ],
      "circle-stroke-width": EXPLORATION_LEAD_MARKER_STROKE_WIDTH,
      "circle-stroke-color": EXPLORATION_LEAD_MARKER_STROKE_COLOR,
      "circle-opacity": opacity,
      "circle-stroke-opacity": opacity,
    },
  };
}

export interface ExplorationLeadIconRaster {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** Preserve the bundled icon's white artwork, edge antialiasing and alpha. */
export function createCheckedExplorationLeadIcon(
  image: HTMLImageElement | ImageBitmap | ExplorationLeadIconRaster,
): { width: number; height: number; data: Uint8Array } {
  let raster: ExplorationLeadIconRaster;
  if ("data" in image) {
    raster = image;
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("Cannot prepare checked exploration lead icon");
    context.drawImage(image, 0, 0);
    raster = context.getImageData(0, 0, canvas.width, canvas.height);
  }
  const data = Uint8Array.from(raster.data);
  const channels = [1, 3, 5].map((start) =>
    parseInt(EXPLORATION_LEAD_CHECKED_COLOR.slice(start, start + 2), 16),
  );
  const sourceGreen = parseInt(EXPLORATION_LEAD_MARKER_COLOR.slice(3, 5), 16);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue;
    const redCoverage = Math.min(
      1,
      Math.max(0, (255 - data[offset + 1]!) / (255 - sourceGreen)),
    );
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.round(
        255 + (channels[channel]! - 255) * redCoverage,
      );
    }
  }
  return { width: raster.width, height: raster.height, data };
}

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

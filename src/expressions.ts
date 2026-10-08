import type { ExpressionSpecification } from "maplibre-gl";
import type { DepthDomain } from "@speleodb/map-core/depth";

// Apply to every line-bearing GeoJSON source: the default simplifier can drop
// whole short features at overview zooms, not just intermediate vertices.
export const GEOJSON_LINE_SOURCE_OPTIONS = { tolerance: 0 } as const;

export const GEOJSON_LINE_LAYOUT = {
  "line-cap": "round",
  "line-join": "round",
} as const;

const OVERVIEW_WIDTH_STOPS = [
  [0, 1],
  [8, 1],
  [12, 1.5],
  [14, 2],
] as const;
export const GEOJSON_LINE_RENDER_DEFAULTS = {
  TOLERANCE: GEOJSON_LINE_SOURCE_OPTIONS.tolerance,
  OVERVIEW_WIDTH_STOPS,
  DETAIL_ZOOM: 16,
  CLOSE_ZOOM: 18,
} as const;

/** Shared overview policy, with each layer retaining its close-up emphasis. */
export function createGeoJSONLineWidth(
  detailWidth: number,
  maxWidth = detailWidth,
  overviewWidthOffset = 0,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ...OVERVIEW_WIDTH_STOPS.flatMap(([zoom, width]) => [
      zoom,
      Math.min(width + overviewWidthOffset, detailWidth),
    ]),
    GEOJSON_LINE_RENDER_DEFAULTS.DETAIL_ZOOM,
    detailWidth,
    GEOJSON_LINE_RENDER_DEFAULTS.CLOSE_ZOOM,
    maxWidth,
  ];
}

export function visibleIdsFilter(
  ids: Iterable<string>,
  property = "id",
): ExpressionSpecification {
  return [
    "in",
    ["to-string", ["coalesce", ["get", property], ""]],
    ["literal", [...ids]],
  ];
}

export function visibleRecordsFilter(
  visibility: Readonly<Record<string, boolean>>,
  property = "id",
): ExpressionSpecification {
  return visibleIdsFilter(
    Object.keys(visibility).filter((id) => visibility[id]),
    property,
  );
}

export function landmarkCollectionsFilter(
  visibility: Readonly<Record<string, boolean>>,
): ExpressionSpecification {
  return [
    "!",
    [
      "in",
      [
        "case",
        ["==", ["to-string", ["coalesce", ["get", "collection"], ""]], ""],
        "__personal__",
        ["to-string", ["get", "collection"]],
      ],
      [
        "literal",
        Object.keys(visibility).filter((id) => visibility[id] === false),
      ],
    ],
  ];
}

export function createShotColorExpression(
  fallbackColor: string,
  property = "color",
): ExpressionSpecification {
  return ["to-color", ["get", property], fallbackColor];
}

export interface DepthColorOptions {
  domain: DepthDomain | null;
  fallbackColor: string;
  property: string;
  stops: readonly { ratio: number; color: string }[];
  transform?: "linear" | "sqrt";
  zeroDomainMax?: number;
}

/** The caller owns the depth property, ramp, transfer function and fallback. */
export function createDepthColorExpression({
  domain,
  fallbackColor,
  property,
  stops,
  transform = "linear",
  zeroDomainMax = 0,
}: DepthColorOptions): ExpressionSpecification | string {
  if (!domain || !Number.isFinite(domain.max) || stops.length === 0)
    return fallbackColor;
  const maxDepth = Math.max(0, domain.max) || zeroDomainMax;
  if (maxDepth <= 0)
    return ["case", ["has", property], stops[0]!.color, fallbackColor];
  const normalized: ExpressionSpecification = [
    "/",
    ["min", maxDepth, ["max", 0, ["to-number", ["get", property], 0]]],
    maxDepth,
  ];
  const input: ExpressionSpecification =
    transform === "sqrt" ? ["sqrt", normalized] : normalized;
  return [
    "case",
    ["has", property],
    [
      "interpolate",
      ["linear"],
      input,
      ...stops.flatMap((stop) => [stop.ratio, stop.color]),
    ],
    fallbackColor,
  ];
}

/** Missing and null station types represent the historical sensor category. */
export function stationTypeFilter(type: string): ExpressionSpecification {
  return type === "sensor"
    ? [
        "any",
        ["!", ["has", "type"]],
        ["==", ["get", "type"], null],
        ["==", ["get", "type"], "sensor"],
      ]
    : ["==", ["get", "type"], type];
}

export function stationTypesFilter(
  visibility: Readonly<Record<string, boolean>>,
): ExpressionSpecification {
  return [
    "in",
    ["coalesce", ["get", "type"], "sensor"],
    ["literal", Object.keys(visibility).filter((type) => visibility[type])],
  ];
}

export function combineFilters(
  filter: ExpressionSpecification | undefined,
  condition: ExpressionSpecification,
): ExpressionSpecification {
  return filter ? ["all", filter, condition] : condition;
}

export function hitQueryBounds(
  point: { x: number; y: number },
  radius: number,
): [[number, number], [number, number]] {
  return [
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius],
  ];
}

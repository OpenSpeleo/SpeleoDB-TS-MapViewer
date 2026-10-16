import type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  LayerSpecification,
  LineLayerSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import {
  GEOJSON_LINE_LAYOUT,
  combineFilters,
  stationTypeFilter,
  stationTypesFilter,
} from "./expressions.js";
import {
  LANDMARK_ICON_CONTENT_SIZE,
  landmarkIconImageExpression,
} from "./landmark-style.js";

type Color = DataDrivenPropertyValueSpecification<string>;
type Size = DataDrivenPropertyValueSpecification<number>;
type GeometryType = "Polygon" | "LineString" | "Point";
type Visibility = "visible" | "none";

export interface VectorOverlayOptions {
  sourceId: string;
  layerIds: { fill: string; outline: string; line: string; point?: string };
  color: Color;
  fillOpacity: number;
  lineOpacity: number;
  lineWidth: Size;
  outlineWidth: Size;
  filterForGeometry?: (type: GeometryType) => ExpressionSpecification;
  outlineLayout?: LineLayerSpecification["layout"];
  point?: { radius: Size; strokeColor: string; strokeWidth: number };
}

/** Source topology and lifetime belong to the calling application. */
export function createVectorOverlayLayers({
  sourceId: source,
  layerIds,
  color,
  fillOpacity,
  lineOpacity,
  lineWidth,
  outlineWidth,
  filterForGeometry = (type) => ["==", ["geometry-type"], type],
  outlineLayout = GEOJSON_LINE_LAYOUT,
  point,
}: VectorOverlayOptions): LayerSpecification[] {
  const fill: FillLayerSpecification = {
    id: layerIds.fill,
    source,
    type: "fill",
    filter: filterForGeometry("Polygon"),
    paint: { "fill-color": color, "fill-opacity": fillOpacity },
  };
  const outline: LineLayerSpecification = {
    id: layerIds.outline,
    source,
    type: "line",
    filter: filterForGeometry("Polygon"),
    layout: outlineLayout,
    paint: {
      "line-color": color,
      "line-width": outlineWidth,
      "line-opacity": lineOpacity,
    },
  };
  const line: LineLayerSpecification = {
    id: layerIds.line,
    source,
    type: "line",
    filter: filterForGeometry("LineString"),
    layout: GEOJSON_LINE_LAYOUT,
    paint: {
      "line-color": color,
      "line-width": lineWidth,
      "line-opacity": lineOpacity,
    },
  };
  const result: LayerSpecification[] = [fill, outline, line];
  if (point && layerIds.point)
    result.push({
      id: layerIds.point,
      source,
      type: "circle",
      filter: filterForGeometry("Point"),
      paint: {
        "circle-color": color,
        "circle-radius": point.radius,
        "circle-stroke-color": point.strokeColor,
        "circle-stroke-width": point.strokeWidth,
      },
    });
  return result;
}

interface LabelOptions {
  sourceId: string;
  markerMinZoom: number;
  labelMinZoom: number;
  markerSize: Size;
  labelSize: Size;
  visible?: boolean;
  filter?: ExpressionSpecification | undefined;
}

export interface LandmarkLayerOptions extends LabelOptions {
  markerId: string;
  labelId: string;
  color: Color;
  haloColor: Color;
  availableIconIds?: readonly string[];
}

export function createLandmarkLayers(
  options: LandmarkLayerOptions,
): SymbolLayerSpecification[] {
  const {
    sourceId: source,
    markerId,
    labelId,
    markerMinZoom,
    labelMinZoom,
    markerSize,
    labelSize,
    color,
    haloColor,
    visible = true,
    filter,
    availableIconIds = [],
  } = options;
  const visibility: Visibility = visible ? "visible" : "none";
  const image = landmarkIconImageExpression();
  const hasIcon: ExpressionSpecification = [
    "in",
    image,
    ["literal", [...availableIconIds]],
  ];
  return [
    {
      id: markerId,
      source,
      ...(filter ? { filter } : {}),
      type: "symbol",
      minzoom: markerMinZoom,
      layout: {
        visibility,
        "text-field": availableIconIds.length
          ? ["case", hasIcon, "", "▼"]
          : "▼",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": markerSize,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        ...(availableIconIds.length
          ? {
              "icon-image": [
                "case",
                hasIcon,
                image,
                "",
              ] as ExpressionSpecification,
              "icon-size": scaleSize(
                markerSize,
                1 / LANDMARK_ICON_CONTENT_SIZE,
              ),
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-optional": true,
              "text-optional": true,
            }
          : {}),
      },
      paint: {
        "text-color": color,
        "text-halo-color": haloColor,
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    },
    {
      id: labelId,
      source,
      ...(filter ? { filter } : {}),
      type: "symbol",
      minzoom: labelMinZoom,
      layout: {
        visibility,
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.5],
        "text-size": labelSize,
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": color,
        "text-halo-color": haloColor,
        "text-halo-width": 1.5,
      },
    },
  ];
}

/** Zoom expressions must remain at the top level of a layout size expression. */
function scaleSize(size: Size, factor: number): Size {
  if (typeof size === "number") return size * factor;
  if (Array.isArray(size) && size[0] === "interpolate") {
    return size.map((value, index) =>
      index >= 4 && index % 2 === 0 ? ["*", value, factor] : value,
    ) as ExpressionSpecification;
  }
  if (Array.isArray(size) && size[0] === "step") {
    return size.map((value, index) =>
      index >= 2 && index % 2 === 0 ? ["*", value, factor] : value,
    ) as ExpressionSpecification;
  }
  return ["*", size, factor] as ExpressionSpecification;
}

export interface GeometryLabelLayerOptions {
  sourceId: string;
  layerId: string;
  visible?: boolean;
  filter?: ExpressionSpecification;
  labelSize?: Size;
}

/** Label points are derived once in map-core; applications retain visibility gates. */
export function createGeometryLabelLayer({
  sourceId: source,
  layerId: id,
  visible = true,
  filter,
  labelSize = 13,
}: GeometryLabelLayerOptions): SymbolLayerSpecification {
  const isLine: ExpressionSpecification = [
    "==",
    ["get", "geometry_type"],
    "LineString",
  ];
  return {
    id,
    source,
    type: "symbol",
    filter: combineFilters(filter, [
      "!=",
      ["coalesce", ["get", "alias"], ""],
      "",
    ]),
    layout: {
      visibility: visible ? "visible" : "none",
      "symbol-placement": "point",
      "text-field": ["get", "alias"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-size": labelSize,
      "text-anchor": ["case", isLine, "bottom", "center"],
      "text-offset": [
        "case",
        isLine,
        ["literal", [0, -0.2]],
        ["literal", [0, 0]],
      ],
      "text-rotation-alignment": "viewport",
      "text-pitch-alignment": "viewport",
      // A 32-character alias fits on one line, including wide Unicode glyphs.
      "text-max-width": 64,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": ["to-color", ["get", "color"], "#94a3b8"],
      "text-halo-color": [
        "case",
        ["==", ["downcase", ["string", ["get", "color"], ""]], "#ffffff"],
        "#0f172a",
        "#ffffff",
      ],
      "text-halo-width": 1.5,
      "text-halo-blur": 0.5,
    },
  };
}

export interface SurfaceStationLayerOptions extends LabelOptions {
  markerId: string;
  labelId: string;
  color: Color;
}

export function createSurfaceStationLayers({
  sourceId: source,
  markerId,
  labelId,
  color,
  markerSize,
  labelSize,
  markerMinZoom,
  labelMinZoom,
  visible = true,
  filter,
}: SurfaceStationLayerOptions): SymbolLayerSpecification[] {
  const visibility: Visibility = visible ? "visible" : "none";
  return [
    {
      id: markerId,
      source,
      ...(filter ? { filter } : {}),
      type: "symbol",
      minzoom: markerMinZoom,
      layout: {
        visibility,
        "text-field": "◆",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": markerSize,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": color,
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
        "text-halo-blur": 0.5,
      },
    },
    {
      id: labelId,
      source,
      ...(filter ? { filter } : {}),
      type: "symbol",
      minzoom: labelMinZoom,
      layout: {
        visibility,
        "text-field": ["get", "name"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
        "text-offset": [0, 1.2],
        "text-size": labelSize,
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
      },
      paint: {
        "text-color": "#222",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    },
  ];
}

export interface StationLayerOptions extends LabelOptions {
  sourceId: string;
  circleId: string;
  labelId: string;
  color: Color;
  iconSize: Size;
  stationTypes: Readonly<Record<string, boolean>>;
  icons: readonly {
    layerId: string;
    stationType: string;
    iconId: string;
    available: boolean;
  }[];
}

/** Category/subtype preferences compose with a caller's project visibility gate. */
export function createStationLayers({
  sourceId: source,
  circleId,
  labelId,
  color,
  markerSize,
  iconSize,
  labelSize,
  markerMinZoom,
  labelMinZoom,
  visible = true,
  filter,
  stationTypes,
  icons,
}: StationLayerOptions): LayerSpecification[] {
  const result: LayerSpecification[] = [
    {
      id: circleId,
      source,
      type: "circle",
      minzoom: markerMinZoom,
      filter: combineFilters(filter, stationTypeFilter("sensor")),
      layout: {
        visibility: visible && stationTypes.sensor ? "visible" : "none",
      },
      paint: {
        "circle-radius": markerSize,
        "circle-color": color,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 1,
      },
    },
  ];
  for (const { layerId, stationType, iconId, available } of icons) {
    if (!available) continue;
    result.push({
      id: layerId,
      source,
      type: "symbol",
      minzoom: markerMinZoom,
      filter: combineFilters(filter, stationTypeFilter(stationType)),
      layout: {
        visibility: visible && stationTypes[stationType] ? "visible" : "none",
        "icon-image": iconId,
        "icon-size": iconSize,
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: { "icon-opacity": 1 },
    });
  }
  result.push({
    id: labelId,
    source,
    type: "symbol",
    minzoom: labelMinZoom,
    filter: combineFilters(filter, stationTypesFilter(stationTypes)),
    layout: {
      visibility: visible ? "visible" : "none",
      "text-field": ["get", "name"],
      "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
      "text-offset": [0, 1.2],
      "text-size": labelSize,
      "text-anchor": "top",
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "#222",
      "text-halo-color": "#ffffff",
      "text-halo-width": 2,
    },
  });
  return result;
}

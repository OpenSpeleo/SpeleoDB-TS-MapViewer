import { safeHexColor } from "@speleodb/map-core/colors";
import {
  LANDMARK_ICON_OPTIONS,
  normalizeLandmarkIcon,
} from "@speleodb/map-core/landmark-icons";
import type { ExpressionSpecification } from "maplibre-gl";

export const LANDMARK_FALLBACK_COLOR = "#94a3b8";
export const LANDMARK_ICON_CONTENT_SIZE = 24;

export function landmarkIconColor(value: unknown): string {
  return safeHexColor(value, LANDMARK_FALLBACK_COLOR).toLowerCase();
}

/** Preserve the viewers' white-collection contrast policy. */
export function landmarkIconHalo(color: string): string {
  return color.toLowerCase() === "#ffffff" ? "#0f172a" : "#ffffff";
}

export function landmarkIconImageId(icon: unknown, color: unknown): string {
  const normalized = landmarkIconColor(color);
  return `speleodb-landmark-${normalizeLandmarkIcon(icon)}-${normalized.slice(1)}-${landmarkIconHalo(normalized).slice(1)}`;
}

/** Match safeHexColor without accepting CSS color names, alpha, or short hex. */
export function landmarkColorExpression(): ExpressionSpecification {
  return [
    "let",
    "color",
    ["downcase", ["string", ["get", "collection_color"], ""]],
    [
      "case",
      [
        "all",
        ["==", ["length", ["var", "color"]], 7],
        ["==", ["slice", ["var", "color"], 0, 1], "#"],
        ...Array.from({ length: 6 }, (_, index): ExpressionSpecification => [
          "in",
          ["slice", ["var", "color"], index + 1, index + 2],
          "0123456789abcdef",
        ]),
      ],
      ["var", "color"],
      LANDMARK_FALLBACK_COLOR,
    ],
  ] as ExpressionSpecification;
}

export function landmarkHaloExpression(): ExpressionSpecification {
  return [
    "case",
    ["==", landmarkColorExpression(), "#ffffff"],
    "#0f172a",
    "#ffffff",
  ];
}

export function landmarkIconImageExpression(): ExpressionSpecification {
  return [
    "concat",
    "speleodb-landmark-",
    [
      "match",
      ["string", ["get", "icon"], "DEFAULT"],
      LANDMARK_ICON_OPTIONS.map(({ value }) => value),
      ["string", ["get", "icon"], "DEFAULT"],
      "DEFAULT",
    ],
    "-",
    ["slice", landmarkColorExpression(), 1],
    "-",
    ["slice", landmarkHaloExpression(), 1],
  ];
}

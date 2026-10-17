type StyleCameraKey = "center" | "zoom" | "bearing" | "pitch" | "roll";

/** Provider styles supply presentation; the application retains camera ownership. */
export function normalizeGlobeStyle<Style extends object>(
  style: Style,
): Omit<Style, StyleCameraKey | "projection"> & {
  projection: { type: "globe" };
} {
  const normalized = { ...style, projection: { type: "globe" as const } };
  // A shallow copy retains source/layer identity and provider/cache URLs.
  for (const key of ["center", "zoom", "bearing", "pitch", "roll"] as const) {
    delete (normalized as Partial<Record<StyleCameraKey, unknown>>)[key];
  }
  return normalized;
}

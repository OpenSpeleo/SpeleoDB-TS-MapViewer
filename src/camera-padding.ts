export interface Rectangle {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CameraPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CameraPaddingOptions {
  /** Maximum margin and fallback when the visible intersection is empty. */
  padding: number;
  /** Margin as a fraction of each remaining dimension. */
  marginRatio: number;
  /** Ordered occlusions; each cut keeps the largest remaining rectangle. */
  obstacles?: readonly Rectangle[];
}

const area = (rectangle: Rectangle) =>
  Math.max(0, rectangle.right - rectangle.left) *
  Math.max(0, rectangle.bottom - rectangle.top);

/** Fit within the viewport intersection, clearing application-owned panels. */
export function computeCameraPadding(
  map: Rectangle,
  viewport: Rectangle,
  { padding, marginRatio, obstacles = [] }: CameraPaddingOptions,
): CameraPadding | number {
  let free = {
    left: Math.max(map.left, viewport.left),
    right: Math.min(map.right, viewport.right),
    top: Math.max(map.top, viewport.top),
    bottom: Math.min(map.bottom, viewport.bottom),
  };
  if (!area(free)) return padding;
  for (const obstacle of obstacles) {
    if (
      !area(obstacle) ||
      obstacle.right <= free.left ||
      obstacle.left >= free.right ||
      obstacle.bottom <= free.top ||
      obstacle.top >= free.bottom
    )
      continue;
    // Preserve clearance from earlier panels with constant work per panel.
    const choices = [
      { ...free, right: Math.max(free.left, obstacle.left) },
      { ...free, left: Math.min(free.right, obstacle.right) },
      { ...free, bottom: Math.max(free.top, obstacle.top) },
      { ...free, top: Math.min(free.bottom, obstacle.bottom) },
    ];
    const next = choices.reduce((best, choice) =>
      area(choice) > area(best) ? choice : best,
    );
    if (area(next)) free = next;
  }
  const margin = Math.min(
    padding,
    (free.right - free.left) * marginRatio,
    (free.bottom - free.top) * marginRatio,
  );
  return {
    left: free.left - map.left + margin,
    right: map.right - free.right + margin,
    top: free.top - map.top + margin,
    bottom: map.bottom - free.bottom + margin,
  };
}

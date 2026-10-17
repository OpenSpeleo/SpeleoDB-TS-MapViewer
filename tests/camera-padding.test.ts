import { describe, expect, it } from "vitest";
import {
  computeCameraPadding,
  type CameraPadding,
} from "../src/camera-padding.js";

const rectangle = (
  left: number,
  top: number,
  right: number,
  bottom: number,
) => ({ left, top, right, bottom });
const policy = { padding: 50, marginRatio: 0.1 };

describe("visible camera padding", () => {
  it("fits beside a side panel and below an earlier panel without moving either rectangle", () => {
    const map = Object.freeze(rectangle(0, 0, 1200, 800));
    const obstacles = Object.freeze([
      Object.freeze(rectangle(784, 16, 1144, 760)),
      Object.freeze(rectangle(16, 16, 266, 96)),
    ]);
    expect(computeCameraPadding(map, map, { ...policy, obstacles })).toEqual({
      left: 50,
      right: 466,
      top: 146,
      bottom: 50,
    });
  });

  it("accounts for an offscreen map tail and a bottom sheet", () => {
    const map = rectangle(33, 220, 357, 983);
    const padding = computeCameraPadding(map, rectangle(0, 0, 390, 844), {
      ...policy,
      obstacles: [rectangle(43, 450, 347, 834), rectangle(49, 236, 299, 306)],
    }) as CameraPadding;
    expect(map.top + padding.top).toBeGreaterThan(306);
    expect(map.bottom - padding.bottom).toBeLessThan(450);
    expect(map.left + padding.left).toBeGreaterThan(33);
    expect(map.right - padding.right).toBeLessThan(357);
  });

  it.each([120, 390, 1440])(
    "keeps valid padding as viewport size changes to %i",
    (size) => {
      const map = rectangle(0, 0, size, size);
      const padding = computeCameraPadding(map, map, policy) as CameraPadding;
      expect(padding.left + padding.right).toBeLessThan(size);
      expect(padding.top + padding.bottom).toBeLessThan(size);
    },
  );

  it("supports caller-selected margin ratios for a reduced visible height", () => {
    const map = rectangle(0, 0, 400, 800);
    expect(
      computeCameraPadding(map, rectangle(0, 0, 400, 160), {
        padding: 64,
        marginRatio: 0.25,
      }),
    ).toEqual({ left: 40, right: 40, top: 40, bottom: 680 });
  });

  it.each([
    rectangle(0, 0, 0, 0),
    rectangle(400, 400, 500, 500),
    rectangle(100, 100, 50, 50),
  ])("uses the caller fallback for an empty intersection (%j)", (viewport) => {
    expect(
      computeCameraPadding(rectangle(0, 0, 200, 200), viewport, {
        padding: 24,
        marginRatio: 0.1,
      }),
    ).toBe(24);
  });

  it("ignores empty/outside obstacles and retains the previous region when fully occluded", () => {
    const map = rectangle(0, 0, 100, 100);
    expect(
      computeCameraPadding(map, map, {
        ...policy,
        obstacles: [
          rectangle(0, 0, 0, 0),
          rectangle(150, 150, 200, 200),
          rectangle(-1, -1, 101, 101),
        ],
      }),
    ).toEqual(computeCameraPadding(map, map, policy));
  });

  it("selects the first equally sized cut deterministically and respects panel ordering", () => {
    const map = rectangle(0, 0, 100, 100);
    expect(
      computeCameraPadding(map, map, {
        ...policy,
        obstacles: [rectangle(40, 40, 60, 60)],
      }),
    ).toEqual({ left: 4, right: 64, top: 4, bottom: 4 });
  });
});

import { describe, expect, it } from "vitest";
import { announceMapCreated, MAP_CREATED_EVENT } from "../src/map-events.js";
import { maximumPanError } from "../src/testing/gestures.js";

describe("shared gesture measurement contract", () => {
  it("measures the complete pan path in CSS coordinates", () => {
    expect(
      maximumPanError(
        { x: 100, y: 200 },
        [
          { x: 100, y: 204 },
          { x: 100, y: 208 },
        ],
        [0, 8],
      ),
    ).toBe(0);
    expect(
      maximumPanError(
        { x: 100, y: 200 },
        [
          { x: 104, y: 200 },
          { x: 100, y: 208 },
        ],
        [0, 8],
      ),
    ).toBe(4);
    expect(
      maximumPanError(
        { x: 100, y: 200 },
        [
          { x: 96, y: 200 },
          { x: 92, y: 200 },
        ],
        [-8, 0],
      ),
    ).toBe(0);
  });

  it("rejects empty and non-finite measurements instead of silently passing them", () => {
    expect(() => maximumPanError({ x: 0, y: 0 }, [], [0, 8])).toThrow(
      "input samples",
    );
    expect(() =>
      maximumPanError({ x: 0, y: 0 }, [{ x: NaN, y: 0 }], [0, 8]),
    ).toThrow("finite");
  });

  it("announces the original instance through a real EventTarget", () => {
    const target = new EventTarget();
    const map = { id: "viewer" };
    const received: unknown[] = [];
    target.addEventListener(MAP_CREATED_EVENT, (event) =>
      received.push((event as CustomEvent).detail.map),
    );
    announceMapCreated(map, target);
    expect(received).toEqual([map]);
  });
});

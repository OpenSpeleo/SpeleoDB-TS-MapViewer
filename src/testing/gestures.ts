import type { Page } from "@playwright/test";
import type { FeatureCollection, LineString } from "geojson";
import type { GeoJSONSource, LngLat, Map as RendererMap } from "maplibre-gl";
import { MAP_CREATED_EVENT } from "../map-events.js";

export interface ScreenPoint {
  x: number;
  y: number;
}
export interface Contact extends ScreenPoint {
  id: number;
}
export interface GestureObservation {
  point: ScreenPoint;
  zoom: number;
  bearing: number;
  pitch: number;
}
export interface GesturePath {
  before: GestureObservation;
  path: GestureObservation[];
  maximumError: number;
}
export const GESTURE_STEPS = 12;
export const GESTURE_DISTANCE = 48;
export const GESTURE_AXIS_TOLERANCE = 1;
export const GESTURE_DIRECTIONS = [
  [0, 48],
  [0, -48],
  [48, 0],
  [-48, 0],
] as const;

declare global {
  interface Window {
    __speleoGesture: {
      map: RendererMap;
      anchor: LngLat;
      collections: FeatureCollection<LineString>[];
      sourcePrefix: string;
      inputEvents: { wheel: number; drag: number };
    };
  }
}

/** Observe the production map without replacing a constructor or camera method. */
export async function observeGestureMap(page: Page): Promise<void> {
  await page.addInitScript((eventName) => {
    window.addEventListener(eventName, (event) => {
      const { map } = (event as CustomEvent<{ map: RendererMap }>).detail;
      window.__speleoGesture = {
        map,
        anchor: map.getCenter(),
        collections: [],
        sourcePrefix: "gesture-regression-",
        inputEvents: { wheel: 0, drag: 0 },
      };
      map.on("zoomstart", (event) => {
        if (event.originalEvent?.type === "wheel")
          window.__speleoGesture.inputEvents.wheel++;
      });
      map.on("dragstart", (event) => {
        if (event.originalEvent?.type === "mousemove")
          window.__speleoGesture.inputEvents.drag++;
      });
    });
  }, MAP_CREATED_EVENT);
}

/** Two animation frames include a paint opportunity between input samples. */
export async function gestureFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

export async function waitForGestureMap(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__speleoGesture?.map.isStyleLoaded());
}

export async function setGestureCamera(
  page: Page,
  center: [number, number],
  zoom: number,
): Promise<void> {
  await page.evaluate(
    ({ center, zoom }) => {
      window.__speleoGesture.map.stop();
      window.__speleoGesture.map.jumpTo({ center, zoom, bearing: 0, pitch: 0 });
    },
    { center, zoom },
  );
  await gestureFrame(page);
}

export async function gestureCanvasPoint(
  page: Page,
  offset: ScreenPoint = { x: 0, y: 0 },
): Promise<ScreenPoint> {
  return page.evaluate((offset) => {
    const box = window.__speleoGesture.map.getCanvas().getBoundingClientRect();
    if (!box.width || !box.height)
      throw new Error("The gesture canvas is not visible");
    return {
      x: box.left + box.width / 2 + offset.x,
      y: box.top + box.height / 2 + offset.y,
    };
  }, offset);
}

export async function anchorGesture(
  page: Page,
  point: ScreenPoint,
): Promise<GestureObservation> {
  return page.evaluate(({ x, y }) => {
    const state = window.__speleoGesture;
    const box = state.map.getCanvas().getBoundingClientRect();
    state.anchor = state.map.unproject([x - box.left, y - box.top]);
    return {
      point: state.map.project(state.anchor),
      zoom: state.map.getZoom(),
      bearing: state.map.getBearing(),
      pitch: state.map.getPitch(),
    };
  }, point);
}

export async function observeGestureAnchor(
  page: Page,
): Promise<GestureObservation> {
  return page.evaluate(() => {
    const { map, anchor } = window.__speleoGesture;
    return {
      point: map.project(anchor),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
  });
}

/** A final endpoint alone can hide a wrong intermediate direction. */
export function maximumPanError(
  before: ScreenPoint,
  path: readonly ScreenPoint[],
  delta: readonly [number, number],
): number {
  if (!path.length)
    throw new Error("A gesture path must contain input samples");
  const errors = path.flatMap((point, index) => [
    Math.abs(point.x - before.x - (delta[0] * (index + 1)) / path.length),
    Math.abs(point.y - before.y - (delta[1] * (index + 1)) / path.length),
  ]);
  if (errors.some((value) => !Number.isFinite(value)))
    throw new Error("Gesture coordinates must be finite");
  return Math.max(...errors);
}

export async function waitForGestureEnd(page: Page): Promise<void> {
  await page.waitForFunction(() => !window.__speleoGesture.map.isMoving());
}

/** Read-only invariant at the pinned engine's Camera-owned moveend cleanup seam. */
export async function assertGestureCameraReleased(page: Page): Promise<void> {
  await waitForGestureEnd(page);
  const requested = await page.evaluate(() =>
    Boolean(
      (
        window.__speleoGesture.map as unknown as {
          _camera: { _requestedCameraState: unknown };
        }
      )._camera._requestedCameraState,
    ),
  );
  if (requested)
    throw new Error("Camera must release its requested transform at moveend");
}

export async function dragGesturePath(
  page: Page,
  origin: ScreenPoint,
  delta: readonly [number, number],
  beforeStep?: (step: number) => Promise<void>,
): Promise<GesturePath> {
  await page.mouse.move(origin.x, origin.y);
  const before = await anchorGesture(page, origin);
  const path: GestureObservation[] = [];
  await page.mouse.down();
  try {
    for (let step = 1; step <= GESTURE_STEPS; step++) {
      await beforeStep?.(step);
      await page.mouse.move(
        origin.x + (delta[0] * step) / GESTURE_STEPS,
        origin.y + (delta[1] * step) / GESTURE_STEPS,
      );
      await gestureFrame(page);
      path.push(await observeGestureAnchor(page));
    }
  } finally {
    await page.mouse.up();
  }
  await waitForGestureEnd(page);
  return {
    before,
    path,
    maximumError: maximumPanError(
      before.point,
      path.map((sample) => sample.point),
      delta,
    ),
  };
}

export async function wheelToGestureZoom(
  page: Page,
  point: ScreenPoint,
  target: number,
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  const initialZoom = await page.evaluate(() =>
    window.__speleoGesture.map.getZoom(),
  );
  const direction = initialZoom > target ? 1 : -1;
  for (let step = 0; step < 18; step++) {
    await page.mouse.wheel(0, 80 * direction);
    await page.waitForFunction(
      () => !window.__speleoGesture.map.scrollZoom.isActive(),
    );
    await gestureFrame(page);
    const zoom = await page.evaluate(() =>
      window.__speleoGesture.map.getZoom(),
    );
    if (direction > 0 ? zoom <= target : zoom >= target) {
      if (!(
        zoom > (direction > 0 ? 11 : 12) && zoom < (direction > 0 ? 12 : 13)
      )) {
        throw new Error(
          `Wheel input skipped the projection transition: ${zoom}`,
        );
      }
      return;
    }
  }
  throw new Error(`Wheel input did not reach zoom ${target}`);
}

/** Synthetic survey data, never persistent application records or intercepted HTTP. */
export async function installGestureSources(
  page: Page,
  options: {
    center: [number, number];
    sourceCount: number;
    featuresPerSource: number;
  },
): Promise<void> {
  await page.evaluate(({ center, sourceCount, featuresPerSource }) => {
    const state = window.__speleoGesture;
    state.collections = Array.from({ length: sourceCount }, (_, source) => ({
      type: "FeatureCollection",
      features: Array.from({ length: featuresPerSource }, (_, index) => {
        const longitude =
          center[0] - 0.1 + source * 0.01 + (index % 100) * 0.0001;
        const latitude = center[1] - 0.05 + Math.floor(index / 100) * 0.002;
        return {
          type: "Feature",
          properties: { revision: 0 },
          geometry: {
            type: "LineString",
            coordinates: [
              [longitude, latitude],
              [longitude + 0.0005, latitude + 0.0005],
            ],
          },
        };
      }),
    }));
    for (const [index, data] of state.collections.entries()) {
      const id = `${state.sourcePrefix}${index}`;
      const source = state.map.getSource<GeoJSONSource>(id);
      if (source) void source.setData(data);
      else {
        state.map.addSource(id, { type: "geojson", data });
        state.map.addLayer({
          id,
          type: "line",
          source: id,
          paint: { "line-color": "#ffcc00", "line-width": 1 },
        });
      }
    }
  }, options);
}

export async function refreshGestureSource(
  page: Page,
  step: number,
): Promise<void> {
  await page.evaluate((step) => {
    const state = window.__speleoGesture;
    const index = (step - 1) % state.collections.length;
    const data = state.collections[index];
    if (!data)
      throw new Error(
        "Install the gesture source workload before refreshing it",
      );
    const next: FeatureCollection<LineString> = {
      ...data,
      features: data.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          revision: Number(feature.properties?.revision) + 1,
        },
      })),
    };
    state.collections[index] = next;
    // Updates overlap the gesture instead of waiting for the worker each step.
    void state.map
      .getSource<GeoJSONSource>(`${state.sourcePrefix}${index}`)!
      .setData(next);
  }, step);
}

export async function waitForGestureSources(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const { map, collections, sourcePrefix } = window.__speleoGesture;
    return collections.every((_, index) =>
      map.isSourceLoaded(`${sourcePrefix}${index}`),
    );
  });
}

/** Trusted Chromium input; WebKit contact-list replay is not native iOS evidence. */
export async function touchInput(page: Page, browserName: string) {
  const cdp =
    browserName === "chromium"
      ? await page.context().newCDPSession(page)
      : null;
  let active: Contact[] = [];
  const dispatch = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    changed: Contact[],
  ) => {
    if (cdp) {
      // Protocol acknowledgement is not proof that the compositor delivered the
      // contacts to the DOM. Observe delivery before starting the paint boundary.
      const delivery = await page.evaluateHandle(
        ({ eventType, expected }) => {
          const canvas = window.__speleoGesture.map.getCanvas();
          let resolve!: () => void;
          const promise = new Promise<void>((done) => {
            resolve = done;
          });
          const received = (raw: Event) => {
            const event = raw as TouchEvent;
            const contacts = Array.from(event.touches);
            if (!event.isTrusted || contacts.length !== expected.length) return;
            // Native contacts use float32 coordinates; this tolerance only matches
            // delivery, never the geographic-anchor assertion.
            if (
              !expected.every((point) =>
                contacts.some(
                  (contact) =>
                    Math.abs(contact.clientX - point.x) < 0.001 &&
                    Math.abs(contact.clientY - point.y) < 0.001,
                ),
              )
            )
              return;
            cancel();
            resolve();
          };
          const cancel = () =>
            canvas.removeEventListener(eventType, received, true);
          canvas.addEventListener(eventType, received, {
            capture: true,
            passive: true,
          });
          return { promise, cancel };
        },
        { eventType: type.toLowerCase(), expected: active },
      );
      try {
        // CDP touchEnd describes the removed contacts, not those still held down.
        await cdp.send("Input.dispatchTouchEvent", {
          type,
          touchPoints: (type === "touchEnd" ? changed : active).map(
            (point) => ({
              ...point,
              radiusX: 1,
              radiusY: 1,
              force: 1,
            }),
          ),
        });
        await delivery.evaluate((state) => state.promise);
      } finally {
        await delivery.evaluate((state) => state.cancel());
        await delivery.dispose();
      }
    } else {
      await page.evaluate(
        ({ type, active, changed }) => {
          const canvas = window.__speleoGesture.map.getCanvas();
          const touches = (points: Contact[]) =>
            points.map((point) => ({
              identifier: point.id,
              target: canvas,
              clientX: point.x,
              clientY: point.y,
              pageX: point.x,
              pageY: point.y,
              screenX: point.x,
              screenY: point.y,
            }));
          // WebKit automation cannot construct Touch instances. MapLibre consumes
          // these standard event lists; this replays its real handler lifecycle.
          const event = new Event(type.toLowerCase(), {
            bubbles: true,
            cancelable: true,
          });
          Object.defineProperties(event, {
            touches: { value: touches(active) },
            targetTouches: { value: touches(active) },
            changedTouches: { value: touches(changed) },
          });
          canvas.dispatchEvent(event);
        },
        { type, active, changed },
      );
    }
    await gestureFrame(page);
  };
  return {
    async start(points: Contact[]) {
      active = points;
      await dispatch("touchStart", points);
    },
    async move(points: Contact[]) {
      active = points;
      await dispatch("touchMove", points);
    },
    async end(ids: number[]) {
      const removed = active.filter((point) => ids.includes(point.id));
      if (removed.length !== ids.length)
        throw new Error("Only active touch contacts can end");
      active = active.filter((point) => !ids.includes(point.id));
      await dispatch("touchEnd", removed);
    },
    async dispose() {
      await cdp?.detach();
    },
  };
}

/** Start and shrink a symmetric two-contact pinch without ending either contact. */
export async function pinchGesture(
  touch: Awaited<ReturnType<typeof touchInput>>,
  origin: ScreenPoint,
  { from = 100, to = 50 }: { from?: number; to?: number } = {},
): Promise<[Contact, Contact]> {
  const contacts = (span: number): [Contact, Contact] => [
    { id: 1, x: origin.x - span, y: origin.y },
    { id: 2, x: origin.x + span, y: origin.y },
  ];
  await touch.start(contacts(from));
  for (let step = 1; step <= GESTURE_STEPS; step++)
    await touch.move(contacts(from + ((to - from) * step) / GESTURE_STEPS));
  return contacts(to);
}

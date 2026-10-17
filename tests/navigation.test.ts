import { Evented, type MapEventType } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { createMapNavigation } from "../src/navigation.js";

class CameraEvents extends Evented<Pick<MapEventType, "movestart">> {}

describe("camera navigation ownership", () => {
  it("shares latest intent across entity types within one viewer", () => {
    const navigation = createMapNavigation();
    const map = new CameraEvents();
    const gps = navigation.begin(map, "gps:one");
    const project = navigation.begin(map, "project:two");
    expect(gps.isCurrent()).toBe(false);
    expect(project.isCurrent()).toBe(true);
  });

  it("cancels only a matching entity unless cancellation is unconditional", () => {
    const navigation = createMapNavigation();
    const map = new CameraEvents();
    const intent = navigation.begin(map, "gis-layer:one");
    navigation.cancel("gps:other");
    expect(intent.isCurrent()).toBe(true);
    navigation.cancel("gis-layer:one");
    expect(intent.isCurrent()).toBe(false);
    const next = navigation.begin(map, "project:two");
    navigation.cancel();
    expect(next.isCurrent()).toBe(false);
  });

  it("cancels user gestures while preserving programmatic camera motion", () => {
    const navigation = createMapNavigation();
    const map = new CameraEvents();
    const intent = navigation.begin(map, "project:one");
    map.fire("movestart");
    expect(intent.isCurrent()).toBe(true);
    map.fire("movestart", { originalEvent: new Event("pointerdown") });
    expect(intent.isCurrent()).toBe(false);
  });

  it("detaches old maps on replacement and removes its listener on teardown", () => {
    const navigation = createMapNavigation();
    const oldMap = new CameraEvents();
    const map = new CameraEvents();
    const oldIntent = navigation.begin(oldMap, "project:one");
    const current = navigation.begin(map, "project:two");
    expect(oldIntent.isCurrent()).toBe(false);
    expect(oldMap.listens("movestart")).toBe(false);
    expect(map.listens("movestart")).toBe(true);
    oldMap.fire("movestart", { originalEvent: new Event("wheel") });
    expect(current.isCurrent()).toBe(true);
    navigation.reset();
    expect(current.isCurrent()).toBe(false);
    expect(map.listens("movestart")).toBe(false);
  });

  it("keeps instances independent even when they observe the same map", () => {
    const first = createMapNavigation();
    const second = createMapNavigation();
    const map = new CameraEvents();
    const a = first.begin(map, "project:one");
    const b = second.begin(map, "project:two");
    first.reset();
    expect(a.isCurrent()).toBe(false);
    expect(b.isCurrent()).toBe(true);
    expect(map.listens("movestart")).toBe(true);
    map.fire("movestart", { originalEvent: new Event("touchstart") });
    expect(b.isCurrent()).toBe(false);
    second.reset();
    expect(map.listens("movestart")).toBe(false);
  });

  it("supports absent maps and ports without gesture subscriptions", () => {
    const navigation = createMapNavigation();
    expect(navigation.begin(null, "absent").isCurrent()).toBe(false);
    const map = {};
    const current = navigation.begin(map, "present");
    expect(current.isCurrent()).toBe(true);
    navigation.reset(map);
    expect(current.isCurrent()).toBe(false);
  });
});

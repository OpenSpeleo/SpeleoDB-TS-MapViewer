/** Only gesture subscriptions are needed to own asynchronous camera intent. */
export interface NavigationGesture {
  originalEvent?: unknown;
}

export interface NavigationMap {
  on?(event: "movestart", handler: (event: NavigationGesture) => void): unknown;
  off?(
    event: "movestart",
    handler: (event: NavigationGesture) => void,
  ): unknown;
}

export interface NavigationIntent {
  isCurrent(this: void): boolean;
}

export interface MapNavigation {
  begin(
    this: void,
    map: NavigationMap | null,
    entityKey: string,
  ): NavigationIntent;
  cancel(this: void, entityKey?: string): void;
  reset(this: void, map?: NavigationMap | null): void;
}

/** One owner per viewer; a user gesture or newer intent invalidates older work. */
export function createMapNavigation(): MapNavigation {
  let activeMap: NavigationMap | null = null;
  let activeIntent: { entityKey: string } | null = null;

  function cancel(entityKey?: string) {
    if (entityKey === undefined || activeIntent?.entityKey === entityKey) {
      activeIntent = null;
    }
  }

  function cancelOnGesture(event: NavigationGesture) {
    if (event.originalEvent) cancel();
  }

  function reset(map: NavigationMap | null = null) {
    activeMap?.off?.("movestart", cancelOnGesture);
    activeMap = map;
    activeIntent = null;
    activeMap?.on?.("movestart", cancelOnGesture);
  }

  return {
    begin(map, entityKey) {
      if (activeMap !== map) reset(map);
      const intent = { entityKey };
      activeIntent = intent;
      return {
        isCurrent: () =>
          activeIntent === intent && activeMap === map && Boolean(map),
      };
    },
    cancel,
    reset,
  };
}

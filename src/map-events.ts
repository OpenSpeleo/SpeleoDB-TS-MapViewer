/** Public observation seam shared by all SpeleoDB viewer entrypoints. */
export const MAP_CREATED_EVENT = "speleo:map-created";

/** The application calls this once when its map instance is initialized. */
export function announceMapCreated(
  map: unknown,
  target: Pick<EventTarget, "dispatchEvent"> = window,
): void {
  target.dispatchEvent(new CustomEvent(MAP_CREATED_EVENT, { detail: { map } }));
}

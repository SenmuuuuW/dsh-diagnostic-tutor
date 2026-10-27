/** Cross-surface signals so pause/resume updates the map and the lesson tab together. */
export const PATH_PAUSED_EVENT = 'udt:path-paused'
export const PATH_RESUMED_EVENT = 'udt:path-resumed'

export function announcePathState(paused: boolean): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(paused ? PATH_PAUSED_EVENT : PATH_RESUMED_EVENT))
}

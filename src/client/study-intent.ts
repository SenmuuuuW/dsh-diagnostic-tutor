/**
 * Open the already-mounted lesson tab directly in focused Study.
 *
 * Home and Course both know *which* lesson to continue, but the docked lesson
 * tab owns the study surface. A module-level pending flag covers the case where
 * the tab mounts after the request; the event covers an already-mounted tab.
 */
export const STUDY_INTENT_EVENT = 'diagnostic-tutor:open-study'

let pending = false

export function requestStudy(): void {
  pending = true
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STUDY_INTENT_EVENT))
}

export function consumeStudyIntent(): boolean {
  if (!pending) return false
  pending = false
  return true
}

/** Test-only: clear a request that no mounted tab consumed. */
export function resetStudyIntentForTests(): void {
  pending = false
}

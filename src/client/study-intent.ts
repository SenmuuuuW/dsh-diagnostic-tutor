/**
 * Open the already-mounted lesson tab directly in focused Study.
 *
 * Home and Course know *which* lesson to continue, but the docked lesson tab
 * owns the study surface. A module-level pending request covers the case where
 * the tab mounts after the request; the event covers an already-mounted tab.
 * The request also carries whether Study should take the full frame.
 */
export const STUDY_INTENT_EVENT = 'diagnostic-tutor:open-study'

export interface StudyIntent {
  fullscreen: boolean
}

let pending: StudyIntent | null = null

export function requestStudy(fullscreen = false): void {
  pending = { fullscreen }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STUDY_INTENT_EVENT))
}

export function consumeStudyIntent(): StudyIntent | null {
  if (pending === null) return null
  const intent = pending
  pending = null
  return intent
}

/** Test-only: clear a request that no mounted tab consumed. */
export function resetStudyIntentForTests(): void {
  pending = null
}

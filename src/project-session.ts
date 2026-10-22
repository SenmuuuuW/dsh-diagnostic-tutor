/**
 * Which conversation should "continue learning" open?
 *
 * A project is shared; where the learner was last actually learning it is not.
 * Focuses, course runs and project selections all carry a conversation id, in
 * that order of strength: an active focus is a lesson in progress, a course run
 * is a planned lesson that was explicitly started, and a selection only says the
 * conversation once opened the project.
 *
 * The newest candidate wins. That keeps two conversations on the same project
 * from stealing each other: whoever last acted is the one resumed, and a
 * conversation that has not started anything never jumps ahead of one that has.
 *
 * Pure read-only resolution: it never selects, starts or writes anything.
 */

import type { UdState } from './state.js'

/** Why a conversation was chosen, for the UI and for tests. */
export type LearningSessionReason = 'active-focus' | 'active-run' | 'recent-project' | 'current'

export interface LearningSession {
  readonly sessionId: string
  readonly reason: LearningSessionReason
}

/** The newest record by one ISO timestamp field. */
function newest<T>(records: readonly T[], at: (record: T) => string): T | undefined {
  return [...records].sort((left, right) => Date.parse(at(right)) - Date.parse(at(left)))[0]
}

/**
 * Resolve the conversation that should handle "enter learning" for a project.
 *
 * @param state - the open state handle.
 * @param courseId - the project being entered.
 * @param currentSessionId - the conversation asking, used only when no stored
 *   conversation has ever touched the project.
 * @returns the target conversation, or `null` when the project does not exist.
 */
export function resolveLearningSession(
  state: UdState,
  courseId: string,
  currentSessionId?: string,
): LearningSession | null {
  if (state.readCourse(courseId) === undefined) return null

  const focus = newest(
    state.listFocus().filter(
      (record): record is typeof record & { sessionId: string } =>
        record.courseId === courseId &&
        record.status === 'active' &&
        typeof record.sessionId === 'string' &&
        record.sessionId.length > 0,
    ),
    (record) => record.startedAt,
  )
  if (focus !== undefined) return { sessionId: focus.sessionId, reason: 'active-focus' }

  const run = newest(
    state.listCourseRuns().filter((record) => record.courseId === courseId && record.attempts.length > 0),
    (record) => record.updatedAt,
  )
  if (run !== undefined) return { sessionId: run.sessionId, reason: 'active-run' }

  const project = newest(
    state.listProjects().filter((record) => record.courseId === courseId),
    (record) => record.selectedAt,
  )
  if (project !== undefined) return { sessionId: project.sessionId, reason: 'recent-project' }

  return currentSessionId !== undefined && currentSessionId.length > 0
    ? { sessionId: currentSessionId, reason: 'current' }
    : null
}

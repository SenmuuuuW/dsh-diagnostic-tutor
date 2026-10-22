/** Which conversation "continue learning" resumes. Pure resolution, no writes. */

import { describe, expect, it } from 'vitest'

import { resolveLearningSession } from '../src/project-session.js'
import type { CourseRun } from '../src/path.js'
import type { FocusRecord, ProjectRecord, UdState } from '../src/state.js'

const focus = (sessionId: string | undefined, startedAt: string): FocusRecord => ({
  courseId: 'ml',
  nodeId: 'ml:goal',
  status: 'active',
  startedAt,
  updatedAt: startedAt,
  ...(sessionId === undefined ? {} : { sessionId }),
})

const run = (sessionId: string, updatedAt: string, attempts = 1): CourseRun => ({
  courseId: 'ml',
  sessionId,
  revision: 1,
  activeAttemptId: attempts > 0 ? 'attempt' : null,
  attempts: Array.from({ length: attempts }, () => ({
    id: 'attempt',
    operationId: 'op',
    operations: ['op'],
    dispatchId: null,
    version: 1,
    itemId: 'item',
    status: 'working' as const,
    nodeId: null,
    startedAt: updatedAt,
    updatedAt,
    prompted: true,
    promptReason: null,
    outcome: null,
    evidence: [],
    units: [],
  })),
  updatedAt,
})

const project = (sessionId: string, selectedAt: string): ProjectRecord => ({
  sessionId,
  courseId: 'ml',
  selectedAt,
})

function stateOf(input: {
  exists?: boolean
  focuses?: FocusRecord[]
  runs?: CourseRun[]
  projects?: ProjectRecord[]
}): UdState {
  return {
    readCourse: () => (input.exists === false ? undefined : ({} as never)),
    listFocus: () => input.focuses ?? [],
    listCourseRuns: () => input.runs ?? [],
    listProjects: () => input.projects ?? [],
  } as unknown as UdState
}

describe('resolving the conversation that should resume a project', () => {
  it('returns null for a project that does not exist', () => {
    expect(resolveLearningSession(stateOf({ exists: false }), 'ml', 'here')).toBeNull()
  })

  it('prefers the newest active focus, ignoring ended and session-less records', () => {
    const resolved = resolveLearningSession(stateOf({
      focuses: [
        focus('older', '2026-01-01T00:00:00.000Z'),
        focus('newer', '2026-01-03T00:00:00.000Z'),
        { ...focus('ended', '2026-01-04T00:00:00.000Z'), status: 'ended' },
        focus(undefined, '2026-01-05T00:00:00.000Z'),
      ],
      runs: [run('run-session', '2026-01-06T00:00:00.000Z')],
      projects: [project('project-session', '2026-01-07T00:00:00.000Z')],
    }), 'ml', 'here')
    expect(resolved).toEqual({ sessionId: 'newer', reason: 'active-focus' })
  })

  it('falls back to the newest course run, then the newest project selection', () => {
    expect(resolveLearningSession(stateOf({
      runs: [run('run-old', '2026-01-01T00:00:00.000Z'), run('run-new', '2026-01-02T00:00:00.000Z')],
      projects: [project('project-session', '2026-01-03T00:00:00.000Z')],
    }), 'ml', 'here')).toEqual({ sessionId: 'run-new', reason: 'active-run' })

    expect(resolveLearningSession(stateOf({
      runs: [run('empty-run', '2026-01-09T00:00:00.000Z', 0)],
      projects: [project('project-old', '2026-01-01T00:00:00.000Z'), project('project-new', '2026-01-02T00:00:00.000Z')],
    }), 'ml', 'here')).toEqual({ sessionId: 'project-new', reason: 'recent-project' })
  })

  it('falls back to the asking conversation when no stored conversation touched the project', () => {
    expect(resolveLearningSession(stateOf({}), 'ml', 'here')).toEqual({ sessionId: 'here', reason: 'current' })
    expect(resolveLearningSession(stateOf({}), 'ml')).toBeNull()
  })
})

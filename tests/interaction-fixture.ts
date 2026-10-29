import { LearningPathSchema, emptyRun, type CourseRun } from '../src/path.js'
import type { UdState } from '../src/state.js'

const NOW = '2026-01-01T00:00:00.000Z'

/** Seed an accepted route + active attempt with quiz and flashcard blocks, without planning UI. */
export async function newAttemptRun(state: UdState, input: { courseId: string; sessionId: string; attemptId: string; nodeId: string; now?: string }): Promise<CourseRun> {
  const now = input.now ?? NOW
  const path = LearningPathSchema.parse({
    courseId: input.courseId,
    revision: 1,
    briefRevision: 1,
    assessmentRevision: 1,
    brief: null,
    assessment: null,
    curricula: [{
      version: 1,
      briefRevision: 1,
      assessmentRevision: 1,
      createdAt: now,
      acceptedAt: now,
      title: 'Test route',
      summary: 'Test route.',
      modules: [{ id: 'm1', title: 'Module', overview: 'Module.', outcomes: ['One'], milestone: 'One' }],
      items: [{
        id: 'vectors', moduleId: 'm1', title: 'Vectors', overview: 'Vectors.', outcomes: ['One'], outline: ['One'],
        topics: ['vectors'], nodeIds: [input.nodeId], practice: 'Practice.', assessment: 'Assessment.',
        minutes: { min: 20, max: 30 },
      }],
      edges: [], assumptions: [], changeReason: 'Test',
    }],
    acceptedVersion: 1,
    requests: [],
    updatedAt: now,
  })
  await state.mutatePath(input.courseId, 0, () => path)
  const lesson = {
    id: 'lesson-one', courseId: input.courseId, nodeId: input.nodeId, title: 'Vectors', origin: 'tutor' as const,
    createdAt: now, updatedAt: now,
    blocks: [
      { id: 'quiz', type: 'quiz' as const, content: { questions: [{ id: 'q1', kind: 'mcq' as const, prompt: 'Which?', options: ['A', 'B'] }] } },
      { id: 'card', type: 'flashcard' as const, content: { front: 'front', back: 'back' } },
    ],
  }
  const run = emptyRun(input.courseId, input.sessionId, now)
  run.revision = 0
  const attempt = {
    id: input.attemptId, operationId: 'op', operations: ['op'], dispatchId: null, version: 1, itemId: 'vectors',
    status: 'working' as const, nodeId: input.nodeId, startedAt: now, updatedAt: now, prompted: true,
    promptReason: null, outcome: null, evidence: [], units: [{ id: 'u1', writtenAt: now, lesson }], responses: [],
  }
  run.activeAttemptId = attempt.id
  run.attempts = [attempt]
  await state.mutateCourseRun(input.courseId, input.sessionId, () => run)
  return state.readCourseRun(input.courseId, input.sessionId)!
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { buildInsights } from '../src/insights.js'
import { openUdState } from '../src/state.js'
import type { CourseRecord, NodeRecord } from '../src/state.js'
import type { TaskRecord } from '../src/plan.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'

const NOW = '2026-01-10T12:00:00.000Z'

async function seeded() {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
  const course: CourseRecord = { id: 'ml', title: 'Machine Learning', goal: 'learn ml', status: 'active', createdAt: NOW, updatedAt: NOW }
  await state.writeCourse(course)
  const node: NodeRecord = {
    id: 'ml:weak', courseId: 'ml', title: 'Weak math', relation: 'part-of', state: 'weak',
    evidence: [
      { kind: 'diagnosis', at: '2026-01-09T12:00:00.000Z', note: 'needs work' },
      { kind: 'practice', at: '2026-01-10T10:00:00.000Z', note: 'tried again' },
    ],
    createdAt: NOW, updatedAt: NOW,
  }
  await state.writeNode(node)
  await state.writeReviewCard({
    id: 'card-1', courseId: 'ml', front: 'Q', back: 'A', dueAt: '2026-01-09T00:00:00.000Z',
    intervalDays: 1, ease: 2.5, reps: 2, lapses: 2, status: 'open', createdAt: NOW, updatedAt: NOW,
  })
  await state.writeReviewLog({
    id: 'log-1', cardId: 'card-1', rating: 'again', at: '2026-01-09T12:00:00.000Z',
    previousDue: '2026-01-08T00:00:00.000Z', nextDue: '2026-01-09T00:10:00.000Z', intervalDays: 0, ease: 2.3,
    previousIntervalDays: 1, previousEase: 2.5, previousReps: 1, previousLapses: 1,
  })
  const task: TaskRecord = { id: 'task-1', courseId: 'ml', title: 'Practice', dueAt: '2026-01-10T18:00:00.000Z', status: 'open', createdAt: NOW, updatedAt: NOW }
  await state.writeTask(task)
  return { harness, state, course }
}

describe('insights', () => {
  it('projects counts and recorded weakness without inventing a score', async () => {
    const { harness, state, course } = await seeded()
    try {
      const view = buildInsights(state, course, NOW)
      expect(view.review).toMatchObject({ due: 1, overdue: 1, total: 1 })
      expect(view.review.lapsed[0]).toMatchObject({ id: 'card-1', lapses: 2 })
      expect(view.evidence.total).toBe(2)
      expect(view.evidence.byKind).toEqual([{ kind: 'diagnosis', count: 1 }, { kind: 'practice', count: 1 }])
      expect(view.weakNodes[0]).toMatchObject({ id: 'ml:weak', state: 'weak' })
      expect(view.recentReviews[0]?.rating).toBe('again')
      expect(view.tasks).toMatchObject({ open: 1, dueToday: 1 })
      expect(JSON.stringify(view)).not.toMatch(/%|mastery|score/i)
    } finally { await harness.close() }
  })

  it('serves the course view through the trust fence', async () => {
    const { harness, state } = await seeded()
    try {
      const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }) }))
      const res = { statusCode: 0, body: '', setHeader() {}, end(chunk: string) { this.body += chunk } }
      await handler({ method: 'GET', url: `${API_PREFIX}/insights?courseId=ml`, headers: { host: '127.0.0.1:3080' }, async *[Symbol.asyncIterator]() {} } as unknown as IncomingMessage, res as unknown as ServerResponse)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.courseId).toBe('ml')
      expect(body.review.total).toBe(1)
      expect(body.weakNodes).toHaveLength(1)
    } finally { await harness.close() }
  })
})

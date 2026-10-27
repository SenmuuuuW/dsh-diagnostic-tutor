/** Quiz/flashcard submissions are recorded, never graded and never a state change. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { recordBlockResponse } from '../src/interactions.js'
import { newAttemptRun } from './interaction-fixture.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'

const COURSE = 'ml'
const SESSION = 'session-under-test'
const NODE = 'ml:vectors'
const NOW = '2026-01-01T00:00:00.000Z'
const ATTEMPT = 'attempt-one'

async function seed(state: UdState): Promise<void> {
  await state.writeCourse({ id: COURSE, title: 'Machine Learning', goal: 'Learn', status: 'active', createdAt: NOW, updatedAt: NOW })
  await state.writeNode(newNode({ id: NODE, courseId: COURSE, title: 'Vectors', relation: 'part-of', now: NOW }))
  await state.selectProject(SESSION, COURSE, NOW)
  await newAttemptRun(state, { courseId: COURSE, sessionId: SESSION, attemptId: ATTEMPT, nodeId: NODE, now: NOW })
}

function answer(blockId = 'quiz', value = 'A') {
  return { courseId: COURSE, sessionId: SESSION, expectedRevision: 1, attemptId: ATTEMPT, blockId, answers: [{ questionId: 'q1', value }] }
}

describe('recording a quiz answer', () => {
  it('persists the response and a neutral practice observation without changing node state', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const before = state.readNode(NODE)!
      const view = await recordBlockResponse(state, answer())
      const attempt = view.run?.attempts.find((entry) => entry.id === ATTEMPT)
      expect(attempt?.responses).toHaveLength(1)
      expect(attempt?.responses?.[0]).toMatchObject({ blockId: 'quiz', kind: 'quiz', answers: [{ questionId: 'q1', value: 'A' }] })
      const after = state.readNode(NODE)!
      expect(after.state).toBe(before.state)
      expect(after.evidence.at(-1)).toMatchObject({ kind: 'practice', attemptId: ATTEMPT, sessionId: SESSION })
    } finally { await harness.close() }
  })

  it('replaces a previous submission for the same block rather than duplicating it', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      await recordBlockResponse(state, answer('quiz', 'A'))
      const view = await recordBlockResponse(state, answer('quiz', 'B'))
      const attempt = view.run?.attempts.find((entry) => entry.id === ATTEMPT)
      expect(attempt?.responses).toHaveLength(1)
      expect(attempt?.responses?.[0]?.answers[0]?.value).toBe('B')
    } finally { await harness.close() }
  })

  it('refuses a stale attempt, an unknown block and an invalid option', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      await expect(recordBlockResponse(state, { ...answer(), attemptId: 'not-active' })).rejects.toThrow(/stale-attempt/)
      await expect(recordBlockResponse(state, answer('missing'))).rejects.toThrow(/unknown-block/)
      await expect(recordBlockResponse(state, answer('quiz', 'not-an-option'))).rejects.toThrow(/invalid-answer-option/)
      await expect(recordBlockResponse(state, { ...answer(), expectedRevision: 0 })).rejects.toThrow(/revision-conflict/)
    } finally { await harness.close() }
  })

  it('records a flashcard self-report through the same neutral path', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const view = await recordBlockResponse(state, {
        ...answer('card', 'again'), answers: [{ questionId: 'card', value: 'again' }],
      })
      expect(view.run?.attempts[0]?.responses?.[0]).toMatchObject({ kind: 'flashcard', blockId: 'card' })
      expect(state.readNode(NODE)?.state).toBe('unconfirmed')
    } finally { await harness.close() }
  })
})

describe('submission HTTP and tool surface', () => {
  it('accepts the same submission through the trust-fenced API', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }) }))
      const body = JSON.stringify(answer())
      const req = {
        method: 'POST', url: `${API_PREFIX}/path/answer`, headers: { host: '127.0.0.1:3080' },
        async *[Symbol.asyncIterator]() { yield Buffer.from(body, 'utf8') },
      } as unknown as IncomingMessage
      const response = { statusCode: 0, body: '', setHeader() {}, end(chunk: string) { this.body += chunk } }
      await handler(req, response as unknown as ServerResponse)
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).run.attempts[0].responses).toHaveLength(1)
    } finally { await harness.close() }
  })

  it('registers udt_quiz_update and records through it', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)
      const tools = new Map<string, { execute: (args: unknown, exec: unknown) => Promise<unknown> }>()
      registerTools({ tools: { register(definition) { tools.set(definition.name, definition as never); return () => {} } } } as ToolsHost, state)
      const result = await tools.get('udt_quiz_update')!.execute({ attemptId: ATTEMPT, blockId: 'quiz', answers: [{ questionId: 'q1', value: 'A' }] }, { agent: { id: SESSION } })
      expect((result as { run: { attempts: { responses?: unknown[] }[] } }).run.attempts[0]?.responses).toHaveLength(1)
    } finally { await harness.close() }
  })
})

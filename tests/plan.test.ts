import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { buildIcs, sortTasks, TaskSchema } from '../src/plan.js'
import { openUdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

async function open() {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
  return { harness, state }
}

function toolsOf(state: Awaited<ReturnType<typeof open>>['state']) {
  const tools = new Map<string, { execute: (args: unknown) => Promise<Record<string, unknown>> }>()
  registerTools({ tools: { register(definition) { tools.set(definition.name, definition as never); return () => {} } } } as ToolsHost, state)
  return tools
}

describe('task schema and sorting', () => {
  it('accepts a dated task and rejects a bad status/date shape', () => {
    expect(TaskSchema.safeParse({ id: 't1', title: 'Read', dueAt: '2026-01-02T10:00:00.000Z', estimateMin: 30, status: 'open', createdAt: NOW, updatedAt: NOW }).success).toBe(true)
    expect(TaskSchema.safeParse({ id: 't1', title: 'Read', status: 'doing', createdAt: NOW, updatedAt: NOW }).success).toBe(false)
  })

  it('sorts open tasks by due date and puts undated tasks last', () => {
    const base = { status: 'open' as const, createdAt: NOW, updatedAt: NOW }
    const sorted = sortTasks([
      { ...base, id: 'b', title: 'B', dueAt: '2026-01-03T10:00:00.000Z' },
      { ...base, id: 'a', title: 'A', dueAt: '2026-01-02T10:00:00.000Z' },
      { ...base, id: 'c', title: 'C' },
    ])
    expect(sorted.map((task) => task.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('ICS export', () => {
  it('exports open, dated tasks and escapes text', () => {
    const ics = buildIcs([{
      id: 'task,1', title: 'Read; practice', dueAt: '2026-01-02T10:00:00.000Z', estimateMin: 45,
      status: 'open', createdAt: NOW, updatedAt: NOW,
    }, { id: 'skip', title: 'No date', status: 'open', createdAt: NOW, updatedAt: NOW }, { id: 'done', title: 'Done', dueAt: '2026-01-02T10:00:00.000Z', status: 'done', createdAt: NOW, updatedAt: NOW }], new Date(NOW))
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Read\\; practice')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('DTSTART:20260102T100000Z')
  })
})

describe('plan tools', () => {
  it('adds, completes and removes tasks and refuses a bad source', async () => {
    const { harness, state } = await open()
    try {
      const tools = toolsOf(state)
      const added = await tools.get('udt_plan_update')!.execute({ op: 'add', tasks: [{ title: 'Read chapter', dueAt: '2026-01-02T10:00:00.000Z', estimateMin: 30 }] })
      const tasks = added.tasks as { id: string; title: string }[]
      expect(tasks[0]?.title).toBe('Read chapter')
      const completed = await tools.get('udt_plan_update')!.execute({ op: 'complete', taskId: tasks[0]!.id })
      expect((completed.tasks as { status: string }[])[0]?.status).toBe('done')
      await tools.get('udt_plan_update')!.execute({ op: 'remove', taskId: tasks[0]!.id })
      expect((await tools.get('udt_plan_get')!.execute({})).tasks).toEqual([])
      await expect(tools.get('udt_plan_update')!.execute({ op: 'add', tasks: [{ title: 'Bad', sourceId: 'missing' }] })).rejects.toThrow(/unknown source/)
    } finally { await harness.close() }
  })
})

describe('Today API surface', () => {
  it('includes tasks in overview and serves the ICS route', async () => {
    const { harness, state } = await open()
    try {
      const tools = toolsOf(state)
      await tools.get('udt_plan_update')!.execute({ op: 'add', tasks: [{ title: 'Plan item', dueAt: '2026-01-02T10:00:00.000Z' }] })
      const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }) }))
      const overview = { statusCode: 0, body: '', setHeader() {}, end(chunk: string) { this.body += chunk } }
      await handler({ method: 'GET', url: `${API_PREFIX}/overview`, headers: { host: '127.0.0.1:3080' }, async *[Symbol.asyncIterator]() {} } as unknown as IncomingMessage, overview as unknown as ServerResponse)
      expect(overview.statusCode).toBe(200)
      expect(JSON.parse(overview.body).tasks[0].title).toBe('Plan item')
      const calendar = { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(key: string, value: string) { this.headers[key] = value }, end(chunk: string) { this.body += chunk } }
      await handler({ method: 'GET', url: `${API_PREFIX}/plan/ics`, headers: { host: '127.0.0.1:3080' }, async *[Symbol.asyncIterator]() {} } as unknown as IncomingMessage, calendar as unknown as ServerResponse)
      expect(calendar.statusCode).toBe(200)
      expect(calendar.headers['content-type']).toContain('text/calendar')
      expect(calendar.body).toContain('Plan item')
      expect(state.exportState(NOW).tasks).toHaveLength(1)
    } finally { await harness.close() }
  })
})

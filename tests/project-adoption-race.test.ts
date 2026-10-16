/** A late tool result must not replace a project choice made during its write. */
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { describe, expect, it } from 'vitest'

import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import { createHarness } from './harness.js'

const SESSION = 'session-with-pending-write'
const NOW = '2026-10-12T00:00:00.000Z'
const kinds = ['map', 'lesson', 'goal'] as const
type Kind = (typeof kinds)[number]

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function goalCreator(state: UdState) {
  const definitions = new Map<string, ToolDefinition>()
  registerTools({ tools: { register: (definition) => definitions.set(definition.name, definition) } }, state)
  return async (sessionId: string, goal: string) => {
    return await definitions.get('udt_goal_create')!.execute(
      { title: 'Korean', goal },
      { agent: { id: sessionId } } as never,
    ) as { courseId: string; goalNodeId: string; projectAdopted: boolean; projectBinding: string }
  }
}

async function pendingWrite(kind: Kind) {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
  for (const courseId of ['ml', 'korean']) {
    await state.writeCourse({ id: courseId, title: courseId, goal: `learn ${courseId}`, status: 'paused', createdAt: NOW, updatedAt: NOW })
    await state.writeNode(newNode({ id: `${courseId}:goal`, courseId, title: courseId, relation: 'goal', now: NOW }))
  }
  const entered = signal()
  const resume = signal()
  const wait = async () => { entered.resolve(); await resume.promise }
  const wrapped = {
    ...state,
    async writeNode(record: Parameters<typeof state.writeNode>[0]) {
      if (kind !== 'lesson') await wait()
      return state.writeNode(record)
    },
    async writeLesson(record: Parameters<typeof state.writeLesson>[0]) {
      await wait()
      return state.writeLesson(record)
    },
  }
  const definitions = new Map<string, ToolDefinition>()
  registerTools({ tools: { register: (definition) => definitions.set(definition.name, definition) } }, wrapped)
  const tool = async (name: string, args: Record<string, unknown>) => {
    const definition = definitions.get(name)!
    return await definition.execute(args, { agent: { id: SESSION } } as never) as Record<string, unknown>
  }
  const start = () => kind === 'map'
    ? tool('udt_map_update', { courseId: 'korean', op: 'set-state', nodeId: 'korean:goal', state: 'explained' })
    : kind === 'lesson'
      ? tool('udt_lesson_update', { nodeId: 'korean:goal', blocks: [{ id: 'hangul', type: 'text', content: { md: 'Hangul unit' } }] })
      : tool('udt_goal_create', { title: 'Hangul basics', goal: 'I want to read Hangul' })
  return { harness, state, entered, resume, tool, start }
}

describe('project adoption respects choices made while writing', () => {
  for (const kind of kinds) {
    it.each(['new', 'project'] as const)(`${kind} keeps a newer %s choice`, async (selection) => {
      const fixture = await pendingWrite(kind)
      const { harness, state, entered, resume, tool, start } = fixture
      try {
        const pending = start()
        await entered.promise
        await state.selectProject(SESSION, selection === 'project' ? 'ml' : undefined, NOW)
        resume.resolve()
        const result = await pending
        expect(result).toMatchObject({ projectAdopted: false, projectBinding: 'not-selected' })
        expect(await tool('udt_status', {})).toMatchObject({ selection, sessionAvailable: true })
        expect(state.readProject(SESSION)?.courseId).toBe(selection === 'project' ? 'ml' : undefined)
        // The successful shared write is still stored, without claiming it is
        // the project this conversation now has open.
        if (kind === 'map') expect(state.readNode('korean:goal')?.state).toBe('explained')
        if (kind === 'lesson') expect(state.lessonForNode('korean:goal')?.blocks).toHaveLength(1)
        if (kind === 'goal') expect(state.readNode(result.goalNodeId as string)).toBeDefined()
      } finally {
        resume.resolve()
        await harness.close()
      }
    })
  }

  it('a repeated new choice invalidates a goal begun for the earlier new choice', async () => {
    const { harness, state, entered, resume, tool, start } = await pendingWrite('goal')
    try {
      await state.selectProject(SESSION, undefined, NOW)
      const pending = start()
      await entered.promise
      // Identical timestamps and values still represent a fresh user choice.
      await state.selectProject(SESSION, undefined, NOW)
      resume.resolve()
      expect(await pending).toMatchObject({ projectAdopted: false, projectBinding: 'not-selected' })
      expect(await tool('udt_status', {})).toMatchObject({ selection: 'new' })
    } finally {
      resume.resolve()
      await harness.close()
    }
  })
})

describe('concurrent goal creation', () => {
  it('keeps same-title goals and bindings distinct across sessions and preserves existing projects', async () => {
    const harness = await createHarness()
    const state = await openUdState(harness.ctx.get('storageDomain')!)
    try {
      for (const courseId of ['ml', 'micro', 'korean']) {
        await state.writeCourse({ id: courseId, title: courseId, goal: `learn ${courseId}`, status: 'paused', createdAt: NOW, updatedAt: NOW })
        await state.writeNode(newNode({ id: `${courseId}:goal`, courseId, title: courseId, relation: 'goal', now: NOW }))
      }
      const originalCourses = state.listCourses()
      const originalNodes = state.listNodes('ml').concat(state.listNodes('micro'), state.listNodes('korean'))
      await state.selectProject('B', undefined, NOW)
      const createGoal = goalCreator(state)
      const [a, b] = await Promise.all([
        createGoal('A', 'I want to read Hangul.'),
        createGoal('B', 'I want to understand Korean grammar.'),
      ])

      expect(a.courseId).not.toBe(b.courseId)
      expect(a.goalNodeId).not.toBe(b.goalNodeId)
      for (const [sessionId, result, goal] of [
        ['A', a, 'I want to read Hangul.'],
        ['B', b, 'I want to understand Korean grammar.'],
      ] as const) {
        expect(result).toMatchObject({ projectAdopted: true, projectBinding: 'adopted' })
        expect(state.readProject(sessionId)?.courseId).toBe(result.courseId)
        expect(state.readCourse(result.courseId)?.goal).toBe(goal)
        expect(state.readNode(result.goalNodeId)).toMatchObject({
          courseId: result.courseId, evidence: [{ kind: 'goal-stated', note: goal }],
        })
      }
      expect(state.readCourse(a.courseId)?.status).toBe('paused')
      expect(state.readCourse(b.courseId)?.status).toBe('active')
      expect(state.listCourses()).toHaveLength(originalCourses.length + 2)
      for (const course of originalCourses) expect(state.readCourse(course.id)).toEqual(course)
      for (const node of originalNodes) expect(state.readNode(node.id)).toEqual(node)
    } finally {
      await harness.close()
    }
  })

  it('captures the project choice before a goal waits for an earlier creation', async () => {
    const harness = await createHarness()
    const state = await openUdState(harness.ctx.get('storageDomain')!)
    const entered = signal()
    const resume = signal()
    let first = true
    const createGoal = goalCreator({
      ...state,
      async writeNode(record) {
        if (first) {
          first = false
          entered.resolve()
          await resume.promise
        }
        return state.writeNode(record)
      },
    })
    try {
      const pendingA = createGoal('A', 'Learn Hangul.')
      await entered.promise
      await state.selectProject('B', undefined, NOW)
      const pendingB = createGoal('B', 'Learn grammar.')
      // This is a fresh choice even though its value and timestamp are equal.
      await state.selectProject('B', undefined, NOW)
      resume.resolve()
      const [a, b] = await Promise.all([pendingA, pendingB])
      expect(a.projectBinding).toBe('adopted')
      expect(b).toMatchObject({ projectAdopted: false, projectBinding: 'not-selected' })
      expect(state.resolveProject('B').selection).toBe('new')
      expect(state.readCourse(b.courseId)?.goal).toBe('Learn grammar.')
      expect(state.readNode(b.goalNodeId)).toBeDefined()
    } finally {
      resume.resolve()
      await harness.close()
    }
  })

  it('allows the next queued creation to run after an earlier write fails', async () => {
    const harness = await createHarness()
    const state = await openUdState(harness.ctx.get('storageDomain')!)
    let first = true
    const createGoal = goalCreator({
      ...state,
      async writeCourse(record) {
        if (first) {
          first = false
          throw new Error('injected write failure')
        }
        return state.writeCourse(record)
      },
    })
    try {
      const [a, b] = await Promise.allSettled([
        createGoal('A', 'Learn Hangul.'),
        createGoal('B', 'Learn grammar.'),
      ])
      expect(a.status).toBe('rejected')
      if (a.status === 'rejected') expect(String(a.reason)).toContain('injected write failure')
      expect(b.status).toBe('fulfilled')
      if (b.status !== 'fulfilled') throw new Error('the queued goal did not recover')
      expect(b.value.projectBinding).toBe('adopted')
      expect(state.readProject('A')).toBeUndefined()
      expect(state.readProject('B')?.courseId).toBe(b.value.courseId)
      expect(state.readCourse(b.value.courseId)?.goal).toBe('Learn grammar.')
      expect(state.readNode(b.value.goalNodeId)).toBeDefined()
      expect(state.listCourses()).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })
})

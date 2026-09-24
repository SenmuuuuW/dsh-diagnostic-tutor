/**
 * The model-facing contract: how this plugin identifies itself, and how it
 * identifies nodes.
 *
 * Two things are pinned here, both found broken against harness 0.1.7.
 *
 * **The message source.** 0.1.6 accepted `{ kind: 'plugin', plugin: 'x' }`;
 * 0.1.7 removed the shared catch-all `plugin` kind entirely — `MessageSourceMap`
 * is merge-extensible and every producer declares its own name in its own
 * module. The old shape is not merely deprecated, it is not in the union, so
 * `createUserMessage` rejects it at compile time. These tests pin the value at
 * runtime and the declaration at compile time, because an augmentation that
 * silently stopped applying would leave a plugin that type-checks against a
 * stale lib and fails at run time.
 *
 * **Node identity.** A diagnosis map is read by a model, and a model that has
 * to derive an identifier from a display string will eventually derive the
 * wrong one — titles are not unique, and they are the learner's language, not
 * keys. Every tool that takes a node argument spells it `nodeId`, so every tool
 * that returns one must return it under that name.
 */

import { describe, expect, it } from 'vitest'

import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageSource } from '@deepseek-ai/dsh-llm'

import { PLUGIN_SOURCE, promptSession } from '../src/prompt.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { createHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

/* -------------------------------------------------------------------------- */
/* 1. The message source                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Compile-time regression guard.
 *
 * This line is the test: it only compiles because `src/prompt.ts` merges its
 * own entry into `MessageSourceMap`. Delete the augmentation and `pnpm
 * typecheck` fails here, before any runtime test gets a chance to be fooled by
 * an `as` cast.
 */
const DECLARED_SOURCE: MessageSource = { kind: 'diagnostic-tutor' }
void DECLARED_SOURCE

/** A context whose only job is to capture the message handed to `followup`. */
function captureContext(live: { id: string }[] = [{ id: 's1' }]): {
  ctx: unknown
  sent: { content: unknown; source: unknown }[]
} {
  const sent: { content: unknown; source: unknown }[] = []
  const agent = { followup: (message: { content: unknown; source: unknown }) => sent.push(message) }
  const ctx = {
    get: (name: string) =>
      name === 'agents'
        ? {
            get: (id: string) => (live.some((entry) => entry.id === id) ? agent : undefined),
            list: () => live.map((entry) => ({ ...agent, id: entry.id })),
          }
        : undefined,
  }
  return { ctx, sent }
}

describe('the message source this plugin declares', () => {
  it('sends { kind: "diagnostic-tutor" }, not the removed catch-all', () => {
    const { ctx, sent } = captureContext()
    const result = promptSession(ctx as never, 's1', 'teach me this node')

    expect(result.prompted).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0]?.source).toEqual({ kind: 'diagnostic-tutor' })
  })

  it('carries no leftover `plugin` field', () => {
    const { ctx, sent } = captureContext()
    promptSession(ctx as never, 's1', 'teach me this node')

    const source = sent[0]?.source as Record<string, unknown>
    expect(source).not.toHaveProperty('plugin')
    // The kind is the whole payload — nothing else to keep in sync.
    expect(Object.keys(source)).toEqual(['kind'])
  })

  it('agrees with the exported constant, so the two cannot drift', () => {
    expect(DECLARED_SOURCE).toEqual({ kind: PLUGIN_SOURCE })
    expect(PLUGIN_SOURCE).toBe('diagnostic-tutor')
  })

  it('still sends ordinary user-role content alongside it', () => {
    const { ctx, sent } = captureContext()
    promptSession(ctx as never, 's1', 'teach me this node')
    expect(sent[0]?.content).toEqual([{ type: 'text', text: 'teach me this node' }])
  })

  it('builds a message the real harness factory accepts', () => {
    // The strongest available check without a live agent: the platform's own
    // constructor, against the platform's own types.
    const message = createUserMessage({
      content: [{ type: 'text', text: 'teach me this node' }],
      source: { kind: PLUGIN_SOURCE },
    })
    expect(message.role).toBe('user')
    expect(message.source).toEqual({ kind: 'diagnostic-tutor' })
    expect(message.id).toBeTruthy()
  })

  it('never wakes an agent for a session it was not given', () => {
    const { ctx, sent } = captureContext([{ id: 'other' }, { id: 'another' }])
    const result = promptSession(ctx as never, 's1', 'teach me this node')
    // Two live conversations and neither is the one asked for: refuse rather
    // than wake the wrong tutor.
    expect(result.prompted).toBe(false)
    expect(sent).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* 2. Node identity                                                           */
/* -------------------------------------------------------------------------- */

interface Wired {
  state: UdState
  tool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>
}

async function wire(harness: Awaited<ReturnType<typeof createHarness>>, state: UdState): Promise<Wired> {
  const registered = new Map<string, { execute: (a: unknown, e: unknown) => Promise<unknown>; description: string }>()
  const host: ToolsHost = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition as never)
        return () => {}
      },
    },
  }
  registerTools(host, state)
  return {
    state,
    async tool(name, args) {
      const definition = registered.get(name)
      if (!definition) throw new Error(`tool "${name}" is not registered`)
      return (await definition.execute(args, {})) as Record<string, unknown>
    },
  }
}

async function seed(state: UdState): Promise<{ goalId: string; mathId: string }> {
  await state.writeCourse({
    id: 'ml',
    title: 'Machine Learning',
    goal: 'learn ml',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW,
  })
  await state.activateCourse('ml', NOW)
  const goal = newNode({ id: 'ml:goal', courseId: 'ml', title: 'ML', relation: 'goal', now: NOW })
  const math = newNode({
    id: 'ml:math',
    courseId: 'ml',
    title: 'Math Foundations',
    relation: 'part-of',
    parentId: goal.id,
    state: 'blocked',
    evidence: [{ kind: 'diagnosis', at: NOW, note: 'shaky' }],
    now: NOW,
  })
  for (const node of [goal, math]) await state.writeNode(node)
  return { goalId: goal.id, mathId: math.id }
}

describe('nodes are identified by id, never by title', () => {
  it('udt_map_get returns nodeId and parentNodeId', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { goalId, mathId } = await seed(state)
      const wired = await wire(harness, state)

      const map = await wired.tool('udt_map_get', {})
      const nodes = map.nodes as { nodeId: string; title: string; parentNodeId?: string }[]

      expect(nodes.map((node) => node.nodeId).sort()).toEqual([goalId, mathId].sort())
      const math = nodes.find((node) => node.nodeId === mathId)
      expect(math?.parentNodeId).toBe(goalId)

      // The old, ambiguous spelling is gone: `id` is what a course uses, and a
      // node answering to it too is exactly the confusion being removed.
      expect(nodes.every((node) => !('id' in node))).toBe(true)
      expect(nodes.every((node) => !('parentId' in node))).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('udt_status returns ids for the focus and the pending decision', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const wired = await wire(harness, state)

      await state.startFocus('ml', mathId, NOW)
      await wired.tool('udt_decide_next', {
        action: 'more-practice',
        reason: 'The rule is there but applying it is not.',
      })

      const status = await wired.tool('udt_status', {})
      expect(status.focus).toMatchObject({ nodeId: mathId })

      // The decision names both ends by id. Without these a model reading the
      // status has only display titles to work from.
      const pending = status.pendingNextStep as Record<string, unknown>
      expect(pending.fromNodeId).toBe(mathId)
      expect(pending.fromNodeTitle).toBe('Math Foundations')
      expect(pending).not.toHaveProperty('targetNodeId')
      expect(pending).not.toHaveProperty('targetNodeTitle')
    } finally {
      await harness.close()
    }
  })

  it('udt_status names a move target by id too', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const { mathId } = await seed(state)
      const goalId = 'ml:goal'
      const wired = await wire(harness, state)

      await state.startFocus('ml', mathId, NOW)
      await wired.tool('udt_decide_next', {
        action: 'review-first',
        targetNodeId: goalId,
        reason: 'Go back to the goal before continuing.',
      })

      const pending = (await wired.tool('udt_status', {})).pendingNextStep as Record<string, unknown>
      expect(pending.fromNodeId).toBe(mathId)
      expect(pending.targetNodeId).toBe(goalId)
      expect(pending.targetNodeTitle).toBe('ML')
    } finally {
      await harness.close()
    }
  })

  it('the tool output schema promises the same names it returns', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      await seed(state)

      const schemas = new Map<string, Record<string, unknown>>()
      const host: ToolsHost = {
        tools: {
          register(definition) {
            schemas.set(definition.name, definition.output?.schema as Record<string, unknown>)
            return () => {}
          },
        },
      }
      registerTools(host, state)

      // A schema that advertises `id` while the value carries `nodeId` is worse
      // than either alone: the model plans against one and reads the other.
      const props = (schema: unknown): Record<string, unknown> =>
        (schema as { properties?: Record<string, unknown> }).properties ?? {}
      const items = (schema: unknown): unknown => (schema as { items?: unknown }).items

      const mapProps = props(schemas.get('udt_map_get'))
      // `nodes` is an array node: its element schema is under `items`, not
      // `properties`.
      const nodeProps = props(items(mapProps.nodes))
      expect(nodeProps).toHaveProperty('nodeId')
      expect(nodeProps).not.toHaveProperty('id')
      expect(nodeProps).toHaveProperty('parentNodeId')
      expect(nodeProps).not.toHaveProperty('parentId')

      const statusProps = props(schemas.get('udt_status'))
      const pendingProps = props(statusProps.pendingNextStep)
      expect(pendingProps).toHaveProperty('fromNodeId')
      expect(pendingProps).toHaveProperty('targetNodeId')
    } finally {
      await harness.close()
    }
  })
})

/* -------------------------------------------------------------------------- */
/* 3. The deleted bridge                                                      */
/* -------------------------------------------------------------------------- */

describe('the temporary runtime bridge is gone', () => {
  it('no longer tells the tutor when to record a decision', async () => {
    // UDT v2.1's `learning_runtime_contract.md` owns that judgement now. A
    // second voice in a tool description would be the duplication this project
    // exists to avoid — and the one that used to be here did not work anyway.
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const descriptions = new Map<string, string>()
      const host: ToolsHost = {
        tools: {
          register(definition) {
            descriptions.set(definition.name, definition.description ?? '')
            return () => {}
          },
        },
      }
      registerTools(host, state)

      for (const [name, text] of descriptions) {
        expect(text, `${name} still prescribes when to decide`).not.toMatch(
          /judged answer with no next step|not finished without|reached a conclusion, record/i,
        )
      }
    } finally {
      await harness.close()
    }
  })

  it('keeps the genuine tool/API descriptions', async () => {
    const harness = await createHarness()
    try {
      const state = await openUdState(harness.ctx.get('storageDomain')!)
      const descriptions = new Map<string, string>()
      const host: ToolsHost = {
        tools: {
          register(definition) {
            descriptions.set(definition.name, definition.description ?? '')
            return () => {}
          },
        },
      }
      registerTools(host, state)

      // Caps and modes are the tool's own contract and must survive the trim.
      expect(descriptions.get('udt_lesson_update')).toMatch(/blocks per call/)
      expect(descriptions.get('udt_lesson_update')).toMatch(/append/)
      // The surface's real mechanic: a check block has no input box.
      expect(descriptions.get('udt_lesson_update')).toMatch(/answers in the chat/)
      // decide_next still documents the shape it validates.
      expect(descriptions.get('udt_decide_next')).toMatch(/targetNodeId/)
      expect(descriptions.get('udt_decide_next')).toMatch(/reason/)
    } finally {
      await harness.close()
    }
  })
})

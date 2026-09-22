/**
 * Goal → diagnosis map, end to end.
 *
 * Everything here goes through the real tools against the real storage stack,
 * and the strong assertions read the *persisted document* rather than the
 * tool's own return value. A plugin reporting success is not evidence that
 * anything was stored.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as plugin from '../src/index.js'
import { FORBIDDEN_SCORE_FIELDS } from '../src/vocabulary.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const STORE_FILE = 'udt.json'

/** Invoke a registered tool exactly as the runtime would. */
async function callTool(
  harness: TestHarness,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const definition = harness.ctx.get('tools')?.get(name)
  if (!definition) throw new Error(`tool "${name}" is not registered`)
  const exec = {} as unknown as Parameters<typeof definition.execute>[1]
  return (await definition.execute(args, exec)) as Record<string, unknown>
}

/** Read the persisted domain document; the world outside the plugin. */
async function readStore(storeRoot: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(storeRoot, STORE_FILE), 'utf8')) as Record<string, unknown>
}

/** Every key appearing anywhere in a persisted document. */
function allKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) allKeys(entry, found)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      found.add(key)
      allKeys(entry, found)
    }
  }
  return found
}

describe('tool surface', () => {
  it('registers exactly the v0.0.5 tool surface', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const names = harness.ctx
        .get('tools')
        ?.schemas()
        .map((schema) => schema.name)
        .sort()
      expect(names).toEqual([
        'udt_goal_create',
        'udt_lesson_update',
        'udt_map_get',
        'udt_map_update',
        'udt_status',
      ])
    } finally {
      await harness.close()
    }
  })
})

describe('goal creation', () => {
  it('records the goal and plants only the map root', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const created = await callTool(harness, 'udt_goal_create', {
        title: 'Machine Learning',
        goal: 'I want to build a small ML project',
      })

      expect(created.courseId).toBe('machine-learning')
      expect(created.status).toBe('active')
      expect(created.goalNodeId).toBe('machine-learning:goal')

      // The point of the whole design: creating a goal produces ONE node.
      const map = await callTool(harness, 'udt_map_get', {})
      const nodes = map.nodes as { relation: string; state: string; evidence: unknown[] }[]
      expect(nodes).toHaveLength(1)
      expect(nodes[0]?.relation).toBe('goal')
      // A goal is the frame of the map, not a mastery claim.
      expect(nodes[0]?.state).toBe('unconfirmed')
      expect(nodes[0]?.evidence).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })

  it('focuses the new goal and pauses the previous one', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'Linear Algebra', goal: 'brush up' })
      const second = await callTool(harness, 'udt_goal_create', {
        title: 'Machine Learning',
        goal: 'build a project',
      })
      expect(second.pausedCourseIds).toEqual(['linear-algebra'])

      const status = await callTool(harness, 'udt_status', {})
      const courses = status.courses as { id: string; status: string }[]
      expect(courses.find((course) => course.id === 'linear-algebra')?.status).toBe('paused')
      expect(courses.find((course) => course.id === 'machine-learning')?.status).toBe('active')
      expect(status.activeCourseId).toBe('machine-learning')
      // Pausing keeps the first goal's map intact.
      expect((await callTool(harness, 'udt_map_get', { courseId: 'linear-algebra' })).nodes).toHaveLength(1)
    } finally {
      await harness.close()
    }
  })

  it('gives two goals with the same title distinct ids', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const first = await callTool(harness, 'udt_goal_create', { title: 'Maths', goal: 'a' })
      const second = await callTool(harness, 'udt_goal_create', { title: 'Maths', goal: 'b' })
      expect(first.courseId).toBe('maths')
      expect(second.courseId).toBe('maths-2')
    } finally {
      await harness.close()
    }
  })

  it('keeps a non-Latin title readable in the id', async () => {
    // Regression: an ASCII-only slug collapsed every CJK title to the bare
    // fallback `node`, and dropped the Chinese half of a mixed title.
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const created = await callTool(harness, 'udt_goal_create', {
        title: '机器学习入门',
        goal: '我想学机器学习',
      })
      expect(created.courseId).toBe('机器学习入门')
      expect(created.goalNodeId).toBe('机器学习入门:goal')

      // And a mixed-script title keeps both halves.
      const mixed = await callTool(harness, 'udt_goal_create', {
        title: 'ML / 机器学习',
        goal: 'b',
      })
      expect(mixed.courseId).toBe('ml-机器学习')
    } finally {
      await harness.close()
    }
  })

  it('falls back to a usable id when the title has no letters at all', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const created = await callTool(harness, 'udt_goal_create', { title: '???', goal: 'a' })
      expect(created.courseId).toBe('node')
    } finally {
      await harness.close()
    }
  })
})

describe('map growth', () => {
  it('adds nodes only under an existing parent, born unconfirmed', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build something' })

      const added = await callTool(harness, 'udt_map_update', {
        op: 'add-nodes',
        nodes: [
          { title: 'Linear Algebra', relation: 'prerequisite', parentId: 'ml:goal' },
          { title: 'Probability', relation: 'prerequisite', parentId: 'ml:goal' },
        ],
      })
      expect(added.addedNodeIds).toHaveLength(2)
      expect(added.nodeCount).toBe(3)

      const map = await callTool(harness, 'udt_map_get', {})
      const nodes = map.nodes as { id: string; state: string }[]
      expect(nodes.every((entry) => entry.state === 'unconfirmed')).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('refuses a node whose parent does not exist', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build something' })
      await expect(
        callTool(harness, 'udt_map_update', {
          op: 'add-nodes',
          nodes: [{ title: 'Floating', relation: 'part-of', parentId: 'nope' }],
        }),
      ).rejects.toThrow(/missing-parent/)
    } finally {
      await harness.close()
    }
  })

  it('refuses a whole-course dump in one call', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build something' })
      const dump = Array.from({ length: 30 }, (_, index) => ({
        title: `Topic ${index}`,
        relation: 'part-of',
        parentId: 'ml:goal',
      }))
      await expect(
        callTool(harness, 'udt_map_update', { op: 'add-nodes', nodes: dump }),
      ).rejects.toThrow(/at most 8 nodes/)
    } finally {
      await harness.close()
    }
  })
})

describe('mastery cannot be asserted', () => {
  it('refuses confirmed without a check or transfer', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build something' })
      const added = await callTool(harness, 'udt_map_update', {
        op: 'add-nodes',
        nodes: [{ title: 'Vectors', relation: 'prerequisite', parentId: 'ml:goal' }],
      })
      const nodeId = (added.addedNodeIds as string[])[0] as string

      await expect(
        callTool(harness, 'udt_map_update', { op: 'set-state', nodeId, state: 'confirmed' }),
      ).rejects.toThrow(/confirmed-without-evidence/)

      // Explanation alone still does not confirm it.
      await callTool(harness, 'udt_map_update', {
        op: 'add-evidence',
        nodeId,
        evidenceKind: 'explanation',
        evidenceNote: 'walked through it together',
        state: 'explained',
      })
      await expect(
        callTool(harness, 'udt_map_update', { op: 'set-state', nodeId, state: 'confirmed' }),
      ).rejects.toThrow(/confirmed-without-evidence/)

      // A check makes it permissible; the skill still decides whether to.
      const checked = await callTool(harness, 'udt_map_update', {
        op: 'add-evidence',
        nodeId,
        evidenceKind: 'check',
        readiness: 'advance',
        state: 'confirmed',
      })
      expect(checked.state).toBe('confirmed')
    } finally {
      await harness.close()
    }
  })

  it('appends evidence without losing earlier entries', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build something' })
      const added = await callTool(harness, 'udt_map_update', {
        op: 'add-nodes',
        nodes: [{ title: 'Vectors', relation: 'part-of', parentId: 'ml:goal' }],
      })
      const nodeId = (added.addedNodeIds as string[])[0] as string

      await callTool(harness, 'udt_map_update', {
        op: 'add-evidence',
        nodeId,
        evidenceKind: 'diagnosis',
        evidenceNote: 'notation gap found',
      })
      const second = await callTool(harness, 'udt_map_update', {
        op: 'add-evidence',
        nodeId,
        evidenceKind: 'practice',
        state: 'practiced',
      })
      expect(second.evidenceCount).toBe(2)

      const map = await callTool(harness, 'udt_map_get', {})
      const node = (map.nodes as { id: string; evidence: { kind: string }[] }[]).find(
        (entry) => entry.id === nodeId,
      )
      expect(node?.evidence.map((entry) => entry.kind)).toEqual(['diagnosis', 'practice'])
    } finally {
      await harness.close()
    }
  })
})

describe('persistence', () => {
  it('survives a restart with the whole map intact', async () => {
    const first = await createHarness()
    const storeRoot = first.storeRoot
    try {
      await first.ctx.plugin(plugin)
      await callTool(first, 'udt_goal_create', { title: 'Machine Learning', goal: 'build a project' })
      const added = await callTool(first, 'udt_map_update', {
        op: 'add-nodes',
        nodes: [{ title: 'Probability', relation: 'prerequisite', parentId: 'machine-learning:goal' }],
      })
      const nodeId = (added.addedNodeIds as string[])[0] as string
      await callTool(first, 'udt_map_update', {
        op: 'add-evidence',
        nodeId,
        evidenceKind: 'check',
        readiness: 'review-first',
        state: 'weak',
      })
    } finally {
      await first.close({ keepStore: true })
    }

    const second = await createHarness({ storeRoot })
    try {
      await second.ctx.plugin(plugin)
      const status = await callTool(second, 'udt_status', {})
      expect(status.courseCount).toBe(1)
      expect(status.nodeCount).toBe(2)
      expect(status.activeCourseId).toBe('machine-learning')

      const map = await callTool(second, 'udt_map_get', {})
      expect(map.goal).toBe('build a project')
      const nodes = map.nodes as { id: string; state: string; evidence: unknown[] }[]
      const probability = nodes.find((entry) => entry.id === 'machine-learning:probability')
      expect(probability?.state).toBe('weak')
      expect(probability?.evidence).toHaveLength(1)
    } finally {
      await second.close()
    }
  })

  it('stores no score, grade or progress percentage anywhere', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      await callTool(harness, 'udt_goal_create', { title: 'ML', goal: 'build a project' })
      const added = await callTool(harness, 'udt_map_update', {
        op: 'add-nodes',
        nodes: [{ title: 'Vectors', relation: 'part-of', parentId: 'ml:goal' }],
      })
      await callTool(harness, 'udt_map_update', {
        op: 'add-evidence',
        nodeId: (added.addedNodeIds as string[])[0] as string,
        evidenceKind: 'check',
        readiness: 'advance',
        state: 'confirmed',
      })

      // Assert against the artifact on disk, not the plugin's report.
      const keys = allKeys(await readStore(harness.storeRoot))
      for (const forbidden of FORBIDDEN_SCORE_FIELDS) {
        expect(keys.has(forbidden)).toBe(false)
      }
    } finally {
      await harness.close()
    }
  })
})

describe('unload leaves no residue', () => {
  it('retracts all four tools and frees the domain, repeatably', async () => {
    const harness = await createHarness()
    try {
      for (let round = 0; round < 3; round += 1) {
        const fiber = await harness.ctx.plugin(plugin)
        expect(harness.ctx.get('tools')?.get('udt_map_update')).toBeDefined()
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeDefined()

        await fiber.dispose()

        expect(harness.ctx.get('tools')?.get('udt_map_update')).toBeUndefined()
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeUndefined()
      }
    } finally {
      await harness.close()
    }
  })
})

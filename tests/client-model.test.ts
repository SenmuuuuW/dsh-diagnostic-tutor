/**
 * The map model.
 *
 * Pure functions, so the tree logic is pinned without React or a DOM. The
 * interesting cases are the malformed ones: a node whose parent is missing, and
 * a parent cycle — neither can be stored (the diagnosis rules forbid them), but
 * the panel must not hang or silently drop a node if one ever appears.
 */

import { describe, expect, it } from 'vitest'

import type { NodeView } from '../src/contract.js'
import {
  STATE_ORDER,
  buildMapTree,
  flattenTree,
  formatDuration,
  formatWhen,
  isFilledState,
  relationLabel,
  stateExplanation,
} from '../src/client/model.js'

function node(id: string, parentId: string | null, state = 'unconfirmed'): NodeView {
  return {
    id,
    title: id,
    relation: parentId === null ? 'goal' : 'part-of',
    state,
    parentId,
    evidenceCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildMapTree', () => {
  it('nests children under their parent in insertion order', () => {
    const nodes = [
      node('goal', null),
      node('math', 'goal'),
      node('la', 'math'),
      node('calc', 'math'),
      node('python', 'goal'),
    ]
    const rows = flattenTree(buildMapTree(nodes))

    expect(rows.map((row) => [row.node.id, row.depth])).toEqual([
      ['goal', 0],
      ['math', 1],
      ['la', 2],
      ['calc', 2],
      ['python', 1],
    ])
  })

  it('promotes a node whose parent is missing instead of dropping it', () => {
    // Hiding a node would be worse than showing it in the wrong place.
    const rows = flattenTree(buildMapTree([node('goal', null), node('orphan', 'ghost')]))
    expect(rows.map((row) => row.node.id)).toEqual(['goal', 'orphan'])
    expect(rows.every((row) => row.depth === 0)).toBe(true)
  })

  it('renders every node caught in a parent cycle instead of hiding it', () => {
    // A cycle has no root, so a naive tree walk reaches nothing and both nodes
    // would vanish. Every node must be shown exactly once.
    const rows = flattenTree(buildMapTree([node('a', 'b'), node('b', 'a')]))
    expect(rows.map((row) => row.node.id).sort()).toEqual(['a', 'b'])
  })

  it('handles an empty map', () => {
    expect(buildMapTree([])).toEqual([])
  })
})

describe('vocabulary the panel speaks', () => {
  it('knows exactly the seven states, in the skill\'s order', () => {
    expect([...STATE_ORDER]).toEqual([
      'unconfirmed',
      'explained',
      'practiced',
      'checked',
      'weak',
      'blocked',
      'confirmed',
    ])
  })

  it('fills only the confirmed mark', () => {
    expect(isFilledState('confirmed')).toBe(true)
    for (const state of STATE_ORDER.filter((entry) => entry !== 'confirmed')) {
      expect(isFilledState(state)).toBe(false)
    }
  })

  it('explains every state without a number in sight', () => {
    for (const state of STATE_ORDER) {
      const text = stateExplanation(state)
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/\d+\s*%/)
    }
  })

  it('labels the four relations in the map\'s own terms', () => {
    expect(relationLabel('goal')).toBe('goal')
    expect(relationLabel('part-of')).toBe('part of')
    expect(relationLabel('prerequisite')).toBe('prerequisite')
    expect(relationLabel('related')).toBe('related')
    expect(relationLabel('something-new')).toBe('something-new')
  })
})

describe('formatDuration', () => {
  it('counts seconds while a wait is still a wait', () => {
    expect(formatDuration(0)).toBe('')
    expect(formatDuration(900)).toBe('1s')
    expect(formatDuration(17_400)).toBe('17s')
  })

  it('changes unit once the number stops meaning anything', () => {
    // The handoff line printed "Lesson ready 119803s" from a restored record.
    // Thirty-three hours is not a duration anyone reads as seconds.
    expect(formatDuration(94_000)).toBe('1m 34s')
    expect(formatDuration(120_000)).toBe('2m')
    expect(formatDuration(119_803_000)).toBe('33h 16m')
  })
})

describe('formatWhen', () => {
  const now = Date.parse('2026-03-10T12:00:00.000Z')

  it('reads recent observations as elapsed time, not as a timestamp', () => {
    expect(formatWhen('2026-03-10T11:59:50.000Z', now)).toBe('just now')
    expect(formatWhen('2026-03-10T11:58:00.000Z', now)).toBe('2 minutes ago')
    expect(formatWhen('2026-03-10T09:00:00.000Z', now)).toBe('3 hours ago')
    expect(formatWhen('2026-03-09T12:00:00.000Z', now)).toBe('yesterday')
    expect(formatWhen('2026-03-06T12:00:00.000Z', now)).toBe('4 days ago')
  })

  it('falls back to a date once "days ago" stops being useful', () => {
    // Exact wording is locale-dependent; what matters is that it is a date and
    // not the raw record.
    const old = formatWhen('2025-12-01T12:00:00.000Z', now)
    expect(old).toContain('2025')
    expect(old).not.toContain('T')
    expect(old).not.toContain('Z')
  })

  it('does not invent a future for a clock-skewed record, and never throws', () => {
    expect(formatWhen('2026-03-10T12:00:30.000Z', now)).toBe('just now')
    expect(formatWhen('not a date', now)).toBe('not a date')
  })
})

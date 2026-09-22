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

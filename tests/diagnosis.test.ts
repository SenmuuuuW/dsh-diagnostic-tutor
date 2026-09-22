/**
 * The diagnosis-map rules.
 *
 * These are the tests that matter most for v0.0.3, because they are what stops
 * the runtime from storing two things it must never store: unverified mastery,
 * and a curriculum pretending to be a diagnosis.
 *
 * Everything here is a pure function, so the rules are pinned without a
 * harness, a clock, or a model.
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_NODES_PER_COURSE,
  MAX_NODES_PER_UPDATE,
  acceptNewNodes,
  checkNodeState,
  recordEvidence,
  setNodeState,
  validateMap,
} from '../src/diagnosis.js'
import { newNode } from '../src/state.js'
import type { Evidence, NodeRecord } from '../src/state.js'
import { CONFIRMING_EVIDENCE_KINDS, NODE_STATES } from '../src/vocabulary.js'

const NOW = '2026-01-01T00:00:00.000Z'
const COURSE = 'ml'

function node(overrides: Partial<NodeRecord> & { id: string }): NodeRecord {
  const base = newNode({
    id: overrides.id,
    courseId: COURSE,
    title: overrides.id,
    relation: 'part-of',
    parentId: `${COURSE}:goal`,
    now: NOW,
  })
  return { ...base, ...overrides }
}

const goal = node({ id: `${COURSE}:goal`, relation: 'goal', parentId: undefined })

function withEvidence(target: NodeRecord, entries: Evidence[]): NodeRecord {
  return { ...target, evidence: entries }
}

describe('the vocabulary is the skill\'s, not ours', () => {
  it('carries exactly the seven status terms', () => {
    expect([...NODE_STATES]).toEqual([
      'unconfirmed',
      'explained',
      'practiced',
      'checked',
      'weak',
      'blocked',
      'confirmed',
    ])
  })

  it('only treats check and transfer as strong enough to confirm', () => {
    expect([...CONFIRMING_EVIDENCE_KINDS]).toEqual(['check', 'transfer'])
  })
})

describe('nothing is born confirmed', () => {
  it('creates nodes in the unconfirmed state', () => {
    expect(newNode({ id: 'n', courseId: COURSE, title: 'n', relation: 'part-of', now: NOW }).state).toBe(
      'unconfirmed',
    )
  })
})

describe('confirmed requires evidence the skill accepts', () => {
  const target = node({ id: 'n1' })
  const evidence = (kind: Evidence['kind']): Evidence => ({ kind, at: NOW })

  it('refuses a bare assertion of confirmed', () => {
    const result = setNodeState(target, 'confirmed', NOW)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations[0]?.code).toBe('confirmed-without-evidence')
  })

  it('refuses confirmed on explanation alone', () => {
    // "explanation alone and one lucky answer never confirm readiness."
    const explained = withEvidence(target, [evidence('explanation')])
    expect(setNodeState(explained, 'confirmed', NOW).ok).toBe(false)
  })

  it('refuses confirmed on practice alone', () => {
    const practiced = withEvidence(target, [evidence('practice')])
    expect(setNodeState(practiced, 'confirmed', NOW).ok).toBe(false)
  })

  it('allows confirmed once a check exists', () => {
    const checked = withEvidence(target, [evidence('check')])
    const result = setNodeState(checked, 'confirmed', NOW)
    expect(result.ok).toBe(true)
    expect(result.ok === true && result.node.state).toBe('confirmed')
  })

  it('allows confirmed once transfer exists', () => {
    const transferred = withEvidence(target, [evidence('transfer')])
    expect(setNodeState(transferred, 'confirmed', NOW).ok).toBe(true)
  })

  it('never lets a goal node be confirmed', () => {
    // The goal is the frame of the map, not a claim about the learner.
    const confirmedGoal = withEvidence(goal, [evidence('check')])
    const result = setNodeState(confirmedGoal, 'confirmed', NOW)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations[0]?.code).toBe('goal-node-confirmed')
  })

  it('permits the weaker states without extra evidence', () => {
    for (const state of ['explained', 'practiced', 'checked', 'weak', 'blocked', 'unconfirmed'] as const) {
      expect(checkNodeState({ ...target, state })).toBeUndefined()
    }
  })
})

describe('evidence', () => {
  it('appends without disturbing earlier entries', () => {
    const first: Evidence = { kind: 'diagnosis', at: NOW, note: 'gap found' }
    const second: Evidence = { kind: 'check', at: NOW, readiness: 'review-first' }
    const one = recordEvidence(node({ id: 'n2' }), first, { now: NOW })
    expect(one.ok).toBe(true)
    const two = recordEvidence(one.ok ? one.node : node({ id: 'n2' }), second, { now: NOW })
    expect(two.ok).toBe(true)
    expect(two.ok === true && two.node.evidence).toEqual([first, second])
  })

  it('refuses to attach a confirming state to weak evidence in the same call', () => {
    const result = recordEvidence(node({ id: 'n3' }), { kind: 'explanation', at: NOW }, {
      now: NOW,
      state: 'confirmed',
    })
    expect(result.ok).toBe(false)
  })

  it('accepts the state when the same call also supplies a check', () => {
    const result = recordEvidence(node({ id: 'n4' }), { kind: 'check', at: NOW }, {
      now: NOW,
      state: 'confirmed',
    })
    expect(result.ok).toBe(true)
    expect(result.ok === true && result.node.state).toBe('confirmed')
  })
})

describe('map shape', () => {
  it('accepts a well-formed map', () => {
    const child = node({ id: 'n5', parentId: goal.id })
    expect(validateMap([goal, child])).toEqual([])
  })

  it('rejects two goal nodes in one course', () => {
    const second = node({ id: 'g2', relation: 'goal', parentId: undefined })
    const codes = validateMap([goal, second]).map((v) => v.code)
    expect(codes).toContain('multiple-goal-nodes')
  })

  it('rejects a goal node that has a parent', () => {
    const parented = node({ id: 'g3', relation: 'goal', parentId: 'something' })
    expect(validateMap([parented]).map((v) => v.code)).toContain('goal-node-has-parent')
  })

  it('rejects a node with no parent that is not a goal', () => {
    // This is the anti-syllabus rule: a free-floating node is a topic list.
    const floating = node({ id: 'n6', parentId: undefined })
    expect(validateMap([goal, floating]).map((v) => v.code)).toContain('goal-node-not-root')
  })

  it('rejects a parent that does not exist', () => {
    const orphan = node({ id: 'n7', parentId: 'ghost' })
    expect(validateMap([goal, orphan]).map((v) => v.code)).toContain('missing-parent')
  })

  it('rejects a parent belonging to another course', () => {
    const foreign = { ...node({ id: 'other' }), courseId: 'other-course' }
    const child = node({ id: 'n8', parentId: 'other' })
    const codes = validateMap([goal, foreign, child]).map((v) => v.code)
    expect(codes).toContain('parent-in-other-course')
  })

  it('rejects a parent cycle', () => {
    const a = node({ id: 'a', parentId: 'b' })
    const b = node({ id: 'b', parentId: 'a' })
    expect(validateMap([goal, a, b]).map((v) => v.code)).toContain('parent-cycle')
  })

  it('rejects a node that is its own parent', () => {
    const self = node({ id: 'n9', parentId: 'n9' })
    expect(validateMap([goal, self]).map((v) => v.code)).toContain('self-parent')
  })
})

describe('growth limits keep a diagnosis from becoming a syllabus', () => {
  const existing = [goal]

  it('allows a small cluster', () => {
    const proposed = Array.from({ length: 3 }, (_, index) =>
      node({ id: `c${index}`, parentId: goal.id }),
    )
    expect(acceptNewNodes(existing, proposed).ok).toBe(true)
  })

  it('refuses a whole-course dump in one call', () => {
    const proposed = Array.from({ length: MAX_NODES_PER_UPDATE + 1 }, (_, index) =>
      node({ id: `d${index}`, parentId: goal.id }),
    )
    const result = acceptNewNodes(existing, proposed)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations.map((v) => v.code)).toContain('batch-too-large')
  })

  it('refuses to grow a course past its ceiling', () => {
    const full = Array.from({ length: MAX_NODES_PER_COURSE }, (_, index) =>
      node({ id: `f${index}`, parentId: goal.id }),
    )
    const result = acceptNewNodes([goal, ...full], [node({ id: 'extra', parentId: goal.id })])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations.map((v) => v.code)).toContain('course-too-large')
  })

  it('refuses a duplicate node id', () => {
    const result = acceptNewNodes(existing, [node({ id: goal.id, parentId: goal.id })])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.violations.map((v) => v.code)).toContain('duplicate-node-id')
  })

  it('refuses an empty batch', () => {
    expect(acceptNewNodes(existing, []).ok).toBe(false)
  })
})

/**
 * Unit tests for the persistence contract's pure parts: the domain
 * declaration and the zod record schemas.
 *
 * These run without any harness. They pin the *contract* — the closed
 * vocabularies, the storage-hub naming rules, and the global-slot invariant —
 * so a later table cannot quietly loosen it.
 */

import { UNIT_NAME_RE } from '@deepseek-ai/dsh-storage'
import { describe, expect, it } from 'vitest'

import {
  COURSES_TABLE,
  COURSE_STATUSES,
  CourseSchema,
  LearnerProfileSchema,
  NODES_TABLE,
  UDT_DOMAIN_NAME,
  UDT_DOMAIN_VERSION,
  UNINITIALIZED,
  udtDomain,
} from '../src/state.js'
import { NODE_STATES, TEACHING_MODES } from '../src/vocabulary.js'

describe('domain declaration', () => {
  it('uses a name the storage hub accepts', () => {
    // The hub rejects any unit name outside this pattern at open time.
    expect(UNIT_NAME_RE.test(UDT_DOMAIN_NAME)).toBe(true)
    expect(UNIT_NAME_RE.test(COURSES_TABLE)).toBe(true)
  })

  it('declares its version, global slot and tables', () => {
    expect(udtDomain.name).toBe(UDT_DOMAIN_NAME)
    expect(udtDomain.version).toBe(UDT_DOMAIN_VERSION)
    expect(udtDomain.global).toBeDefined()
    expect(Object.keys(udtDomain.tables)).toEqual([COURSES_TABLE, NODES_TABLE])
  })

  it('keeps the domain version at 1 across an additive table', () => {
    // The `single` layout enforces the stored version strictly: the json
    // backend rejects a mismatched document before consulting
    // `compatibleVersions`, which only `per-record` layouts honour. Since v2
    // only ADDED the `nodes` table — an old document simply has none, and the
    // facility builds the table set from the spec — bumping the version would
    // make every existing store unopenable for no benefit.
    expect(UDT_DOMAIN_VERSION).toBe(1)
    // And no `compatibleVersions` safety net is declared, because relying on
    // one is precisely the mistake: it does nothing for this layout.
    expect('compatibleVersions' in udtDomain).toBe(false)
  })

  it('starts the learner global in an explicit never-written state', () => {
    // The empty marker is what makes first-run initialization idempotent and
    // makes a restart distinguishable from a first boot.
    expect(udtDomain.global?.initial).toEqual({
      initializedAt: UNINITIALIZED,
      updatedAt: UNINITIALIZED,
    })
    expect(UNINITIALIZED).toBe('')
  })
})

describe('LearnerProfileSchema', () => {
  it('accepts the declared initial value', () => {
    expect(LearnerProfileSchema.safeParse(udtDomain.global?.initial).success).toBe(true)
  })

  it('rejects null, which the medium uses as its never-written sentinel', () => {
    // A nullable global would be indistinguishable from an absent one on
    // reopen. `defineDomain` enforces this too; pinning it here documents why.
    expect(LearnerProfileSchema.safeParse(null).success).toBe(false)
  })

  it('accepts optional preferences and rejects an unknown mode', () => {
    expect(
      LearnerProfileSchema.safeParse({ initializedAt: 'T', updatedAt: 'T', mode: 'standard' }).success,
    ).toBe(true)
    expect(
      LearnerProfileSchema.safeParse({ initializedAt: 'T', updatedAt: 'T', mode: 'expert' }).success,
    ).toBe(false)
  })

  it('mirrors exactly the skill teaching modes', () => {
    expect([...TEACHING_MODES]).toEqual(['auto', 'zero-base', 'standard', 'advanced'])
  })
})

describe('CourseSchema', () => {
  const valid = {
    id: 'ml',
    title: 'Machine Learning',
    goal: 'I want to build a small ML project',
    status: 'active' as const,
    createdAt: 'T0',
    updatedAt: 'T0',
  }

  it('accepts a well-formed course', () => {
    expect(CourseSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects empty identifiers and an empty goal', () => {
    // The goal is the learner's own words; an empty one is not a goal.
    expect(CourseSchema.safeParse({ ...valid, id: '' }).success).toBe(false)
    expect(CourseSchema.safeParse({ ...valid, goal: '' }).success).toBe(false)
  })

  it('rejects a status outside the closed set', () => {
    expect(CourseSchema.safeParse({ ...valid, status: 'done' }).success).toBe(false)
    expect([...COURSE_STATUSES]).toEqual(['active', 'paused', 'archived'])
  })

  it('rejects records carrying unexpected fields is not required, but drops them', () => {
    const parsed = CourseSchema.safeParse({ ...valid, score: 92 })
    expect(parsed.success).toBe(true)
    // No score may survive into storage: the skill forbids grading.
    expect(parsed.success && 'score' in parsed.data).toBe(false)
  })
})

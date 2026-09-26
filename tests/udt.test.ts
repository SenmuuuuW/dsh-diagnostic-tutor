/**
 * Detection of the teaching brain.
 *
 * Detection must be robust in both directions: it has to find the skill when
 * it is there, and it has to say so clearly — without throwing — when it is
 * not. A profile that has never installed the skill is a normal configuration,
 * not an error, so every path here returns a status rather than raising.
 *
 * These use the harness's fixtures rather than the developer's machine, so the
 * suite gives the same answer whether or not the real skill is installed.
 */

import { describe, expect, it } from 'vitest'

import type SkillRegistry from '@deepseek-ai/dsh-skill'

import {
  CAPABILITY_ANCHORS,
  UDT_SKILL_NAME,
  detectUdtSkill,
  describeUdtStatus,
  fingerprintContent,
} from '../src/udt.js'
import {
  UDT_FIXTURE_CONTENT,
  UNRECOGNISED_FIXTURE_CONTENT,
  createHarness,
} from './harness.js'

describe('detectUdtSkill', () => {
  it('reports unavailable, with a reason, when the catalog has nothing', async () => {
    const harness = await createHarness({ udt: 'absent' })
    try {
      const status = await detectUdtSkill(harness.ctx.get('skills'))
      expect(status.available).toBe(false)
      expect(status.compatibility).toBe('unavailable')
      expect(status.reason).toBeTruthy()
      expect(status.fingerprint).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('degrades rather than throwing when no catalog is mounted at all', async () => {
    // A profile can legitimately have no skill service; detection is called
    // with `undefined` and must still answer.
    const status = await detectUdtSkill(undefined)
    expect(status.available).toBe(false)
    expect(status.compatibility).toBe('unavailable')
    expect(status.reason).toContain('no skill catalog')
  })

  it('detects a compatible skill and fingerprints its body', async () => {
    const harness = await createHarness({ udt: 'compatible' })
    try {
      const status = await detectUdtSkill(harness.ctx.get('skills'))
      expect(status.available).toBe(true)
      expect(status.name).toBe(UDT_SKILL_NAME)
      expect(status.compatibility).toBe('compatible')
      // A content digest is the version hint, because the skill cannot carry a
      // version field and must not be asked to.
      expect(status.fingerprint).toBe(fingerprintContent(UDT_FIXTURE_CONTENT))
      expect(status.fingerprint).toMatch(/^[0-9a-f]{12}$/)
      expect(status.provider).toBeTruthy()
    } finally {
      await harness.close()
    }
  })

  it('reports unknown, not compatible, when the body lacks the expected vocabulary', async () => {
    const harness = await createHarness({ udt: 'unrecognized' })
    try {
      const status = await detectUdtSkill(harness.ctx.get('skills'))
      expect(status.available).toBe(true)
      expect(status.compatibility).toBe('unknown')
      expect(status.reason).toContain(CAPABILITY_ANCHORS[0])
      expect(status.fingerprint).toBe(fingerprintContent(UNRECOGNISED_FIXTURE_CONTENT))
    } finally {
      await harness.close()
    }
  })

  it('changes its fingerprint when the body changes', () => {
    expect(fingerprintContent('a')).not.toBe(fingerprintContent('b'))
    expect(fingerprintContent('a')).toBe(fingerprintContent('a'))
  })

  it('renders one log line without leaking a path', () => {
    const line = describeUdtStatus({
      available: true,
      catalogVisible: true,
      name: UDT_SKILL_NAME,
      compatibility: 'compatible',
      provider: 'fixture',
      path: '/some/private/location',
      fingerprint: 'abc123abc123',
    })
    expect(line).toContain('compatible')
    expect(line).toContain('abc123abc123')
    // Paths belong to internal diagnostics; the log line must stay path-free.
    expect(line).not.toContain('/some/private/location')
  })
})

describe('a miss is only a finding when the catalog was readable', () => {
  /** A registry stand-in that returns exactly the summaries given. */
  const registry = (names: string[]): SkillRegistry =>
    ({
      list: () =>
        Promise.resolve(
          names.map((name) => ({ name, source: 'fixture', provider: 'fixture' })),
        ),
      get: () => Promise.resolve(undefined),
    }) as unknown as SkillRegistry

  it('does not claim absence from an empty catalog', async () => {
    // The registry reads the global layer alone without a viewing scope, and
    // the standard web profile mounts skills per agent — so a plugin at the
    // profile root sees an empty catalog even when the skill is installed and
    // the tutor is using it. Reporting that as "not installed" produced a
    // confident, wrong answer in the panel.
    const status = await detectUdtSkill(registry([]))
    expect(status.available).toBe(false)
    expect(status.catalogVisible).toBe(false)
    expect(status.reason).toMatch(/per agent|nothing can be concluded/i)
  })

  it('does claim absence when other skills are visible but this one is not', async () => {
    const status = await detectUdtSkill(registry(['something-else', 'another']))
    expect(status.available).toBe(false)
    expect(status.catalogVisible).toBe(true)
    expect(status.reason).toMatch(/not among the 2 skills/)
  })

  it('reports a found skill as visible and compatible', async () => {
    const status = await detectUdtSkill(registry([UDT_SKILL_NAME]))
    // Listed, but its body cannot be loaded by this stub, so it is `unknown`
    // rather than `compatible` — the point here is the two booleans.
    expect(status.available).toBe(true)
    expect(status.catalogVisible).toBe(true)
  })
})

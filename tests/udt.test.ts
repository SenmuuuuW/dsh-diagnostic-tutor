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

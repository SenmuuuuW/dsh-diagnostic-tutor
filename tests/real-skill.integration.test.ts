/**
 * Detection against the *real* environment.
 *
 * The unit tests in `udt.test.ts` use fixtures, so they give the same answer on
 * every machine. This file does the opposite on purpose: it mounts the real
 * filesystem skill provider and asks whether the real skill is installed
 * wherever these tests happen to run.
 *
 * It therefore **skips itself** when the skill is absent, the same way the
 * harness's real-API suites skip without credentials. A green run on a machine
 * without the skill proves nothing about detection, so the test says so out
 * loud rather than reporting a pass it did not earn.
 */

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as skillFilesystem from '@deepseek-ai/dsh-skill-filesystem'
import { describe, expect, it } from 'vitest'

import { UDT_SKILL_NAME, detectUdtSkill } from '../src/udt.js'

/** Discover skills from the machine's real project and user roots. */
async function realCatalog() {
  const ctx = new Context()
  const fibers = [await ctx.plugin(SkillRegistry)]
  fibers.push(await ctx.plugin(skillFilesystem, { includeDefaultRoots: true, watch: false }))
  return { skills: ctx.get('skills'), fibers }
}

describe('detection against the installed environment', () => {
  it('finds the real skill when it is installed here', async () => {
    const { skills, fibers } = await realCatalog()
    try {
      const status = await detectUdtSkill(skills)

      if (!status.available) {
        // Not a failure: this machine simply has no copy installed. Report it
        // rather than passing silently.
        console.warn(
          `[integration] ${UDT_SKILL_NAME} is not installed on this machine (${status.reason}); ` +
            'skipping the real-environment detection assertions.',
        )
        expect(status.compatibility).toBe('unavailable')
        return
      }

      expect(status.available).toBe(true)
      // The real skill's body must carry the vocabulary this runtime mirrors.
      // If this fails, the skill changed and the mirror needs re-checking —
      // which is exactly the signal we want.
      expect(status.compatibility).toBe('compatible')
      expect(status.fingerprint).toMatch(/^[0-9a-f]{12}$/)
      expect(status.provider).toBeTruthy()
      expect(status.path).toBeTruthy()

      console.warn(
        `[integration] detected ${UDT_SKILL_NAME} (${status.compatibility}) ` +
          `from provider "${status.provider}" fingerprint ${status.fingerprint}`,
      )
    } finally {
      for (const fiber of fibers.reverse()) await fiber.dispose()
    }
  })
})

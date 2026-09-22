/**
 * The temporary runtime adapter.
 *
 * It exists to tell the teaching brain one thing it cannot otherwise know: that
 * in this runtime, learner state is explicitly persisted and the map is
 * diagnosis-driven. Two properties matter and are both tested here — that it
 * is contributed exactly when it is relevant, and that it stays a short
 * semantics note rather than becoming a second teaching brain.
 */

import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

import {
  RUNTIME_SEMANTICS_ORDER,
  RUNTIME_SEMANTICS_SECTION,
  RUNTIME_SEMANTICS_TEXT,
  installRuntimeAdapter,
} from '../src/adapter.js'
import * as plugin from '../src/index.js'
import { createHarness } from './harness.js'

/** Assemble the prompt and pull out our section, if it is present. */
async function assembledSection(ctx: Context): Promise<{ names: string[]; text: string | undefined }> {
  const systemPrompt = ctx.get('systemPrompt')
  if (!systemPrompt) throw new Error('harness: no system prompt mounted')
  const assembly = await systemPrompt.assemble()
  return {
    names: assembly.sections.map((section) => section.name),
    text: assembly.sections.find((section) => section.name === RUNTIME_SEMANTICS_SECTION)?.text,
  }
}

describe('runtime adapter contribution', () => {
  it('is contributed when the teaching brain is present', async () => {
    const harness = await createHarness({ udt: 'compatible' })
    try {
      await harness.ctx.plugin(plugin)
      const { names, text } = await assembledSection(harness.ctx)
      expect(names).toContain(RUNTIME_SEMANTICS_SECTION)
      expect(text).toBe(RUNTIME_SEMANTICS_TEXT)
    } finally {
      await harness.close()
    }
  })

  it('is absent when the teaching brain is not installed', async () => {
    // Without the skill there is no tension to resolve, so the runtime stays
    // silent rather than explaining itself to nothing.
    const harness = await createHarness({ udt: 'absent' })
    try {
      await harness.ctx.plugin(plugin)
      const { names } = await assembledSection(harness.ctx)
      expect(names).not.toContain(RUNTIME_SEMANTICS_SECTION)
    } finally {
      await harness.close()
    }
  })

  it('is still contributed when the skill is present but its body is unrecognised', async () => {
    // Presence, not verified compatibility, is the trigger. A skill answering
    // to that name may simply be a newer version whose wording moved on — and
    // that is exactly when the runtime most needs to state its semantics,
    // rather than assuming the tension has gone away.
    const harness = await createHarness({ udt: 'unrecognized' })
    try {
      await harness.ctx.plugin(plugin)
      const { names } = await assembledSection(harness.ctx)
      expect(names).toContain(RUNTIME_SEMANTICS_SECTION)
    } finally {
      await harness.close()
    }
  })

  it('is withdrawn when the plugin unloads', async () => {
    const harness = await createHarness({ udt: 'compatible' })
    try {
      const fiber = await harness.ctx.plugin(plugin)
      expect((await assembledSection(harness.ctx)).names).toContain(RUNTIME_SEMANTICS_SECTION)

      await fiber.dispose()

      expect((await assembledSection(harness.ctx)).names).not.toContain(RUNTIME_SEMANTICS_SECTION)
    } finally {
      await harness.close()
    }
  })

  it('degrades instead of throwing when there is no system prompt', async () => {
    // A profile may mount no system prompt at all; the adapter is best-effort.
    const stub = { logger: { debug: () => {} }, get: () => undefined }
    expect(() =>
      installRuntimeAdapter(stub as unknown as Parameters<typeof installRuntimeAdapter>[0]),
    ).not.toThrow()
    expect(
      installRuntimeAdapter(stub as unknown as Parameters<typeof installRuntimeAdapter>[0]),
    ).toBe(false)
  })
})

describe('runtime adapter content', () => {
  it('states the three semantics and nothing else', () => {
    // Persistence is explicit and visible.
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/explicit and user-visible/i)
    // Stored state is evidence, not truth.
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/evidence to be re-checked/i)
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/unconfirmed/)
    // The map is diagnosis-driven, not a syllabus, and carries no scores.
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/diagnosis-driven and reversible/i)
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/no scores/i)
    // A finished turn produces a decision, and nothing moves without the learner.
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/udt_decide_next/)
    expect(RUNTIME_SEMANTICS_TEXT).toMatch(/nothing moves until the learner chooses/i)
  })

  it('carries no teaching logic', () => {
    // If any of these appear, the adapter has started teaching.
    // The tutor decides these; the adapter must not name them at all.
    for (const forbidden of ['Diagnose the', 'teach one', 'cognitive load', 'readiness gate', 'Clarify', 'advance to', 'practice until']) {
      expect(RUNTIME_SEMANTICS_TEXT).not.toContain(forbidden)
    }
  })

  it('names no file, version, repository or protocol', () => {
    // The skill forbids these words in learner-facing text, and a system-prompt
    // section is one paraphrase away from being learner-facing.
    for (const forbidden of ['skill', 'Skill', 'repository', 'protocol', 'version', 'file', 'v2.0', 'github']) {
      expect(RUNTIME_SEMANTICS_TEXT).not.toContain(forbidden)
    }
  })

  it('stays a short note', () => {
    // The bound exists to catch drift into a second teaching brain, not to
    // forbid growth: the focus/handoff clause added in v0.0.8 is still runtime
    // semantics — what the runtime holds, and which artifact a finished turn
    // produces — and says nothing about what to teach or how to judge. It is
    // also the difference between a tool the tutor owns and one it reaches for.
    expect(RUNTIME_SEMANTICS_TEXT.length).toBeLessThan(1400)
    expect(RUNTIME_SEMANTICS_TEXT.split('. ').length).toBeLessThanOrEqual(8)
  })

  it('sits after the tool descriptions and before the output sections', () => {
    expect(RUNTIME_SEMANTICS_ORDER).toBeGreaterThan(3100)
    expect(RUNTIME_SEMANTICS_ORDER).toBeLessThan(5000)
  })
})

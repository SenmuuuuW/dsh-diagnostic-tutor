/**
 * Guard tests for the plugin entry's export shape.
 *
 * These are cheap, but they defend the most damaging and least visible failure
 * mode for a DSH plugin: `Loader.unwrapExports` prefers a module's `.default`
 * export, and a default-exported plugin object SILENTLY loses its `inject`
 * list. DSH shipped that exact outage once
 * (docs/postmortem/0001-acp-default-export-drops-inject.md), so the shape is
 * pinned here rather than left to review.
 *
 * See docs/planning/PLAN.md 2.12 #9.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as mod from '../src/index.js'
import { createHarness } from './harness.js'

describe('plugin entry export shape', () => {
  it('does not export a default', () => {
    // The regression guard: introducing `export default` here would make the
    // loader prefer it and drop `inject`. This assertion must keep failing the
    // build if that ever happens.
    expect('default' in mod).toBe(false)
  })

  it('exports the stable plugin module name', () => {
    expect(mod.name).toBe('diagnostic-tutor')
  })

  it('exports a callable apply', () => {
    expect(typeof mod.apply).toBe('function')
  })

  it('declares exactly the services it requires', () => {
    // Only services the standard profiles guarantee belong here. Anything
    // optional must be resolved lazily, because a missing top-level injection
    // leaves the plugin pending forever and prints nothing.
    expect(mod.inject).toEqual(['tools', 'storageDomain'])
  })

  it('fails loudly when a required service is missing', async () => {
    const calls: string[] = []
    const ctx = {
      logger: {
        debug: (format: string) => calls.push(`debug:${format}`),
        error: (format: string) => calls.push(`error:${format}`),
      },
      // Simulate a context where the required seams never arrived.
      get: () => undefined,
    }

    await expect(
      mod.apply(ctx as unknown as Parameters<typeof mod.apply>[0]),
    ).resolves.toBeUndefined()

    // Degrading silently would leave a plugin that looks loaded but does
    // nothing, so a missing seam must be reported.
    expect(calls.some((call) => call.includes('missing required service'))).toBe(true)
    expect(calls.some((call) => call === 'error:[diagnostic-tutor] missing required service(s): tools storageDomain')).toBe(true)
  })
})

describe('a damaged store degrades instead of taking the tree down', () => {
  it('stays inert when the stored learner record does not match its schema', async () => {
    // Reproduces a hand-edited or partially written store file. The failure
    // surfaces at the durable read boundary, which is before any tool exists —
    // so without the guard `apply` rejects, the loader treats that as a fatal
    // composition error, and every unrelated plugin in the profile fails to
    // load with nothing registered to report why.
    const harness = await createHarness()
    const storeRoot = harness.storeRoot
    await harness.close({ keepStore: true })

    const file = join(storeRoot, 'udt.json')
    // The domain must OPEN successfully and the first *read* must be what
    // fails, so the table declarations stay intact and only the learner record
    // is damaged — which is what a partial write or a hand edit produces.
    writeFileSync(
      file,
      JSON.stringify({
        unit: { name: 'udt', version: 1 },
        global: {},
        tables: { courses: {}, nodes: {}, lessons: {}, focus: {}, next_steps: {}, handoffs: {} },
      }),
    )

    const damaged = await createHarness({ storeRoot })
    try {
      const errors: string[] = []
      damaged.ctx.logger.error = (format: string) => errors.push(String(format))

      // The contract: it resolves. A rejected `apply` is a fatal composition
      // error for the whole profile.
      await expect(damaged.ctx.plugin(mod)).resolves.toBeDefined()

      expect(errors.some((line) => line.includes('could not open storage domain'))).toBe(true)
      // Inert, not half-mounted: no tools, and no domain left open.
      expect(damaged.ctx.get('tools')?.schemas() ?? []).toEqual([])
      expect(damaged.ctx.get('storageDomain')?.get('udt')).toBeUndefined()
    } finally {
      await damaged.close()
    }
  })
})

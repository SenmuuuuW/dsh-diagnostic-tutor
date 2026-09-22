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

import { describe, expect, it } from 'vitest'

import * as mod from '../src/index.js'

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

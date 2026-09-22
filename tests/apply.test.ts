/**
 * Guard tests for the plugin entry's export shape.
 *
 * These are cheap but they defend the single most damaging and least visible
 * failure mode for a DSH plugin: `Loader.unwrapExports` prefers a module's
 * `.default` export, and a default-exported plugin object SILENTLY loses its
 * `inject` list. DSH shipped that exact outage once
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

  it('applies against a minimal context without throwing', () => {
    // Only `ctx.logger` is touched in v0.0.1, so a structural stub is enough.
    // No DSH runtime object is imported, so this cannot drift with a harness
    // cohort (PLAN.md 2.12 #16).
    const lines: string[] = []
    const ctx = {
      logger: {
        info: (format: string) => {
          lines.push(format)
        },
      },
    }

    expect(() => {
      mod.apply(ctx as unknown as Parameters<typeof mod.apply>[0])
    }).not.toThrow()
    expect(lines).toHaveLength(1)
  })
})

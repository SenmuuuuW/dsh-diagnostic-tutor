/**
 * Real-composition tests: load the plugin through a real Cordis context with
 * the real storage stack and the real tools registry.
 *
 * `--dump-config` proves only that a loader ROW exists — not that the module
 * loads, that `apply` runs, or that unload is clean. These tests close that
 * gap by driving the same runtime DSH is built on, using the cordis line the
 * harness vendors (pinned in devDependencies).
 *
 * See docs/planning/PLAN.md 2.12 #7: `apply()` is the easiest thing to leave
 * untested, and it was the weakest link in the closest prior-art plugin.
 */

import { describe, expect, it } from 'vitest'

import * as plugin from '../src/index.js'
import { createHarness } from './harness.js'

/**
 * `FiberState` is a `const enum` in cordis; with `isolatedModules` enabled it
 * cannot be imported as a value. The numeric members are pinned here with
 * their source (cordis/lib/types/fiber.d.ts:67) so a renumbering fails loudly.
 */
const FIBER_ACTIVE = 2
const FIBER_DISPOSED = 4

describe('real cordis composition', () => {
  it('loads against the real services and reaches ACTIVE', async () => {
    const harness = await createHarness()
    try {
      const fiber = await harness.ctx.plugin(plugin)
      expect(fiber.state).toBe(FIBER_ACTIVE)
    } finally {
      await harness.close()
    }
  })

  it('reports readiness at debug level, so a normal boot stays quiet', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      // Captured only because the harness raises the exporter threshold; on a
      // default DSH boot these lines are filtered out.
      expect(harness.logs.some((line) => line.includes('[diagnostic-tutor] plugin loading'))).toBe(true)
      expect(harness.logs.some((line) => line.includes('[diagnostic-tutor] ready'))).toBe(true)
    } finally {
      await harness.close()
    }
  })

  it('never logs a missing-service error while loading', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const errors = harness.logs.filter((line) => line.includes('missing required service'))
      expect(errors).toEqual([])
    } finally {
      await harness.close()
    }
  })

  it('disposes cleanly back to DISPOSED', async () => {
    const harness = await createHarness()
    try {
      const fiber = await harness.ctx.plugin(plugin)
      await expect(fiber.dispose()).resolves.toBeUndefined()
      expect(fiber.state).toBe(FIBER_DISPOSED)
    } finally {
      await harness.close()
    }
  })
})

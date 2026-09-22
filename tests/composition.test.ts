/**
 * Real-composition test: load the plugin through a real Cordis `Context`.
 *
 * `--dump-config` proves only that a loader ROW exists, not that the plugin
 * module loads and `apply` runs. This test closes that gap by driving the
 * actual Cordis runtime that DSH is built on, using the same
 * `@deepseek-ai/cordis` line the harness vendors (pinned in devDependencies).
 *
 * It is deliberately level-independent: a bare `Context` has no DSH logger
 * intercept, so `info` is not filtered and the load line is observable.
 *
 * See docs/planning/PLAN.md 2.12 #7 (`apply()` is the easiest thing to leave
 * untested — it was the weakest link in the closest prior-art plugin).
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'

import * as plugin from '../src/index.js'

/**
 * `FiberState` is a `const enum` in Cordis; with `isolatedModules` enabled it
 * cannot be imported as a value. The numeric members are pinned here with
 * their source (cordis/lib/types/fiber.d.ts:67) so a renumbering fails loudly.
 */
const FIBER_ACTIVE = 2
const FIBER_DISPOSED = 4

function captureLogs(root: Context): string[] {
  const lines: string[] = []
  root.logger.exporter({
    export(message) {
      lines.push(message.args.map((arg) => String(arg)).join(' '))
    },
  })
  return lines
}

describe('real cordis composition', () => {
  it('loads, applies, and reports its load line', async () => {
    const root = new Context()
    const lines = captureLogs(root)

    const fiber = root.plugin(plugin)
    await fiber

    expect(fiber.state).toBe(FIBER_ACTIVE)
    expect(lines.some((line) => line.includes('[diagnostic-tutor] plugin loaded'))).toBe(true)
  })

  it('disposes cleanly (reverse-effect lifecycle)', async () => {
    const root = new Context()
    const fiber = root.plugin(plugin)
    await fiber

    await expect(fiber.dispose()).resolves.toBeUndefined()
    expect(fiber.state).toBe(FIBER_DISPOSED)
  })
})

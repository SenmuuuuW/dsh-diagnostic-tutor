/**
 * Real-composition test harness.
 *
 * Composes the *same* stack the standard DSH profiles mount — `systemPrompt`,
 * the `tools` registry, the skill catalog, and `storage` → `storage-json` →
 * `storage-domain` (see `@deepseek-ai/dsh-base`'s cordis.patch.yml) — over a
 * temporary directory.
 *
 * The point is to avoid the trap the plugin-test guidance warns about: a
 * handwritten fake proves only that a bridge moved bytes. Persistence tests
 * here write through the real backend and read back through the real
 * validation boundary, so "state survives a restart" means an actual
 * serialize → file → reparse → zod-validate round trip.
 *
 * Only the storage *root* is substituted, which is exactly what a profile
 * substitutes in production (`dshHomePath('storages')`).
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Fiber } from '@deepseek-ai/cordis'

/** Debug is the lowest level; a bare exporter would otherwise filter it out. */
const CAPTURE_ALL_LEVELS = 3

/**
 * Which fixture teaching brain the harness should present.
 *
 * `absent` models a profile where the skill was never installed; the other two
 * model it being present with a recognisable or an unrecognised body.
 */
export type UdtFixture = 'compatible' | 'unrecognized' | 'absent'

/**
 * A minimal stand-in for the skill body.
 *
 * It carries the capability anchors the detector probes for, so detection can
 * be exercised without depending on the real skill being installed on the
 * machine running the tests.
 */
export const UDT_FIXTURE_CONTENT = `# Universal Diagnostic Tutor

## Core Loop

1. **Diagnose.** Name the subject and the likely blocking gap.
2. **Intervene.** Teach one compact unit.

Status terms: explained, practiced, checked, confirmed, unconfirmed, weak,
blocked.
`

/** A body that lacks the anchors, standing in for an unrelated skill. */
export const UNRECOGNISED_FIXTURE_CONTENT = `# Something Else

A skill that is not the teaching brain.
`

export interface HarnessOptions {
  /**
   * Reuse an existing store directory. Passing the directory of a closed
   * harness is how the tests simulate a process restart.
   */
  readonly storeRoot?: string
  /** Which teaching-brain fixture to install. Defaults to `absent`. */
  readonly udt?: UdtFixture
}

export interface TestHarness {
  readonly ctx: Context
  /** The directory acting as `dshHomePath('storages')`. */
  readonly storeRoot: string
  /** Every log line emitted by any plugin in this composition. */
  readonly logs: string[]
  /**
   * Dispose the whole stack in reverse order.
   * @param options.keepStore - leave the store directory on disk (a restart).
   */
  close(options?: { readonly keepStore?: boolean }): Promise<void>
}

/**
 * Compose the stack over a temporary (or reused) store root.
 *
 * @param options - optional store root and skill fixture.
 * @returns the harness handle.
 */
export async function createHarness(options: HarnessOptions = {}): Promise<TestHarness> {
  const ownStore = options.storeRoot === undefined
  const storeRoot = options.storeRoot ?? (await mkdtemp(join(tmpdir(), 'udt-store-')))
  const ctx = new Context()

  const logs: string[] = []
  ctx.logger.exporter({
    levels: { default: CAPTURE_ALL_LEVELS },
    export(message) {
      logs.push(message.args.map((arg) => String(arg)).join(' '))
    },
  })

  const fibers: Fiber[] = []
  // The tools registry injects `systemPrompt`, so that service must exist
  // first; otherwise ToolRuntime stays PENDING and the plugin under test —
  // which injects `tools` — would stay PENDING too, printing nothing.
  fibers.push(await ctx.plugin(SystemPrompt))
  fibers.push(await ctx.plugin(ToolRuntime))
  // The hub has to exist before either backend or domain form can inject it.
  fibers.push(await ctx.plugin(Storage))
  fibers.push(await ctx.plugin(storageJson, { root: storeRoot }))
  fibers.push(await ctx.plugin(storageDomain, { backend: 'json' }))
  fibers.push(await ctx.plugin(SkillRegistry))

  if (options.udt !== undefined && options.udt !== 'absent') {
    const skills = ctx.get('skills')
    if (!skills) throw new Error('harness: skill registry did not mount')
    skills.register({
      name: 'universal-diagnostic-tutor',
      description: 'Diagnosis-first tutoring.',
      source: 'runtime',
      content: options.udt === 'compatible' ? UDT_FIXTURE_CONTENT : UNRECOGNISED_FIXTURE_CONTENT,
    })
  }

  return {
    ctx,
    storeRoot,
    logs,
    async close({ keepStore = false } = {}) {
      for (const fiber of fibers.reverse()) await fiber.dispose()
      if (ownStore && !keepStore) await rm(storeRoot, { recursive: true, force: true })
    },
  }
}

/**
 * List the files the backend created under the store root.
 *
 * @param storeRoot - the harness store directory.
 * @returns sorted relative file names.
 */
export async function storeFiles(storeRoot: string): Promise<string[]> {
  return (await readdir(storeRoot)).sort()
}

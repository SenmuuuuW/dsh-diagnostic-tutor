/**
 * Real-composition test harness.
 *
 * Composes the *same* storage stack the standard DSH profiles mount —
 * `storage` hub → `json` backend → schema-validated `domain` form (see
 * `@deepseek-ai/dsh-base`'s cordis.patch.yml) — over a temporary directory.
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

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { Fiber } from '@deepseek-ai/cordis'

/** Debug is the lowest level; a bare exporter would otherwise filter it out. */
const CAPTURE_ALL_LEVELS = 3

export interface HarnessOptions {
  /**
   * Reuse an existing store directory. Passing the directory of a closed
   * harness is how the tests simulate a process restart.
   */
  readonly storeRoot?: string
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
 * Compose the storage stack over a temporary (or reused) store root.
 *
 * @param options - optional store root to reuse.
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
  const { readdir } = await import('node:fs/promises')
  return (await readdir(storeRoot)).sort()
}

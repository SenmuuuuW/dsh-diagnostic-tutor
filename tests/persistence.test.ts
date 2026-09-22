/**
 * End-to-end tests for the persistence contract.
 *
 * These are the tests that actually matter for v0.0.2:
 *   1. the tool is really registered and really executes;
 *   2. first run initializes learner state, and a restart recovers it;
 *   3. unloading leaves no residue — no tool, no open domain, no stuck name.
 *
 * Everything is verified against the world outside the plugin (the tool
 * registry and the store file on disk), never against what the plugin claims.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as plugin from '../src/index.js'
import { createHarness, storeFiles } from './harness.js'

const FIBER_ACTIVE = 2
const STORE_FILE = 'udt.json'

/** Read and parse the domain file the json backend wrote. */
async function readStore(storeRoot: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(storeRoot, STORE_FILE), 'utf8')) as Record<string, unknown>
}

describe('tool registration', () => {
  it('registers udt_status on the real registry', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const tools = harness.ctx.get('tools')
      const definition = tools?.get('udt_status')
      expect(definition).toBeDefined()
      expect(definition?.name).toBe('udt_status')
      // The description is model-facing; it must be a real instruction.
      expect(definition?.description).toContain('learning runtime')
    } finally {
      await harness.close()
    }
  })

  it('executes against live state', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const definition = harness.ctx.get('tools')?.get('udt_status')
      const exec = {} as unknown as Parameters<NonNullable<typeof definition>['execute']>[1]
      const value = (await definition?.execute({}, exec)) as Record<string, unknown>

      expect(value).toMatchObject({
        domain: 'udt',
        version: 1,
        initialized: true,
        courseCount: 0,
        nodeCount: 0,
        courses: [],
      })
      // Optional fields are omitted, never present-but-undefined.
      expect('preferredLanguage' in value).toBe(false)
    } finally {
      await harness.close()
    }
  })
})

describe('durability', () => {
  it('persists the domain under the configured store root', async () => {
    const harness = await createHarness()
    try {
      await harness.ctx.plugin(plugin)
      const files = await storeFiles(harness.storeRoot)
      expect(files).toContain(STORE_FILE)
    } finally {
      await harness.close()
    }
  })

  it('recovers learner state across a restart instead of re-initializing', async () => {
    // ---- first run -------------------------------------------------------
    const first = await createHarness()
    const firstRoot = first.storeRoot
    let initializedAt: unknown
    try {
      await first.ctx.plugin(plugin)
      const stored = await readStore(firstRoot)
      initializedAt = (stored.global as { initializedAt?: unknown } | undefined)?.initializedAt
      expect(typeof initializedAt).toBe('string')
      expect(initializedAt).not.toBe('')
    } finally {
      // Keep the store: this is the restart.
      await first.close({ keepStore: true })
    }

    // ---- second run over the same store ----------------------------------
    const second = await createHarness({ storeRoot: firstRoot })
    try {
      await second.ctx.plugin(plugin)
      const stored = await readStore(firstRoot)
      // If the plugin had failed to read the medium, `ensureLearner` would
      // have seen the never-written sentinel and stamped a fresh timestamp.
      expect((stored.global as { initializedAt?: unknown } | undefined)?.initializedAt).toBe(initializedAt)
    } finally {
      await second.close()
    }
  })
})

describe('a broken store must not take the plugin tree down', () => {
  it('degrades to inert instead of rejecting when the document cannot be read', async () => {
    // Found by a real boot: the loader treats a rejection from `apply` as a
    // fatal composition error, so an unreadable store would stop every
    // unrelated plugin in the profile from loading. Simulate the exact case —
    // a document stamped with a version this build does not expect.
    const { mkdtemp, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const storeRoot = await mkdtemp(join(tmpdir(), 'udt-broken-'))
    await writeFile(
      join(storeRoot, STORE_FILE),
      JSON.stringify({ unit: { name: 'udt', version: 99 }, global: {}, tables: {} }),
      'utf8',
    )

    const harness = await createHarness({ storeRoot })
    try {
      const fiber = await harness.ctx.plugin(plugin)
      // The plugin loads; it does not blow up the composition.
      expect(fiber.state).toBe(FIBER_ACTIVE)

      // And it says why, loudly, rather than pretending to work.
      expect(harness.logs.some((line) => line.includes('could not open storage domain'))).toBe(true)

      // Inert: no tools registered against a store it cannot trust.
      expect(harness.ctx.get('tools')?.schemas() ?? []).toEqual([])
    } finally {
      await harness.close()
    }
  })
})

describe('unload leaves no residue', () => {
  it('removes the tool and closes the domain', async () => {
    const harness = await createHarness()
    try {
      const fiber = await harness.ctx.plugin(plugin)
      const tools = harness.ctx.get('tools')
      const facility = harness.ctx.get('storageDomain')

      expect(tools?.get('udt_status')).toBeDefined()
      expect(facility?.get('udt')).toBeDefined()

      await fiber.dispose()

      // The registration is an effect, so unloading must retract it.
      expect(tools?.get('udt_status')).toBeUndefined()
      // The domain is closed and its name freed for a later open.
      expect(facility?.get('udt')).toBeUndefined()
    } finally {
      await harness.close()
    }
  })

  it('can be loaded and unloaded repeatedly without leaking the domain name', async () => {
    const harness = await createHarness()
    try {
      for (let round = 0; round < 3; round += 1) {
        const fiber = await harness.ctx.plugin(plugin)
        expect(fiber.state).toBe(FIBER_ACTIVE)
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeDefined()
        await fiber.dispose()
        expect(harness.ctx.get('storageDomain')?.get('udt')).toBeUndefined()
      }
    } finally {
      await harness.close()
    }
  })
})

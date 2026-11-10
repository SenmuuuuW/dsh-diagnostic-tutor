/** Local human-approval boundary: digest, revocation, mutation, no non-TTY approval. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { APPROVED_SCENES } from '../src/scene/approved.js'
import { assertSceneWriteAllowed, checkSceneGate } from '../src/scene/approval.js'
import { digestScene, isApprovedAnywhere, loadLocalRegistry } from '../src/scene/local-registry.js'
import type { LocalApprovedScene } from '../src/scene/local-registry.js'

const ENV = 'DSH_DIAGNOSTIC_TUTOR_SCENE_REGISTRY'
const approved = APPROVED_SCENES[0]!
const localSpec = (() => { const s = structuredClone(approved.spec) as any; s.metadata.title = 'Local reviewed variant'; return s })()
const localFallback = approved.fallback + ' (local review variant)'
let dir: string
let registry: string
let previous: string | undefined
function sceneEntry(patch: Record<string, unknown> = {}): LocalApprovedScene {
  const spec = structuredClone(localSpec) as any
  if (patch.title !== undefined) spec.metadata.title = patch.title
  return { id: String(patch.id ?? 'local-scene'), title: String(patch.title ?? 'Local unit circle'), spec, fallback: String(patch.fallback ?? localFallback), digest: digestScene({ spec, fallback: String(patch.fallback ?? localFallback) })!, approvedAt: '2026-11-09T00:00:00.000Z', reviewer: 'test-reviewer' }
}
async function writeRegistry(entries: unknown[]): Promise<void> { await writeFile(registry, JSON.stringify({ version: 1, scenes: entries }, null, 2)) }

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'udt-scene-registry-'))
  registry = join(dir, 'approved-scenes.json')
  previous = process.env[ENV]
  process.env[ENV] = registry
  process.env.DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES = '1'
})
afterEach(async () => {
  if (previous === undefined) delete process.env[ENV]; else process.env[ENV] = previous
  delete process.env.DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES
  await rm(dir, { recursive: true, force: true })
})

describe('local approved scene registry', () => {
  it('loads a human-approved exact scene and accepts its write only after flag + digest checks', async () => {
    await writeRegistry([sceneEntry()])
    const loaded = loadLocalRegistry()
    expect(loaded.scenes).toHaveLength(1)
    expect(loaded.errors).toEqual([])
    expect(isApprovedAnywhere(localSpec, localFallback)).toBe(true)
    const gate = checkSceneGate({ spec: localSpec, fallback: localFallback }, true)
    expect(gate).toMatchObject({ valid: true, approved: true, enabled: true })
    expect(gate.visual?.ok).toBe(true)
    expect(() => assertSceneWriteAllowed({ spec: localSpec, fallback: localFallback })).not.toThrow()
  })

  it('invalidates approval when content changes but the stored digest does not', async () => {
    const entry = sceneEntry(); const mutated = { ...entry, fallback: entry.fallback + ' changed' }
    await writeRegistry([mutated])
    const loaded = loadLocalRegistry()
    expect(loaded.scenes).toHaveLength(0)
    expect(loaded.errors[0]).toMatch(/failed digest/)
    expect(isApprovedAnywhere(localSpec, localFallback)).toBe(false)
    expect(() => assertSceneWriteAllowed({ spec: localSpec, fallback: localFallback })).toThrow(/scene-not-approved/)
  })

  it('revocation removes the scene from the approved set', async () => {
    await writeRegistry([sceneEntry()]); expect(isApprovedAnywhere(localSpec, localFallback)).toBe(true)
    await writeRegistry([]); expect(isApprovedAnywhere(localSpec, localFallback)).toBe(false)
    expect(() => assertSceneWriteAllowed({ spec: localSpec, fallback: localFallback })).toThrow(/scene-not-approved/)
  })

  it('does not approve a scene with visual errors', async () => {
    const badSpec = structuredClone(approved.spec) as any
    badSpec.primitives[0] = { id: 'bad-line', type: 'line', x1: 1, y1: 1, x2: 2, y2: 2 }
    const entry = { ...sceneEntry(), spec: badSpec, digest: digestScene({ spec: badSpec, fallback: localFallback }) }
    await writeRegistry([entry])
    const loaded = loadLocalRegistry()
    expect(loaded.scenes).toHaveLength(0)
    expect(loaded.errors[0]).toMatch(/failed digest|failed/)
  })

  it('refuses non-interactive approval from the CLI', async () => {
    const candidate = join(dir, 'candidate.json')
    await writeFile(candidate, JSON.stringify({ id: 'candidate', spec: localSpec, fallback: localFallback }))
    const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts/scene-review.mjs'), 'approve', candidate, '--reviewer', 'tester'], {
      env: { ...process.env, [ENV]: registry }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/interactive TTY required/)
    let registryText = ''
    try { registryText = await readFile(registry, 'utf8') } catch {}
    expect(registryText).toBe('')
  })
})

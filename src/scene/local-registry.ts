/**
 * Local, human-approved Scene registry.
 *
 * The HTTP surface is READ-ONLY for this registry. Approval/revocation happen in
 * an interactive local CLI, not in a browser request: DSH's loopback trust fence
 * identifies the machine, not the human, so a model or page must not be able to
 * call an Approve endpoint.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APPROVED_SCENES, sceneApprovalKey } from './approved.js'
import type { ApprovedScene } from './approved.js'
import { visualLintScene } from './visual-lint.js'
import { validateSceneSpec } from './spec.js'

export const LOCAL_REGISTRY_VERSION = 1
export const LOCAL_REGISTRY_ENV = 'DSH_DIAGNOSTIC_TUTOR_SCENE_REGISTRY'

export interface LocalApprovedScene extends ApprovedScene {
  readonly digest: string
  readonly approvedAt: string
  readonly reviewer: string
  readonly note?: string
  readonly source?: string
  readonly warningsAcknowledged?: boolean
}

export interface LocalRegistryDocument {
  version: 1
  scenes: LocalApprovedScene[]
}

export function localRegistryPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env[LOCAL_REGISTRY_ENV] !== undefined && env[LOCAL_REGISTRY_ENV] !== '') return env[LOCAL_REGISTRY_ENV]!
  const home = env.DSH_HOME !== undefined && env.DSH_HOME !== '' ? env.DSH_HOME! : join(homedir(), '.dsh')
  return join(home, 'storages', 'diagnostic-tutor-approved-scenes.json')
}

export function digestScene(content: { spec: unknown; fallback: string }): string | null {
  const key = sceneApprovalKey(content.spec, content.fallback)
  return key === null ? null : createHash('sha256').update(key).digest('hex')
}

function normalizeLocalScene(raw: unknown): LocalApprovedScene | null {
  if (raw === null || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.title !== 'string' || typeof record.fallback !== 'string') return null
  if (typeof record.digest !== 'string' || !/^[a-f0-9]{64}$/.test(record.digest)) return null
  if (typeof record.approvedAt !== 'string' || typeof record.reviewer !== 'string') return null
  const validation = validateSceneSpec(record.spec)
  if (!validation.ok) return null
  if (record.fallback.length < 1 || record.fallback.length > 2000) return null
  const visual = visualLintScene(validation.spec)
  if (!visual.ok) return null
  if (visual.diagnostics.some((entry) => entry.severity === 'warning') && record.warningsAcknowledged !== true) return null
  const digest = digestScene({ spec: validation.spec, fallback: record.fallback })
  if (digest === null || digest !== record.digest) return null
  return {
    id: record.id,
    title: record.title,
    spec: validation.spec,
    fallback: record.fallback,
    digest,
    approvedAt: record.approvedAt,
    reviewer: record.reviewer,
    ...(typeof record.note === 'string' ? { note: record.note } : {}),
    ...(typeof record.source === 'string' ? { source: record.source } : {}),
    ...(record.warningsAcknowledged === true ? { warningsAcknowledged: true } : {}),
  }
}

export interface LocalRegistryLoad {
  readonly path: string
  readonly present: boolean
  readonly scenes: readonly LocalApprovedScene[]
  readonly errors: readonly string[]
}

/** Read and re-verify the registry. A changed digest is treated as no approval. */
export function loadLocalRegistry(env: NodeJS.ProcessEnv = process.env): LocalRegistryLoad {
  const path = localRegistryPath(env)
  if (!existsSync(path)) return { path, present: false, scenes: [], errors: [] }
  const errors: string[] = []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (parsed === null || typeof parsed !== 'object') return { path, present: true, scenes: [], errors: ['registry is not an object'] }
    const document = parsed as Record<string, unknown>
    if (document.version !== LOCAL_REGISTRY_VERSION || !Array.isArray(document.scenes)) {
      return { path, present: true, scenes: [], errors: ['unsupported registry version or missing scenes array'] }
    }
    const scenes: LocalApprovedScene[] = []
    for (const [index, entry] of document.scenes.entries()) {
      const normalized = normalizeLocalScene(entry)
      if (normalized === null) { errors.push(`scene[${index}] failed digest/schema/visual verification`); continue }
      scenes.push(normalized)
    }
    return { path, present: true, scenes, errors }
  } catch (error) {
    return { path, present: true, scenes: [], errors: [`cannot read registry: ${(error as Error).message}`] }
  }
}

/** Code-reviewed catalog plus locally approved scenes, de-duplicated by digest. */
export function combinedApprovedScenes(env: NodeJS.ProcessEnv = process.env): readonly ApprovedScene[] {
  const local = loadLocalRegistry(env).scenes
  const seen = new Set<string>()
  const combined: ApprovedScene[] = []
  for (const entry of [...APPROVED_SCENES, ...local]) {
    const digest = entry.digest ?? digestScene(entry)
    const key = digest ?? sceneApprovalKey(entry.spec, entry.fallback)
    if (key === null || seen.has(key)) continue
    seen.add(key)
    combined.push(entry)
  }
  return combined
}

export function isApprovedAnywhere(spec: unknown, fallback: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const key = sceneApprovalKey(spec, fallback)
  if (key === null) return false
  for (const entry of combinedApprovedScenes(env)) {
    if (sceneApprovalKey(entry.spec, entry.fallback) === key) return true
  }
  return false
}

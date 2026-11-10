/**
 * Host-side approval checks and content digests.
 *
 * A scene may render only when the feature flag is on and its exact canonical
 * {spec, fallback} exists in the compiled code-reviewed catalog or the local
 * human-approved registry. Every candidate is still validated and visually
 * linted; approval never substitutes for safety validation.
 */
import { createHash } from 'node:crypto'
import { isApprovedScene, sceneApprovalKey } from './approved.js'
import { dynamicSceneRenderingEnabled } from './feature.js'
import { isApprovedAnywhere, loadLocalRegistry } from './local-registry.js'
import { validateSceneSpec } from './spec.js'
import { visualLintScene } from './visual-lint.js'
import type { VisualLintResult } from './visual-lint.js'
import type { SceneBlockContent } from './block.js'

export interface SceneGate {
  readonly valid: boolean
  readonly approved: boolean
  readonly enabled: boolean
  readonly digest: string | null
  readonly errors: readonly string[]
  readonly visual: VisualLintResult | null
}

/** SHA-256 of the canonical reviewed content; also recorded for audit output. */
export function sceneDigest(content: Pick<SceneBlockContent, 'spec' | 'fallback'>): string | null {
  const key = sceneApprovalKey(content.spec, content.fallback)
  return key === null ? null : createHash('sha256').update(key).digest('hex')
}

export function checkSceneGate(content: Pick<SceneBlockContent, 'spec' | 'fallback'>, enabled = dynamicSceneRenderingEnabled()): SceneGate {
  const validation = validateSceneSpec(content.spec)
  const visual = validation.ok ? visualLintScene(validation.spec) : null
  const approved = validation.ok && (isApprovedScene(content.spec, content.fallback) || isApprovedAnywhere(content.spec, content.fallback))
  const errors = validation.ok ? [] : validation.errors.map((entry) => `${entry.path}: ${entry.message}`)
  if (visual !== null && !visual.ok) errors.push(...visual.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => `${entry.code}: ${entry.message}`))
  return {
    valid: validation.ok,
    approved,
    enabled,
    digest: validation.ok ? sceneDigest(content) : null,
    errors,
    visual,
  }
}

/**
 * Called only from model-facing write tools. A disabled, unapproved or visually
 * invalid scene cannot enter a lesson. Existing stored scenes remain parseable
 * and render as their fallback when the flag is off.
 */
export function assertSceneWriteAllowed(content: Pick<SceneBlockContent, 'spec' | 'fallback'>, enabled = dynamicSceneRenderingEnabled()): void {
  if (!enabled) throw new Error('dynamic-scenes-disabled: set DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES=1 to write or render dynamic scenes')
  const gate = checkSceneGate(content, enabled)
  if (!gate.valid) throw new Error(`scene-invalid: ${gate.errors.slice(0, 5).join(' | ')}`)
  if (!gate.approved) throw new Error('scene-not-approved: this exact SceneSpec + fallback is not in the code-reviewed or locally human-approved registry; a valid spec is not automatically approved')
  if (gate.visual !== null && !gate.visual.ok) throw new Error(`scene-visual-invalid: ${gate.visual.diagnostics.filter((entry) => entry.severity === 'error').slice(0, 5).map((entry) => `${entry.code}: ${entry.message}`).join(' | ')}`)
}

/** Audit-friendly registry status for diagnostics and the review CLI. */
export function localRegistryStatus(env: NodeJS.ProcessEnv = process.env): { path: string; present: boolean; count: number; errors: readonly string[] } {
  const loaded = loadLocalRegistry(env)
  return { path: loaded.path, present: loaded.present, count: loaded.scenes.length, errors: loaded.errors }
}

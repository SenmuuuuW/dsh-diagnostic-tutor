/**
 * Host-side approval checks and content digests.
 *
 * Approval is code-reviewed: the digest is computed from canonical
 * {fallback, spec} after validation, and the compiled registry is the only
 * source of approved keys. A block cannot self-approve.
 */
import { createHash } from 'node:crypto'
import { isApprovedScene, sceneApprovalKey } from './approved.js'
import { dynamicSceneRenderingEnabled } from './feature.js'
import { validateSceneSpec } from './spec.js'
import type { SceneBlockContent } from './block.js'

export interface SceneGate {
  readonly valid: boolean
  readonly approved: boolean
  readonly enabled: boolean
  readonly digest: string | null
  readonly errors: readonly string[]
}

/** SHA-256 of the canonical reviewed content; also recorded for audit output. */
export function sceneDigest(content: Pick<SceneBlockContent, 'spec' | 'fallback'>): string | null {
  const key = sceneApprovalKey(content.spec, content.fallback)
  return key === null ? null : createHash('sha256').update(key).digest('hex')
}

export function checkSceneGate(content: Pick<SceneBlockContent, 'spec' | 'fallback'>, enabled = dynamicSceneRenderingEnabled()): SceneGate {
  const validation = validateSceneSpec(content.spec)
  const approved = validation.ok && isApprovedScene(content.spec, content.fallback)
  return {
    valid: validation.ok,
    approved,
    enabled,
    digest: validation.ok ? sceneDigest(content) : null,
    errors: validation.ok ? [] : validation.errors.map((entry) => `${entry.path}: ${entry.message}`),
  }
}

/**
 * Called only from model-facing write tools. A disabled or unapproved scene
 * cannot enter a lesson through the tool boundary; old stored scenes remain
 * parseable and render as their fallback when the flag is off.
 */
export function assertSceneWriteAllowed(content: Pick<SceneBlockContent, 'spec' | 'fallback'>, enabled = dynamicSceneRenderingEnabled()): void {
  if (!enabled) throw new Error('dynamic-scenes-disabled: set DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES=1 to write or render dynamic scenes')
  const gate = checkSceneGate(content, enabled)
  if (!gate.valid) throw new Error(`scene-invalid: ${gate.errors.slice(0, 5).join(' | ')}`)
  if (!gate.approved) throw new Error('scene-not-approved: this exact SceneSpec + fallback is not in the code-reviewed approved registry; a valid spec is not automatically approved')
}

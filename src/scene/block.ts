/** Production `scene` block content envelope. */
import { z } from 'zod'
import { validateSceneSpec } from './spec.js'

export const MAX_SCENE_SPEC_CHARS = 131_072
export const MAX_SCENE_FALLBACK_CHARS = 2_000

export const SceneBlockContentSchema = z.object({
  /** Version of the runtime scene interpretation contract. */
  sceneVersion: z.literal('1'),
  /** Validated declarative SceneSpec; the concrete shape is checked by the runtime. */
  spec: z.unknown(),
  /** Required static explanation shown when rendering is disabled or unavailable. */
  fallback: z.string().min(1).max(MAX_SCENE_FALLBACK_CHARS),
}).strict().superRefine((content, ctx) => {
  let encoded: string
  try { encoded = JSON.stringify(content.spec) } catch { ctx.addIssue({ code: 'custom', path: ['spec'], message: 'SceneSpec must be JSON-serializable' }); return }
  if (encoded.length > MAX_SCENE_SPEC_CHARS) { ctx.addIssue({ code: 'custom', path: ['spec'], message: `SceneSpec exceeds ${MAX_SCENE_SPEC_CHARS} characters` }); return }
  const result = validateSceneSpec(content.spec)
  if (!result.ok) {
    for (const error of result.errors.slice(0, 12)) ctx.addIssue({ code: 'custom', path: ['spec'], message: `${error.path}: ${error.message}` })
  }
})

export type SceneBlockContent = z.infer<typeof SceneBlockContentSchema>

/**
 * Production scene feature flag.
 *
 * Rendering is opt-in and default-off. AI generation has no production flag:
 * it is a research pipeline and no model tool can enable it.
 */
export const DYNAMIC_SCENES_ENV = 'DSH_DIAGNOSTIC_TUTOR_DYNAMIC_SCENES'

export function dynamicSceneRenderingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DYNAMIC_SCENES_ENV] === '1' || env[DYNAMIC_SCENES_ENV] === 'true'
}

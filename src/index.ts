/**
 * dsh-diagnostic-tutor — DeepSeek Harness plugin entry point.
 *
 * A DSH plugin is a module exporting `apply(ctx, config)`. Cordis calls it at
 * load time and everything registered through `ctx` is disposed automatically
 * on unload.
 *
 * ---------------------------------------------------------------------------
 * v0.0.1 scope (deliberate, see docs/planning/PLAN.md §7)
 * ---------------------------------------------------------------------------
 * This version proves exactly one thing: that the repository is a real,
 * installable DSH bundle and that `apply` runs inside a real harness.
 *
 * NOT here yet, on purpose:
 *   - no `inject`            -> added in v0.0.2 with the storage domain
 *   - no tools               -> v0.0.2
 *   - no client half         -> v0.0.4 (`dsh.client` + `exports["./client"]`)
 *   - no roadmap / lesson    -> v0.0.3 / v0.0.4
 *
 * ---------------------------------------------------------------------------
 * Cross-version discipline (non-negotiable, see PLAN.md 2.12 #9 / #16)
 * ---------------------------------------------------------------------------
 * A typical machine has THREE harness cohorts resolvable at once (the running
 * host, the shared profile fallback, and each plugin's own store). Therefore:
 *
 *   1. never `export default` — Cordis' `unwrapExports` prefers `.default` and
 *      would silently DROP `inject` (documented in
 *      docs/postmortem/0001-acp-default-export-drops-inject.md). Always use
 *      named exports.
 *   2. `@deepseek-ai/*` imports are TYPE-ONLY (`import type`), so the compiler
 *      erases them and no second runtime copy is ever resolved.
 *      `verbatimModuleSyntax` in tsconfig.json enforces this mechanically.
 *   3. never `instanceof` a class imported from `@deepseek-ai/*`; take runtime
 *      objects from `ctx` instead. A cross-cohort copy makes `instanceof`
 *      silently false.
 */

import type { Context } from '@deepseek-ai/cordis'

/**
 * Plugin module name. Stable kebab-case, distinct from the npm package name
 * (`dsh-diagnostic-tutor`) and equal to the loader row `id` in
 * cordis.patch.yml, following the convention in the community naming profile.
 */
export const name = 'diagnostic-tutor'

/**
 * Load the plugin.
 *
 * `ctx.logger` is a built-in member of the Cordis `Context` class (not an
 * injected service), so it is always safe to use here without declaring
 * `inject`. Plugin code is deliberately not sandboxed by DSH, so this plugin
 * writes to the harness log rather than stdout.
 *
 * @param ctx - the Cordis context the loader hands to this plugin.
 */
export function apply(ctx: Context): void {
  ctx.logger.info('[diagnostic-tutor] plugin loaded')
}

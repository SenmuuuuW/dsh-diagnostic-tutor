/**
 * dsh-diagnostic-tutor — DeepSeek Harness plugin entry point.
 *
 * A DSH plugin is a module exporting `apply(ctx, config)`. Cordis calls it at
 * load time and everything registered through `ctx` is disposed automatically
 * on unload.
 *
 * ---------------------------------------------------------------------------
 * v0.0.2 scope (see docs/planning/PLAN.md §7)
 * ---------------------------------------------------------------------------
 * Proves the persistence and tool seams end to end: the plugin opens a storage
 * domain, initializes learner state on first run, registers a model-callable
 * tool, and releases everything on unload.
 *
 * Still deliberately absent:
 *   - no UDT skill detection  -> v0.0.3
 *   - no client half / UI     -> v0.0.4
 *   - no roadmap or lesson    -> v0.0.3 / v0.0.4
 *
 * ---------------------------------------------------------------------------
 * Cross-version discipline (see PLAN.md 2.12 #9 / #16)
 * ---------------------------------------------------------------------------
 * Three harness cohorts can be resolvable at once (the running host, the
 * shared profile fallback, and this package's own store). Therefore:
 *
 *   1. never `export default` — Cordis' `unwrapExports` prefers `.default` and
 *      would silently DROP `inject`, so only named exports appear here.
 *   2. every *type* coming from `@deepseek-ai/*` is imported with `import type`
 *      (enforced by `verbatimModuleSyntax`), so no second runtime copy is
 *      resolved for anything that merely describes a shape.
 *   3. services and instances — `tools`, `storageDomain`, the opened `Domain` —
 *      are always taken from `ctx` via `ctx.get(...)`, never constructed and
 *      never `instanceof`-checked. A cross-cohort copy would make such a check
 *      silently false.
 *
 * Pure *builder* helpers (`defineTool`, `defineDomain`, `domainTable`) are the
 * one documented exception: they take plain data and return plain data, so
 * they are imported as values. See the header of `state.ts`.
 */

import type { Context } from '@deepseek-ai/cordis'

import { openUdState } from './state.js'
import { registerTools } from './tools.js'

/**
 * Plugin module name. Stable kebab-case, equal to the loader row `id` in
 * cordis.patch.yml and distinct from the npm package name.
 */
export const name = 'diagnostic-tutor'

/**
 * Services this plugin requires before it may load.
 *
 * Only services the standard profiles guarantee are declared here. Anything
 * optional or environment-specific is resolved lazily with `ctx.get(...)` so a
 * missing one degrades the plugin instead of leaving the whole plugin tree
 * pending — a pending plugin prints nothing at all, which is hard to diagnose.
 */
export const inject = ['tools', 'storageDomain']

/**
 * Load the plugin.
 *
 * `apply` is async, and Cordis keeps the fiber in `LOADING` until the returned
 * promise settles — so `await ctx.plugin(...)` genuinely waits for the storage
 * domain to be open, for first-run initialization to be durable, and for the
 * tools to be registered. That determinism is why the work happens here rather
 * than in a delayed `ctx.inject(...)` callback: a nested `inject` returns its
 * own fiber, so the outer fiber would report ACTIVE while the domain was still
 * opening and a caller could not tell the difference.
 *
 * The outer `inject` already guarantees both services exist. They are still
 * resolved through `ctx.get(...)` and checked, so a genuinely missing seam
 * fails loudly instead of dying on an opaque proxy error.
 *
 * `ctx.logger` is a built-in member of the Cordis `Context` class (not an
 * injected service), so it is always safe to use here. The plugin writes to
 * the harness log rather than stdout.
 *
 * @param ctx - the Cordis context the loader hands to this plugin.
 */
export async function apply(ctx: Context): Promise<void> {
  ctx.logger.debug('[diagnostic-tutor] plugin loading')

  const tools = ctx.get('tools')
  const facility = ctx.get('storageDomain')
  if (!tools || !facility) {
    // Never degrade silently: a missing seam is a configuration error.
    ctx.logger.error(
      `[diagnostic-tutor] missing required service(s):${tools ? '' : ' tools'}${facility ? '' : ' storageDomain'}`,
    )
    return
  }

  const state = await openUdState(facility)
  // Unloading must leave no residue: this disposer closes the domain (which
  // rejects new writes, drains queued ones, and releases the backend unit) and
  // Cordis awaits the returned promise before the plugin counts as unloaded.
  ctx.effect(() => () => state.close())

  // First run writes the learner record; later runs leave it untouched.
  await state.ensureLearner(new Date().toISOString())

  registerTools({ tools }, state)
  ctx.logger.debug(
    `[diagnostic-tutor] ready — domain "${state.name}" v${state.version}, udt_status registered`,
  )
}

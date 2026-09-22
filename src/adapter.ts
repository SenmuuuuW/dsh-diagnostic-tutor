/**
 * The temporary runtime adapter (v0.0.x).
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * The Universal Diagnostic Tutor skill's guardrails forbid turning mastery
 * tracking into "scores, databases, hidden memory, or a curriculum roadmap",
 * and state that "the card is user-carried data, not storage". This runtime
 * deliberately *does* persist learner state and *does* render a map.
 *
 * It is not a contradiction, but it is a genuine reinterpretation, and the
 * teaching brain deserves to be told which one is in force. So this module
 * contributes one short section to the system prompt explaining the runtime
 * semantics, and nothing else.
 *
 * It is explicitly a **v0.0.x bridge**. The plan is to resolve the tension
 * properly in the skill itself (a v2.1 "Runtime & Learning-Map Protocol") before
 * v0.1.0, at which point this section either shrinks to nothing or is absorbed
 * upstream. It exists so nothing is blocked on that change, not as the end
 * state.
 *
 * ---------------------------------------------------------------------------
 * What it must never become
 * ---------------------------------------------------------------------------
 * It carries **no teaching logic**. It does not say what to teach, how to
 * diagnose, when to advance, or how to explain anything — all of that is the
 * skill's, and duplicating any of it here would create the second teaching
 * brain this project exists to avoid. It is a note about *storage semantics*.
 *
 * It also names no file, version, repository or protocol, because the skill's
 * own no-leakage protocol forbids those words appearing in learner-facing text
 * and a system-prompt section is only ever a paraphrase away from one.
 */

import type { Context } from '@deepseek-ai/cordis'

/** Unique section name; a duplicate registration would throw. */
export const RUNTIME_SEMANTICS_SECTION = 'diagnostic-tutor-runtime-semantics'

/**
 * Section order.
 *
 * The named placements live in the platform's own `SECTION_ORDERS` table
 * (identity is negative, tool descriptions run 1000–3100, structured output and
 * personas occupy 9000+). 3200 puts this note immediately after the tool
 * descriptions and before the SDK/output sections, which is where a reader
 * benefits from it: right after the tools whose state it explains.
 */
export const RUNTIME_SEMANTICS_ORDER = 3200

/**
 * The contributed text.
 *
 * Five sentences, no names, no pedagogy. If this grows past a short paragraph
 * it has stopped being a semantics note and started being a second skill.
 */
export const RUNTIME_SEMANTICS_TEXT = `Learning runtime state is explicit and user-visible: a learning goal and a diagnosis map, stored locally and exportable by the learner on request. Treat stored state as evidence to be re-checked rather than settled truth — a node reads "confirmed" only because recorded evidence supported it, and a node without such evidence stays "unconfirmed". The map is diagnosis-driven and reversible: grow it as diagnosis reveals a prerequisite or a blocker, never as a pre-planned syllabus. It records no scores and no completion percentages.`

/**
 * Contribute the runtime-semantics section, if the profile has a system prompt.
 *
 * Resolved lazily through `ctx.get(...)` rather than declared in `inject`: a
 * profile without a system prompt should lose this note, not fail to load the
 * plugin. `SystemPrompt.section()` returns the Cordis effect disposer, so
 * calling it here ties the section to this plugin's fiber and it disappears on
 * unload with everything else.
 *
 * @param ctx - the plugin's context.
 * @returns whether the section was registered.
 */
export function installRuntimeAdapter(ctx: Context): boolean {
  const systemPrompt = ctx.get('systemPrompt')
  if (!systemPrompt) {
    ctx.logger.debug('[diagnostic-tutor] no system prompt in this profile; runtime adapter skipped')
    return false
  }

  systemPrompt.section({
    name: RUNTIME_SEMANTICS_SECTION,
    order: RUNTIME_SEMANTICS_ORDER,
    text: RUNTIME_SEMANTICS_TEXT,
  })
  return true
}

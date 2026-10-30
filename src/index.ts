/**
 * dsh-diagnostic-tutor — DeepSeek Harness plugin entry point.
 *
 * A DSH plugin is a module exporting `apply(ctx, config)`. Cordis calls it at
 * load time and everything registered through `ctx` is disposed automatically
 * on unload.
 *
 * ---------------------------------------------------------------------------
 * Scope in v0.2.0 (content/input/review loop on top of the published learning runtime)
 * ---------------------------------------------------------------------------
 * The runtime owns learner state and the surfaces that show it; it owns no
 * teaching decisions. What it registers:
 *
 *   - a goal → diagnosis map (courses, nodes, evidence) per project;
 *   - one learning focus, next step and handoff per conversation;
 *   - versioned course routes (goal brief, evidence-referenced assessment,
 *     immutable curriculum revisions, explicit learner acceptance);
 *   - session-scoped course runs: an attempt, teaching snapshots and the
 *     evidence that completion is allowed to cite;
 *   - the browser half: one "Learning map" main page, one "Current lesson"
 *     docked tab, and the HTTP routes both read through.
 *
 * Still deliberately absent: resource ingestion and RAG (out of scope), and
 * any rule that decides what to teach. The Universal Diagnostic Tutor skill is
 * the teaching brain; this plugin only records what it did.
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
 *   3. services and instances — `tools`, `storageDomain`, `skills`,
 *      `systemPrompt`, the opened `Domain` — are always taken from `ctx` via
 *      `ctx.get(...)`, never constructed and never `instanceof`-checked. A
 *      cross-cohort copy would make such a check silently false.
 *
 * Pure *builder* helpers (`defineTool`, `defineDomain`, `domainTable`) are the
 * one documented exception: they take plain data and return plain data, so
 * they are imported as values. See the header of `state.ts`.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'

import { API_PREFIX, registerApi } from './api.js'
import type { WebServerLike } from './api.js'
import { withActivity } from './handoff.js'
import { openJournal } from './journal.js'
import { stampPathRequestFailure } from './path-runtime.js'
import { packageVersion } from './version.js'
import { promptSession } from './prompt.js'
import { UDT_DOMAIN_NAME, openUdState } from './state.js'
import { registerTools } from './tools.js'
import { teachingBrainForSession } from './udt.js'

/**
 * Plugin module name. Stable kebab-case, equal to the loader row `id` in
 * cordis.patch.yml and distinct from the npm package name.
 */
export const name = 'diagnostic-tutor'

/**
 * Services this plugin requires before it may load.
 *
 * Only services the standard profiles guarantee are declared here — both come
 * from `@deepseek-ai/dsh-base`. Optional Agent and Skill services are resolved
 * on each availability request with `ctx.reflect.get(...)`, so a profile without
 * them reports inconclusive availability instead of leaving the whole plugin
 * tree pending. A pending plugin prints nothing at all, which is hard to diagnose.
 */
export const inject = ['tools', 'storageDomain']

/**
 * Load the plugin.
 *
 * `apply` is async, and Cordis keeps the fiber in `LOADING` until the returned
 * promise settles — so `await ctx.plugin(...)` genuinely waits for the storage
 * domain to be open, for first-run initialization to be durable, and for the
 * tools to be registered. A nested `ctx.inject(...)` would return its own
 * fiber, letting the outer fiber report ACTIVE while the domain was still
 * opening.
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

  // A storage failure must not take the whole plugin tree down with it. The
  // loader treats a rejection from `apply` as a fatal composition error, so an
  // unreadable, partial or version-mismatched store file would otherwise stop
  // every unrelated plugin in the profile from loading — and would do it
  // silently, because nothing is registered to report it. Degrade instead:
  // report the cause loudly, register nothing, and stay inert.
  //
  // First-run initialization is inside this guard on purpose. It is the first
  // *read* of the stored document, so it is where a partial file actually
  // throws — a domain can open successfully and still fail on the first record
  // that does not match its schema.
  let state
  try {
    state = await openUdState(facility)
    // First run writes the learner record; later runs leave it untouched.
    await state.ensureLearner(new Date().toISOString())
  } catch (error) {
    ctx.logger.error(
      `[diagnostic-tutor] could not open storage domain "${UDT_DOMAIN_NAME}": ${(error as Error).message}. ` +
        'The plugin is loaded but inert — no tools were registered. ' +
        'This usually means a stored document written by an incompatible version, or one edited by hand.',
    )
    return
  }

  // Unloading must leave no residue: this disposer closes the domain (which
  // rejects new writes, drains queued ones, and releases the backend unit) and
  // Cordis awaits the returned promise before the plugin counts as unloaded.
  ctx.effect(() => () => state.close())

  // Local, content-free monitoring. Disabled under the test runner and never
  // allowed to fail the runtime (all writes are best-effort).
  const journal = openJournal()

  // Mount the browser API if this profile has a web surface.
  //
  // Resolved eagerly first: a profile's web server is mounted by the base and
  // web-app bundles, which always precede a user bundle, so it is present by
  // the time this runs. The deferred `ctx.inject` is the fallback for the rare
  // case where the service arrives later — awaiting the outer fiber would not
  // wait for that nested fiber, so preferring the eager path also keeps the
  // load deterministic for callers and tests.
  const mountApi = (server: unknown): void => {
    if (!server) return
    ctx.effect(() =>
      registerApi(server as WebServerLike, {
        state,
        prompt: (sessionId, text) => {
          const result = promptSession(ctx, sessionId, text)
          journal.append('tutor.prompt', {
            sessionId: sessionId ?? null,
            prompted: result.prompted,
            ...(result.reason === undefined ? {} : { reason: result.reason.slice(0, 240) }),
          })
          return result
        },
        teachingBrain: (sessionId) => teachingBrainForSession(ctx, sessionId),
        journal,
        pluginVersion: packageVersion(),
        onEvent: (event, fields) => journal.append(event, fields),
      }),
    )
    ctx.logger.debug(`[diagnostic-tutor] browser API mounted at ${API_PREFIX}`)
  }
  const webServer = ctx.get('webServer')
  if (webServer) mountApi(webServer)
  else ctx.inject(['webServer'], (webCtx) => mountApi(webCtx.get('webServer')))

  // First sign of life from the tutor.
  //
  // The handoff records when the tutor was asked; this records when it actually
  // started, which is the difference between "waiting" and "nothing is
  // happening". Only the first event counts, and only from the session the
  // handoff asked in, so a busy conversation elsewhere cannot make a quiet
  // handoff look alive.
  // A prompted turn can fail after the request was accepted (a provider error,
  // for example). The browser snapshot that would show it is memory-only, so
  // stamp the durable request record here; the map page can then explain and
  // retry even after a restart.
  ctx.on('agent/error', ({ agent, error }) => {
    const reason = error instanceof Error ? error.message : String(error)
    journal.append('agent.error', { sessionId: String(agent.session.id), error: reason.slice(0, 240) })
    void stampPathRequestFailure(state, String(agent.session.id), reason).catch(() => {})
  })

  const toolCalls = new Map<string, { name: string; start: number }>()
  ctx.on('session/event', (session, event) => {
    const sessionId = String(session.id)
    // Tool metadata only: the name, the operation and the duration. Arguments
    // stay out of the journal, so no lesson or goal text is recorded.
    if (event.type === 'tool/call') {
      const data = event.data as { callId?: string; name?: string; arguments?: string }
      if (typeof data.name === 'string' && data.name.startsWith('udt_')) {
        let operation: string | undefined
        try {
          const parsed = JSON.parse(data.arguments ?? '') as { op?: unknown; action?: unknown }
          if (typeof parsed.op === 'string') operation = parsed.op
          else if (typeof parsed.action === 'string') operation = parsed.action
        } catch { /* the tool gets to explain its own arguments */ }
        journal.append('tool.call', { sessionId, tool: data.name, ...(operation === undefined ? {} : { op: operation }) })
        if (data.callId !== undefined) toolCalls.set(`${sessionId}:${data.callId}`, { name: data.name, start: Date.now() })
      }
    } else if (event.type === 'tool/result') {
      const message = (event.data as { message?: { toolCallId?: string } }).message
      const key = message?.toolCallId === undefined ? undefined : `${sessionId}:${message.toolCallId}`
      const tracked = key === undefined ? undefined : toolCalls.get(key)
      if (tracked !== undefined && key !== undefined) {
        toolCalls.delete(key)
        journal.append('tool.result', { sessionId, tool: tracked.name, durationMs: Math.max(0, Date.now() - tracked.start) })
      }
    }
    // The event says which conversation produced it, so the handoff is looked
    // up in that conversation rather than in the course at large. A busy
    // conversation elsewhere cannot make a quiet handoff look alive — and two
    // conversations working on the same target keep separate records.
    const handoff = state.activeHandoff(sessionId)
    if (handoff === undefined || handoff.status !== 'prompted') return
    void event
    // Atomic, and re-checked inside the transform: the lesson write races this
    // listener, and a plain read-modify-write here would clobber a handoff that
    // had already become ready.
    void state
      .updateHandoff(sessionId, handoff.targetNodeId, (current) =>
        current.status === 'prompted' ? withActivity(current, new Date().toISOString()) : current,
      )
      .catch(() => {})
  })

  const toolCount = registerTools({ tools }, state)
  journal.append('plugin.ready', { tools: toolCount, version: packageVersion() })
  ctx.logger.debug(
    `[diagnostic-tutor] ready — domain "${state.name}" v${state.version}, ${toolCount} tools registered`,
  )
}

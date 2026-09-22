/**
 * Waking the teaching brain.
 *
 * "Start learning" is a UI act, but teaching happens in the chat — so the panel
 * needs a way to tell the tutor that a node is now in focus. This module is
 * that hand-off: it composes one ordinary user-role turn from the plugin and
 * delivers it to the agent that owns the learner's session.
 *
 * Why a user-role message rather than injected context: `agent.inject()` adds
 * model-visible context but **does not wake an idle agent**, so nothing would
 * happen until the learner typed something. `followup()` opens a turn, which is
 * exactly the intent of pressing the button. `@deepseek-ai/dsh-command-goal`
 * and `dsh-headless` do the same thing for the same reason.
 *
 * The source is `{ kind: 'plugin', plugin: 'diagnostic-tutor' }`, so the turn is
 * attributable rather than forged as something the learner typed.
 *
 * Note what this module does **not** do: it does not decide what to teach. It
 * reports which node the learner selected and asks the tutor to begin. Every
 * teaching decision stays with the teaching brain.
 */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

import type { CourseRecord, NodeRecord } from './state.js'

/** Attribution for every turn this plugin opens. */
export const PLUGIN_SOURCE = 'diagnostic-tutor'

export interface FocusPromptResult {
  /** Whether a turn was actually opened. */
  readonly prompted: boolean
  /** Why not, when `prompted` is false. Surfaced to the panel, not to the learner as an error. */
  readonly reason?: string
}

/**
 * Compose the turn text.
 *
 * Written in the learner's voice, because it lands in the transcript they are
 * reading: it should look like the button they just pressed, not like a system
 * directive. It states the node and the expected shape of the reply, and stops
 * — the tool descriptions carry the detail about blocks and caps.
 *
 * @param course - the course being learned.
 * @param node - the node put in focus.
 * @returns the message text.
 */
export function focusPromptText(course: CourseRecord, node: NodeRecord): string {
  return (
    `Let's start on **${node.title}** (${node.relation} of ${course.title}).\n\n` +
    'Please teach me this node. Put the teaching itself in the Learning Surface beside the map, ' +
    'end with a check I can answer here in the chat, and stop there.'
  )
}

/**
 * Deliver one turn to the agent that owns a session.
 *
 * Never throws for a missing agent: the focus has already been recorded by the
 * time this runs, and the tutor can pick it up on the next turn regardless. A
 * graceful "not prompted" keeps the button useful in every configuration.
 *
 * @param ctx - the plugin's context.
 * @param sessionId - the session the panel is showing, when it knows one.
 * @param text - the turn text.
 * @returns whether a turn was opened, and why not when it was not.
 */
export function promptSession(ctx: Context, sessionId: string | undefined, text: string): FocusPromptResult {
  if (sessionId === undefined || sessionId.length === 0) {
    return { prompted: false, reason: 'the panel did not report a session' }
  }

  const agents = ctx.get('agents')
  if (!agents) {
    return { prompted: false, reason: 'this profile has no agent registry' }
  }

  // The requested session is the right target. DSH creates an agent lazily —
  // a brand-new session has none until something is said in it — so fall back
  // to the registry only when doing so is unambiguous, and never guess between
  // several conversations.
  let agent = agents.get(sessionId as never)
  if (!agent) {
    const live = agents.list()
    if (live.length === 1 && live[0] !== undefined) {
      agent = live[0]
    } else {
      return {
        prompted: false,
        reason:
          live.length === 0
            ? 'that session has no live agent yet — say anything in the chat and the tutor will pick the focus up'
            : `that session has no live agent, and ${live.length} other conversations are open`,
      }
    }
  }

  const target = agent
  target.followup(
    createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'plugin', plugin: PLUGIN_SOURCE },
    }),
  )
  return { prompted: true }
}

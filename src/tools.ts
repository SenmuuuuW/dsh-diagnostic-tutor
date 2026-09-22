/**
 * Model-facing tools.
 *
 * v0.0.2 registers exactly one tool, `udt_status`. Its job is narrow and
 * deliberate: prove that a plugin can register a tool the model can actually
 * call, and let the model (and a developer) see whether the persistence layer
 * is live. It reads state and reports; it decides nothing.
 *
 * That restraint is the architecture, not a placeholder. Teaching decisions
 * belong to the Universal Diagnostic Tutor skill; this plugin owns state,
 * artifacts and presentation. Every future tool here follows the same rule:
 * read or write state, never choose what to teach. See PLAN.md §3.4.
 *
 * As in `state.ts`, `defineTool` is a *pure builder* (it compiles the
 * parameter DSL into JSON Schema and returns a plain descriptor), so it is
 * value-imported. The registry itself is taken from `ctx`.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import type { UdState } from './state.js'

/**
 * The slice of `ctx` this module needs.
 *
 * Declared structurally on purpose: we depend on the *shape* of the tools
 * registry, not on a class we might `instanceof` across harness cohorts.
 */
export interface ToolsHost {
  tools: { register(definition: ToolDefinition): unknown }
}

/** Canonical value returned by `udt_status`; must match its output schema. */
interface StatusValue {
  domain: string
  version: number
  initialized: boolean
  courseCount: number
  courses: { id: string; title: string; status: string }[]
  preferredLanguage?: string
  mode?: string
  activeCourseId?: string
}

/**
 * Project the state snapshot onto the tool's canonical output.
 *
 * Optional fields are omitted rather than set to `undefined`: the value must
 * be lossless JSON, and an explicit `undefined` is not.
 *
 * @param state - the open persistence handle.
 * @returns the canonical value declared by the tool's output schema.
 */
function statusValue(state: UdState): StatusValue {
  const snapshot = state.snapshot()
  const value: StatusValue = {
    domain: snapshot.domain,
    version: snapshot.version,
    initialized: snapshot.initialized,
    courseCount: snapshot.courseCount,
    courses: snapshot.courses.map((course) => ({ ...course })),
  }
  const { preferredLanguage, mode, activeCourseId } = snapshot.learner
  if (preferredLanguage !== undefined) value.preferredLanguage = preferredLanguage
  if (mode !== undefined) value.mode = mode
  if (activeCourseId !== undefined) value.activeCourseId = activeCourseId
  return value
}

function udtStatusTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_status',
    description:
      'Report the state of the Universal Diagnostic Tutor learning runtime: the storage domain in use, ' +
      'whether learner state has been initialized, the learner profile, and the registered learning goals. ' +
      'Call this before starting a session to see whether a learner has existing state to continue from, ' +
      'and after changing state to confirm what was stored. Read-only: it records no teaching decision.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          domain: { type: 'string', required: true, description: 'Storage domain name.' },
          version: { type: 'integer', required: true, description: 'Domain schema version.' },
          initialized: {
            type: 'boolean',
            required: true,
            description: 'Whether learner state has ever been written. False means a first run.',
          },
          courseCount: { type: 'integer', required: true },
          courses: {
            type: 'array',
            required: true,
            description: 'Registered learning goals.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                status: { type: 'string', required: true, description: 'active | paused | archived' },
              },
            },
          },
          preferredLanguage: { type: 'string', description: 'Learner preference, when recorded.' },
          mode: {
            type: 'string',
            description: 'Teaching mode preference: auto | zero-base | standard | advanced.',
          },
          activeCourseId: { type: 'string', description: 'The learning goal currently in focus.' },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Learning runtime: domain "${value.domain}" v${value.version}, ${value.courseCount} goal(s), ${
            value.initialized ? 'learner state present' : 'first run (no learner state yet)'
          }.`,
        },
      ],
    },
    execute: () => Promise.resolve(statusValue(state)),
    presentCall: () => ({
      card: 'generic',
      title: 'Read learning-runtime status',
      kind: 'other',
      rawInput: {},
    }),
  })
}

/**
 * Register this plugin's tools on the host's registry.
 *
 * @param host - the context slice carrying the tools registry.
 * @param state - the open persistence handle the tools read from.
 */
export function registerTools(host: ToolsHost, state: UdState): void {
  host.tools.register(udtStatusTool(state))
}

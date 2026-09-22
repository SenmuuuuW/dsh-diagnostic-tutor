/**
 * Model-facing tools.
 *
 * v0.0.3 registers four, and the restraint is the architecture: this plugin
 * owns **state, artifacts and presentation**, while every teaching decision
 * belongs to the Universal Diagnostic Tutor skill. So each tool here either
 * records what was observed or reports what is stored. None of them decides
 * what to teach, how to explain it, or when to advance.
 *
 * That is also why the rules in `diagnosis.ts` are enforced *here* rather than
 * negotiated with the caller: the runtime's job is to make unverified mastery
 * and curriculum dumps impossible to store, and then get out of the way.
 *
 * As in `state.ts`, `defineTool` is a *pure builder* (it compiles the parameter
 * DSL into JSON Schema and returns a plain descriptor), so it is
 * value-imported. The registry itself is taken from `ctx`.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { MAX_NODES_PER_UPDATE, acceptNewNodes, recordEvidence, setNodeState } from './diagnosis.js'
import type { Violation } from './diagnosis.js'
import {
  BLOCK_SCHEMAS,
  BlockSchema,
  LESSON_ORIGINS,
  MAX_BLOCKS_PER_LESSON,
  MAX_BLOCKS_PER_UPDATE,
  LessonSchema,
} from './lesson.js'
import type { Block, LessonRecord } from './lesson.js'
import { newNode } from './state.js'
import type { Evidence, NodeRecord, UdState } from './state.js'
import {
  EVIDENCE_KINDS,
  NODE_RELATIONS,
  NODE_STATES,
  READINESS_OUTCOMES,
} from './vocabulary.js'
import type { EvidenceKind, NodeRelation, NodeState, Readiness } from './vocabulary.js'

/**
 * The slice of `ctx` this module needs.
 *
 * Declared structurally on purpose: we depend on the *shape* of the tools
 * registry, not on a class we might `instanceof` across harness cohorts.
 */
export interface ToolsHost {
  tools: { register(definition: ToolDefinition): unknown }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Turn a human title into a stable, readable id fragment.
 *
 * Unicode-aware on purpose. An ASCII-only slug silently destroyed every
 * non-Latin title: "机器学习入门" collapsed to the fallback, and "ML / 机器学习"
 * lost the Chinese half entirely — so a learner working in Chinese got ids
 * like `node:goal`. Keeping letters and digits from any script means the id
 * still reads like the thing it names. Storage keys are plain strings, so a
 * non-ASCII id is fine on the medium.
 */
function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  // Slice by code point so a surrogate pair is never cut in half.
  const capped = [...slug].slice(0, 40).join('').replace(/-+$/g, '')
  // Titles made only of punctuation or emoji still need a usable id.
  return capped.length > 0 ? capped : 'node'
}

/** Allocate an id that does not collide with `taken`. */
function allocateId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  throw new Error(`could not allocate a unique id for "${base}"`)
}

/** ISO timestamp; single place so tests can reason about formatting. */
function nowIso(): string {
  return new Date().toISOString()
}

/** Render rule violations as a message the calling model can act on. */
function violationMessage(violations: readonly Violation[]): string {
  return violations.map((entry) => `${entry.code}: ${entry.message}`).join(' | ')
}

/** Resolve the course a call refers to, defaulting to the learner's active goal. */
function resolveCourseId(state: UdState, requested: string | undefined): string {
  const courseId = requested ?? state.readLearner().activeCourseId
  if (!courseId) {
    throw new Error(
      'no course given and the learner has no active goal; call udt_goal_create first or pass courseId',
    )
  }
  if (!state.readCourse(courseId)) throw new Error(`no course "${courseId}"`)
  return courseId
}

/* -------------------------------------------------------------------------- */
/* udt_status                                                                 */
/* -------------------------------------------------------------------------- */

/** Canonical value returned by `udt_status`; must match its output schema. */
interface StatusValue {
  domain: string
  version: number
  initialized: boolean
  courseCount: number
  nodeCount: number
  courses: { id: string; title: string; status: string }[]
  preferredLanguage?: string
  mode?: string
  activeCourseId?: string
  focus?: {
    courseId: string
    nodeId: string
    nodeTitle: string
    nodeState: string
    startedAt: string
  }
}

/**
 * Project the state snapshot onto the tool's canonical output.
 *
 * Optional fields are omitted rather than set to `undefined`: the value must
 * be lossless JSON, and an explicit `undefined` is not.
 *
 * Note what is absent: nothing about the detected teaching brain. Skill
 * location and version are internal diagnostics and must not become text a
 * model can echo back to a learner.
 */
function statusValue(state: UdState): StatusValue {
  const snapshot = state.snapshot()
  const value: StatusValue = {
    domain: snapshot.domain,
    version: snapshot.version,
    initialized: snapshot.initialized,
    courseCount: snapshot.courseCount,
    nodeCount: snapshot.nodeCount,
    courses: snapshot.courses.map((course) => ({ ...course })),
  }
  const { preferredLanguage, mode, activeCourseId } = snapshot.learner
  if (preferredLanguage !== undefined) value.preferredLanguage = preferredLanguage
  if (mode !== undefined) value.mode = mode
  if (activeCourseId !== undefined) value.activeCourseId = activeCourseId

  // The focus is how the tutor learns which node the learner asked to work on.
  // It is reported here rather than in a tool of its own: it is one fact about
  // the runtime, not a separate concern.
  const focused = state.activeFocus()
  if (focused !== undefined) {
    value.focus = {
      courseId: focused.course.id,
      nodeId: focused.node.id,
      nodeTitle: focused.node.title,
      nodeState: focused.node.state,
      startedAt: focused.focus.startedAt,
    }
  }
  return value
}

function udtStatusTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_status',
    description:
      'Report the state of the learning runtime: the storage domain in use, whether learner state has been ' +
      'initialized, the learner profile, the registered learning goals and how many diagnosis-map nodes exist. ' +
      'Call this before starting a session to see whether there is existing state to continue from, and after ' +
      'changing state to confirm what was stored. Read-only: it records no teaching decision.',
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
          nodeCount: { type: 'integer', required: true, description: 'Diagnosis-map nodes across all goals.' },
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
          focus: {
            type: 'object',
            additionalProperties: false,
            description:
              'The node the learner pressed Start learning on, when there is one. Read this to know what to teach.',
            properties: {
              courseId: { type: 'string', required: true },
              nodeId: { type: 'string', required: true },
              nodeTitle: { type: 'string', required: true },
              nodeState: { type: 'string', required: true },
              startedAt: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Learning runtime: domain "${value.domain}" v${value.version}, ${value.courseCount} goal(s), ${value.nodeCount} map node(s), ${
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

/* -------------------------------------------------------------------------- */
/* udt_goal_create                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Create a learning goal.
 *
 * Deliberately does **not** generate any material: it records the goal in the
 * learner's own words and plants the single root node of the map. Everything
 * else appears later, one diagnosis at a time.
 *
 * Creating a goal also focuses it, pausing whichever goal was previously
 * active. Pausing is reversible and never touches the other goal's map.
 */
function udtGoalCreateTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_goal_create',
    description:
      'Record a learning goal and start its diagnosis map. ' +
      'Put the learner\'s own words in `goal`; use `title` for a short label. ' +
      'This creates ONLY the goal and the single root node of the map — it never generates a course outline, ' +
      'syllabus or list of topics. Further nodes are added later, one at a time, as diagnosis reveals ' +
      'prerequisites or blockers (see udt_map_update). ' +
      'Creating a goal focuses it and pauses any previously active goal.',
    parameters: {
      title: {
        type: 'string',
        required: true,
        description: 'Short label for the goal, e.g. "Machine Learning".',
      },
      goal: {
        type: 'string',
        required: true,
        description: 'The learning goal in the learner\'s own words.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseId: { type: 'string', required: true, description: 'Use this as courseId in later calls.' },
          title: { type: 'string', required: true },
          goal: { type: 'string', required: true },
          status: { type: 'string', required: true },
          createdAt: { type: 'string', required: true },
          goalNodeId: { type: 'string', required: true, description: 'Root node of the diagnosis map.' },
          pausedCourseIds: {
            type: 'array',
            required: true,
            description: 'Goals that were active and are now paused.',
            items: { type: 'string' },
          },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Goal recorded: "${value.title}" (${value.courseId}). Map starts with its root node only.`,
        },
      ],
    },
    execute: async (args) => {
      const { title, goal } = args as { title: string; goal: string }
      const now = nowIso()

      const taken = new Set(state.listCourses().map((course) => course.id))
      const courseId = allocateId(slugify(title), taken)

      const previouslyActive = state
        .listCourses()
        .filter((course) => course.status === 'active' && course.id !== courseId)
        .map((course) => course.id)

      await state.writeCourse({
        id: courseId,
        title,
        goal,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      // Focus it (this pauses the others) and point the learner at it.
      await state.activateCourse(courseId, now)

      const goalNode = newNode({
        id: `${courseId}:goal`,
        courseId,
        title,
        relation: 'goal',
        // The goal node carries the learner's statement as evidence, yet stays
        // `unconfirmed`: a goal is the frame of the map, not a mastery claim.
        evidence: [{ kind: 'goal-stated', at: now, note: goal }],
        now,
      })
      await state.writeNode(goalNode)

      return {
        courseId,
        title,
        goal,
        status: 'active',
        createdAt: now,
        goalNodeId: goalNode.id,
        pausedCourseIds: previouslyActive,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Record goal: ${(args as { title?: string }).title ?? ''}`,
      kind: 'other',
      rawInput: args,
    }),
  })
}

/* -------------------------------------------------------------------------- */
/* udt_map_get                                                                */
/* -------------------------------------------------------------------------- */

function udtMapGetTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_map_get',
    description:
      'Read the diagnosis map of one learning goal: every node with its relation, its state and the evidence ' +
      'recorded against it. Use this to decide the next diagnostic step. ' +
      'A node state is one of: unconfirmed (no evidence yet), explained, practiced, checked, weak, blocked, ' +
      'confirmed. Nothing here is a progress percentage or a score. ' +
      'Omit courseId to read the learner\'s active goal.',
    parameters: {
      courseId: { type: 'string', description: 'Goal to read; defaults to the active goal.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          goal: { type: 'string', required: true },
          status: { type: 'string', required: true },
          nodes: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                title: { type: 'string', required: true },
                relation: {
                  type: 'string',
                  required: true,
                  description: 'goal | part-of | prerequisite | related',
                },
                state: { type: 'string', required: true },
                parentId: { type: 'string' },
                evidence: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      kind: { type: 'string', required: true },
                      at: { type: 'string', required: true },
                      note: { type: 'string' },
                      readiness: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Map for "${value.title}": ${value.nodes.length} node(s) — ${value.nodes
            .map((node) => `${node.title} [${node.state}]`)
            .join(', ')}`,
        },
      ],
    },
    execute: (args) => {
      const courseId = resolveCourseId(state, (args as { courseId?: string }).courseId)
      const map = state.readMap(courseId)
      if (!map) throw new Error(`no course "${courseId}"`)

      return Promise.resolve({
        courseId: map.course.id,
        title: map.course.title,
        goal: map.course.goal,
        status: map.course.status,
        nodes: map.nodes.map((node) => ({
          id: node.id,
          title: node.title,
          relation: node.relation,
          state: node.state,
          ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
          evidence: node.evidence.map((entry) => ({
            kind: entry.kind,
            at: entry.at,
            ...(entry.note === undefined ? {} : { note: entry.note }),
            ...(entry.readiness === undefined ? {} : { readiness: entry.readiness }),
          })),
        })),
      })
    },
    presentCall: () => ({ card: 'generic', title: 'Read diagnosis map', kind: 'other', rawInput: {} }),
  })
}

/* -------------------------------------------------------------------------- */
/* udt_map_update                                                             */
/* -------------------------------------------------------------------------- */

/** The three write operations, kept explicit so each has one meaning. */
const MAP_OPS = ['add-nodes', 'set-state', 'add-evidence'] as const

function udtMapUpdateTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_map_update',
    description:
      'Grow or annotate the diagnosis map. Pick ONE `op`:\n' +
      '• "add-nodes" — add nodes that diagnosis has actually revealed. Every node needs `parentId` pointing at ' +
      'an existing node (or omit it only for a course goal). Give `title` and `relation` ' +
      '(part-of | prerequisite | related | goal). Nodes are born "unconfirmed" unless you pass `state`.\n' +
      '• "set-state" — move one node to a new state. "confirmed" is REFUSED unless the node already carries a ' +
      'check or transfer evidence entry; explanation or practice alone never confirms.\n' +
      '• "add-evidence" — append one observation to a node. Record what happened, not how good it was.\n' +
      'A single call may add at most 8 nodes and a map holds at most 40. Never use this to plant a whole ' +
      'syllabus: add only what the current diagnosis justifies.',
    parameters: {
      courseId: { type: 'string', description: 'Goal to update; defaults to the active goal.' },
      op: {
        type: 'string',
        required: true,
        enum: [...MAP_OPS],
        description: 'add-nodes | set-state | add-evidence',
      },
      nodes: {
        type: 'array',
        description: 'For op=add-nodes: the nodes to add.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', required: true },
            relation: { type: 'string', required: true, enum: [...NODE_RELATIONS] },
            parentId: { type: 'string' },
            state: { type: 'string', enum: [...NODE_STATES] },
          },
        },
      },
      nodeId: { type: 'string', description: 'For op=set-state / add-evidence: the target node.' },
      state: { type: 'string', enum: [...NODE_STATES], description: 'For op=set-state: the new state.' },
      evidenceKind: {
        type: 'string',
        enum: [...EVIDENCE_KINDS],
        description: 'For op=add-evidence: what kind of observation this is.',
      },
      evidenceNote: { type: 'string', description: 'For op=add-evidence: short note in the learner\'s terms.' },
      readiness: {
        type: 'string',
        enum: [...READINESS_OUTCOMES],
        description: 'For op=add-evidence: the readiness outcome, when the observation supports one.',
      },
      at: { type: 'string', description: 'ISO timestamp; defaults to now.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          courseId: { type: 'string', required: true },
          op: { type: 'string', required: true },
          addedNodeIds: {
            type: 'array',
            required: true,
            description: 'Ids of nodes added by this call (empty for other ops).',
            items: { type: 'string' },
          },
          nodeId: { type: 'string', description: 'Node touched by set-state / add-evidence.' },
          state: { type: 'string', description: 'The node\'s state after this call.' },
          evidenceCount: { type: 'integer', description: 'Evidence entries on the node after this call.' },
          nodeCount: { type: 'integer', required: true, description: 'Total nodes in the course after this call.' },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            value.op === 'add-nodes'
              ? `Added ${value.addedNodeIds.length} node(s); the map now has ${value.nodeCount}.`
              : `Node ${value.nodeId ?? ''} is now "${value.state ?? ''}" with ${value.evidenceCount ?? 0} evidence entr(ies).`,
        },
      ],
    },
    execute: async (args) => {
      const input = args as {
        courseId?: string
        op: (typeof MAP_OPS)[number]
        nodes?: { title: string; relation: NodeRelation; parentId?: string; state?: NodeState }[]
        nodeId?: string
        state?: NodeState
        evidenceKind?: EvidenceKind
        evidenceNote?: string
        readiness?: Readiness
        at?: string
      }
      const courseId = resolveCourseId(state, input.courseId)
      const now = input.at ?? nowIso()
      const existing = state.listNodes(courseId)

      if (input.op === 'add-nodes') {
        const requested = input.nodes ?? []
        if (requested.length === 0) {
          throw new Error('op=add-nodes requires a non-empty `nodes` array')
        }
        if (requested.length > MAX_NODES_PER_UPDATE) {
          throw new Error(
            `at most ${MAX_NODES_PER_UPDATE} nodes may be added per call, received ${requested.length}`,
          )
        }

        // Ids are derived from titles and allocated against the whole course,
        // so a caller never has to invent one and cannot collide.
        const taken = new Set(existing.map((node) => node.id))
        const course = state.readCourse(courseId)
        if (!course) throw new Error(`no course "${courseId}"`)

        const structured: NodeRecord[] = requested.map((spec) => {
          const id = allocateId(`${courseId}:${slugify(spec.title)}`, taken)
          taken.add(id)
          const node = newNode({
            id,
            courseId,
            title: spec.title,
            relation: spec.relation,
            ...(spec.parentId === undefined ? {} : { parentId: spec.parentId }),
            ...(spec.state === undefined ? {} : { state: spec.state }),
            now,
          })
          return node
        })

        const accepted = acceptNewNodes(existing, structured)
        if (!accepted.ok) throw new Error(violationMessage(accepted.violations))

        for (const node of structured) await state.writeNode(node)

        return {
          courseId,
          op: input.op,
          addedNodeIds: structured.map((node) => node.id),
          nodeCount: existing.length + structured.length,
        }
      }

      // Both remaining ops target exactly one node.
      const nodeId = input.nodeId
      if (!nodeId) throw new Error(`op=${input.op} requires \`nodeId\``)
      const node = state.readNode(nodeId)
      if (!node) throw new Error(`no node "${nodeId}"`)
      if (node.courseId !== courseId) {
        throw new Error(`node "${nodeId}" belongs to course "${node.courseId}", not "${courseId}"`)
      }

      if (input.op === 'set-state') {
        if (!input.state) throw new Error('op=set-state requires `state`')
        // Same rule as every other write, so a bare assertion still cannot
        // promote a node to `confirmed`.
        const result = setNodeState(node, input.state, now)
        if (!result.ok) throw new Error(violationMessage(result.violations))
        const stored = await state.writeNode(result.node)
        return {
          courseId,
          op: input.op,
          addedNodeIds: [],
          nodeId: stored.id,
          state: stored.state,
          evidenceCount: stored.evidence.length,
          nodeCount: existing.length,
        }
      }

      // op === 'add-evidence'
      if (!input.evidenceKind) throw new Error('op=add-evidence requires `evidenceKind`')
      const evidence: Evidence = {
        kind: input.evidenceKind,
        at: now,
        ...(input.evidenceNote === undefined ? {} : { note: input.evidenceNote }),
        ...(input.readiness === undefined ? {} : { readiness: input.readiness }),
      }
      const result = recordEvidence(node, evidence, {
        now,
        ...(input.state === undefined ? {} : { state: input.state }),
      })
      if (!result.ok) throw new Error(violationMessage(result.violations))

      const stored = await state.writeNode(result.node)
      return {
        courseId,
        op: input.op,
        addedNodeIds: [],
        nodeId: stored.id,
        state: stored.state,
        evidenceCount: stored.evidence.length,
        nodeCount: existing.length,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Map update: ${(args as { op?: string }).op ?? ''}`,
      kind: 'other',
      rawInput: args,
    }),
  })
}


/* -------------------------------------------------------------------------- */
/* udt_lesson_update                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The block envelope, expressed precisely enough for the model to fill in.
 *
 * A `oneOf` over the four shapes rather than an open object: the model sees
 * exactly which `content` belongs to which `type`, and the registry rejects a
 * mismatched pair before `execute` ever runs. Zod validates the same shapes
 * again on the way in, with messages that name the offending block.
 */
const BLOCK_PARAM_SPEC = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['text'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: { md: { type: 'string', required: true, description: 'Markdown; math as \\(...\\) or \\[...\\].' } },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['example'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', required: true },
            steps: { type: 'array', required: true, items: { type: 'string' } },
            takeaway: { type: 'string' },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['diagram'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            format: { type: 'string', required: true, enum: ['ascii', 'mermaid'] },
            spec: { type: 'string', required: true },
            caption: { type: 'string' },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['check'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            prompt: { type: 'string', required: true },
            expect: { type: 'string', enum: ['reasoning', 'answer'] },
            hint: { type: 'string' },
          },
        },
      },
    },
  ],
} as const

/**
 * Write this turn's teaching into the learning surface.
 *
 * The tutor decides the content; the runtime decides what may be stored. That
 * split is why this tool validates hard and caps sizes: a lesson that arrives
 * malformed, oversized, or bound to a node that does not exist is refused with
 * a message naming the problem, and nothing is written.
 *
 * `append` is the default because teaching accumulates — a check is answered
 * and the next unit follows. `replace` exists for revising a unit that was
 * wrong, not for regenerating a course.
 */
function udtLessonUpdateTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_lesson_update',
    description:
      'Write teaching content into the learner\'s Learning Surface as structured blocks.\n' +
      'The blocks appear in the panel beside the diagnosis map, so the learner reads them while ' +
      'answering in the chat — write for that surface, not as a chat message.\n' +
      'Block types: **text** {md}, **example** {title, steps[], takeaway?}, ' +
      '**diagram** {format: ascii|mermaid, spec, caption?}, **check** {prompt, expect?, hint?}.\n' +
      `At most ${MAX_BLOCKS_PER_UPDATE} blocks per call and ${MAX_BLOCKS_PER_LESSON} per lesson; a teaching unit is a few ` +
      'blocks, not a chapter.\n' +
      'Default mode "append" adds to the current lesson; use "replace" only to correct what is there.\n' +
      'End a unit with a **check** block and then STOP — the learner answers in the chat, you judge it, ' +
      'record the outcome with udt_map_update, and only then write the next unit.',
    parameters: {
      nodeId: {
        type: 'string',
        description: 'Node to write for. Omit to use the learner\'s current focus (see udt_status).',
      },
      title: { type: 'string', description: 'Lesson title; defaults to the node title.' },
      mode: {
        type: 'string',
        enum: ['append', 'replace'],
        description: 'append (default) adds blocks; replace overwrites the lesson.',
      },
      blocks: {
        type: 'array',
        required: true,
        description: 'The blocks to write, in reading order.',
        items: BLOCK_PARAM_SPEC,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          lessonId: { type: 'string', required: true },
          nodeId: { type: 'string', required: true },
          courseId: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          blockCount: { type: 'integer', required: true, description: 'Blocks in the lesson after this call.' },
          addedCount: { type: 'integer', required: true },
          origin: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Learning surface updated: ${value.addedCount} block(s) ${value.mode === 'replace' ? 'replacing' : 'added to'} the lesson for "${value.nodeId}" (now ${value.blockCount}).`,
        },
      ],
    },
    execute: async (args) => {
      const input = args as {
        nodeId?: string
        title?: string
        mode?: 'append' | 'replace'
        blocks: unknown[]
      }
      const mode = input.mode ?? 'append'

      const focused = state.activeFocus()
      const courseId = focused?.course.id ?? state.readLearner().activeCourseId
      if (courseId === undefined) {
        throw new Error('no active course; record a goal and start learning on a node first')
      }
      const nodeId = input.nodeId ?? focused?.node.id
      if (nodeId === undefined) {
        throw new Error('no nodeId given and no learning focus is active; call udt_status to see the focus')
      }
      const node = state.readNode(nodeId)
      if (node === undefined) throw new Error(`no node "${nodeId}"`)
      if (node.courseId !== courseId) {
        throw new Error(`node "${nodeId}" belongs to course "${node.courseId}", not "${courseId}"`)
      }

      if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
        throw new Error('`blocks` must be a non-empty array')
      }
      if (input.blocks.length > MAX_BLOCKS_PER_UPDATE) {
        throw new Error(
          `at most ${MAX_BLOCKS_PER_UPDATE} blocks per call, received ${input.blocks.length}. ` +
            'Write one teaching unit, not a chapter.',
        )
      }

      // Strict, and it names the offending block: a model that sent one bad
      // block should not have to guess which.
      const parsed: Block[] = input.blocks.map((candidate, index) => {
        const result = BlockSchema.safeParse(candidate)
        if (!result.success) {
          const issue = result.error.issues[0]
          const where = issue === undefined ? '' : `${issue.path.join('.') || '(root)'}: ${issue.message}`
          throw new Error(`block[${index}] is not a valid block — ${where}`)
        }
        return result.data
      })

      const now = nowIso()
      const existing = state.lessonForNode(nodeId)
      const blocks = mode === 'replace' ? parsed : [...(existing?.blocks ?? []), ...parsed]

      if (blocks.length > MAX_BLOCKS_PER_LESSON) {
        throw new Error(
          `a lesson holds at most ${MAX_BLOCKS_PER_LESSON} blocks; this would make ${blocks.length}. ` +
            'Replace the lesson or start a new node.',
        )
      }

      const lesson: LessonRecord = LessonSchema.parse({
        id: existing?.id ?? `${nodeId}:lesson`,
        courseId,
        nodeId,
        title: input.title ?? existing?.title ?? node.title,
        blocks,
        // Real teaching, written by the tutor — never the v0.0.4 scaffold.
        origin: 'tutor',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      await state.writeLesson(lesson)

      return {
        lessonId: lesson.id,
        nodeId,
        courseId,
        mode,
        blockCount: lesson.blocks.length,
        addedCount: parsed.length,
        origin: lesson.origin,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Write ${(args as { blocks?: unknown[] }).blocks?.length ?? 0} learning block(s)`,
      kind: 'other',
      rawInput: args,
    }),
  })
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Register this plugin's tools on the host's registry.
 *
 * @param host - the context slice carrying the tools registry.
 * @param state - the open persistence handle the tools read from and write to.
 */
export function registerTools(host: ToolsHost, state: UdState): void {
  host.tools.register(udtStatusTool(state))
  host.tools.register(udtGoalCreateTool(state))
  host.tools.register(udtMapGetTool(state))
  host.tools.register(udtMapUpdateTool(state))
  host.tools.register(udtLessonUpdateTool(state))
}

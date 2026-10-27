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
import { withLesson } from './handoff.js'
import {
  BLOCK_SCHEMAS,
  KnownBlockSchema,
  LESSON_ORIGINS,
  MAX_BLOCKS_PER_LESSON,
  MAX_BLOCKS_PER_UPDATE,
  MAX_LESSON_BYTES,
  LessonSchema,
} from './lesson.js'
import { renderMathFragments, renderTexToMathML } from './math.js'
import type { KnownBlock, LessonRecord } from './lesson.js'
import { newNode, PROJECT_BINDINGS, PROJECT_SELECTIONS } from './state.js'
import type { Evidence, NodeRecord, ProjectSelection, SessionProjectResolution, UdState } from './state.js'
import {
  EVIDENCE_KINDS,
  NODE_RELATIONS,
  NODE_STATES,
  READINESS_OUTCOMES,
  targetRequirement,
} from './vocabulary.js'
import type { EvidenceKind, NodeRelation, NodeState, Readiness } from './vocabulary.js'
import { planningTools } from './path-tools.js'
import { activeAttempt } from './path.js'
import { requireAttempt, writeCourseTeaching } from './path-runtime.js'

/**
 * The slice of `ctx` this module needs.
 *
 * Declared structurally on purpose: we depend on the *shape* of the tools
 * registry, not on a class we might `instanceof` across harness cohorts.
 */
export interface ToolsHost {
  tools: { register(definition: ToolDefinition): unknown }
}

/**
 * The conversation a tool call belongs to.
 *
 * `udt_decide_next` is called by the model, which has no idea which
 * conversation it is running in — but the harness does: every execution carries
 * the agent on whose behalf it runs, and an agent is session-backed, so
 * `agent.id` IS the session id. Without this the decision would be stored
 * course-wide and one conversation's decision would overwrite another's, which
 * is the bug this keying exists to fix.
 *
 * @param exec - the execution context the registry hands the tool.
 * @returns the session id, or undefined when the call has no agent.
 */
function sessionOf(exec: unknown): string | undefined {
  const agent = (exec as { agent?: { id?: unknown } } | undefined)?.agent
  const id = agent?.id
  return typeof id === 'string' && id.length > 0 ? id : undefined
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

/** Resolve an explicit shared course or this conversation's selected project. */
function resolveCourseId(state: UdState, requested: string | undefined, project: SessionProjectResolution): string {
  const courseId = requested ?? project.course?.id
  if (!courseId) {
    throw new Error(
      'no course given and this conversation has no selected project; call udt_goal_create for a new goal or pass courseId explicitly',
    )
  }
  if (!state.readCourse(courseId)) throw new Error(`no course "${courseId}"`)
  return courseId
}

/** A tool write cannot silently work outside the conversation's selected project. */
function requireProjectMatch(project: SessionProjectResolution, courseId: string): void {
  if (project.course !== undefined && project.course.id !== courseId) {
    throw new Error(`this conversation selected course "${project.course.id}"; cannot write course "${courseId}" without selecting it first`)
  }
}

const PROJECT_BINDING_PROPERTIES = {
  projectAdopted: { type: 'boolean', required: true, description: 'Whether this write newly selected the project for this conversation.' },
  projectBinding: {
    type: 'string', required: true, enum: [...PROJECT_BINDINGS],
    description: 'adopted | already-selected | not-selected | missing-session-id. Shared data can be stored without a conversation binding.',
  },
} as const

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
  selection: ProjectSelection
  sessionAvailable: boolean
  courseId?: string
  learningPathContext?: string
  focus?: {
    courseId: string
    nodeId: string
    nodeTitle: string
    nodeState: string
    startedAt: string
  }
  pendingNextStep?: {
    action: string
    /** The node the decision was made from. */
    fromNodeId: string
    fromNodeTitle: string
    /** The node it sends the learner to; absent means stay on `fromNodeId`. */
    targetNodeId?: string
    targetNodeTitle?: string
    reason: string
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
function statusValue(state: UdState, sessionId: string | undefined): StatusValue {
  const snapshot = state.snapshot()
  const project = state.resolveProject(sessionId)
  const value: StatusValue = {
    domain: snapshot.domain,
    version: snapshot.version,
    initialized: snapshot.initialized,
    courseCount: snapshot.courseCount,
    nodeCount: snapshot.nodeCount,
    courses: snapshot.courses.map((course) => ({ ...course })),
    selection: project.selection,
    sessionAvailable: project.sessionAvailable,
  }
  if (project.course) {
    const path = state.readPath(project.course.id)
    const run = sessionId ? state.readCourseRun(project.course.id, sessionId) : undefined
    if (path || run) value.learningPathContext = JSON.stringify({
      tool: 'udt_path_get', courseId: project.course.id, revision: path?.revision ?? 0,
      briefRevision: path?.briefRevision ?? 0, acceptedVersion: path?.acceptedVersion ?? null,
      activeAttempt: (() => { const entry = activeAttempt(run); return entry ? { id: entry.id, itemId: entry.itemId, version: entry.version, nodeId: entry.nodeId, status: entry.status } : null })(),
    })
  }
  const { preferredLanguage, mode } = snapshot.learner
  if (preferredLanguage !== undefined) value.preferredLanguage = preferredLanguage
  if (mode !== undefined) value.mode = mode
  if (project.course !== undefined) value.courseId = project.course.id

  // The focus is how the tutor learns which node the learner asked to work on.
  // It is reported here rather than in a tool of its own: it is one fact about
  // the runtime, not a separate concern.
  const focused = sessionId === undefined ? undefined : state.activeFocus(sessionId)
  if (focused !== undefined) {
    value.focus = {
      courseId: focused.course.id,
      nodeId: focused.node.id,
      nodeTitle: focused.node.title,
      nodeState: focused.node.state,
      startedAt: focused.focus.startedAt,
    }
  }

  // A recommendation the learner has not acted on yet. Reported so the tutor
  // can see its own last decision instead of re-deciding from scratch.
  //
  // Read from the focus RECORD, not from the active focus: a decision that
  // names a target ends the focus, so keying this off `activeFocus` would hide
  // the recommendation in exactly the case it matters most — the tutor having
  // just said where to go next.
  const focusRecord =
    sessionId === undefined || project.course === undefined
      ? undefined
      : state.readFocus(sessionId, project.course.id)
  const pending =
    sessionId === undefined || focusRecord?.nextStepId === undefined
      ? undefined
      : state.readNextStep(sessionId, focusRecord.nextStepId)
  if (pending !== undefined) {
    const from = state.readNode(pending.fromNodeId)
    const target = pending.targetNodeId === undefined ? undefined : state.readNode(pending.targetNodeId)
    value.pendingNextStep = {
      action: pending.action,
      // Ids, not just titles: a model must never have to guess an identifier
      // from a display string, and titles are not unique across a map.
      fromNodeId: pending.fromNodeId,
      fromNodeTitle: from?.title ?? pending.fromNodeId,
      reason: pending.reason,
      ...(target === undefined
        ? {}
        : { targetNodeId: pending.targetNodeId as string, targetNodeTitle: target.title }),
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
      'changing state to confirm what was stored. ' +
      '`courses`, counts and preferences are learner-shared; `selection`, `courseId`, focus and next step belong only to this conversation. ' +
      '`none` means no project selected; `new` means the learner asked to start a new project: use udt_goal_create for that goal, ' +
      'and do not reuse a historical project as the current one. `project` names the selected course. ' +
      'If sessionAvailable is false, conversation binding is unavailable. ' +
      'If learningPathContext exists, read udt_path_get to continue goal setup, assessment, route or active planned teaching. ' +
      'Read-only: it records no teaching decision.',
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
          learningPathContext: { type: 'string', description: 'Stored curriculum/attempt context as JSON. Read udt_path_get before planned teaching, even when no node focus exists.' },
          preferredLanguage: { type: 'string', description: 'Learner preference, when recorded.' },
          mode: {
            type: 'string',
            description: 'Teaching mode preference: auto | zero-base | standard | advanced.',
          },
          selection: { type: 'string', required: true, enum: [...PROJECT_SELECTIONS], description: 'This conversation\'s project selection: none | new | project.' },
          sessionAvailable: { type: 'boolean', required: true, description: 'Whether this tool call has a reliable conversation id.' },
          courseId: { type: 'string', description: 'Only present for selection=project: this conversation\'s selected course.' },
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
          pendingNextStep: {
            type: 'object',
            additionalProperties: false,
            description:
              'A decision the learner has not acted on yet. Present it again rather than deciding afresh.',
            properties: {
              action: { type: 'string', required: true },
              fromNodeId: {
                type: 'string',
                required: true,
                description: 'The node id the decision was made from — pass this, never the title.',
              },
              fromNodeTitle: { type: 'string', required: true },
              targetNodeId: {
                type: 'string',
                description: 'The node id it sends the learner to. Absent means stay on fromNodeId.',
              },
              targetNodeTitle: { type: 'string' },
              reason: { type: 'string', required: true },
            },
          },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          // Native tool messages carry render content, not the execute value.
          // The tutor must see the conversation selection and usable ids.
          text: JSON.stringify(value),
        },
      ],
    },
    execute: (_args, exec) => Promise.resolve(statusValue(state, sessionOf(exec))),
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
  // ID allocation must see the preceding creation's course, and activation
  // must finish before another creation pauses it. A failed write releases
  // the queue so later calls can still create goals.
  let goalWrites: Promise<unknown> = Promise.resolve()
  return defineTool({
    name: 'udt_goal_create',
    description:
      'Record a learning goal and start its diagnosis map. ' +
      'Put the learner\'s own words in `goal`; use `title` for a short label. ' +
      'This creates ONLY the goal and the single root node of the map — it never generates a course outline, ' +
      'syllabus or list of topics. Further nodes are added later, one at a time, as diagnosis reveals ' +
      'prerequisites or blockers (see udt_map_update). ' +
      'Creating a goal marks it active in the shared library and pauses any previously active goal. ' +
      'It selects this conversation\'s project only for none/new selection; an existing project choice is preserved. ' +
      'Read projectBinding in the result to confirm whether the conversation is bound. ' +
      'Then read udt_path_get. Interactively clarify purpose, observable target outcomes, time horizon and budget before initial diagnosis and a proposed course route. Planning has its own tools; never put an undiagnosed syllabus into the diagnosis map.',
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
          ...PROJECT_BINDING_PROPERTIES,
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: JSON.stringify(value),
        },
      ],
    },
    execute: async (args, exec) => {
      const { title, goal } = args as { title: string; goal: string }
      const now = nowIso()
      const sessionId = sessionOf(exec)
      const project = state.resolveProject(sessionId)

      // Capture the conversation choice before waiting: a choice made while
      // this call is queued must invalidate its eventual adoption too.
      const result = goalWrites.then(async () => {
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
        const binding = await state.adoptProject(sessionId, courseId, now, project, true)

        return {
          courseId,
          title,
          goal,
          status: 'active',
          createdAt: now,
          goalNodeId: goalNode.id,
          pausedCourseIds: previouslyActive,
          ...binding,
        }
      })
      goalWrites = result.catch(() => undefined)
      return result
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
      'Omit courseId to read this conversation\'s selected project. An explicit courseId reads shared data without selecting it.',
    parameters: {
      courseId: { type: 'string', description: 'Goal to read; defaults only to this conversation\'s selected project.' },
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
                nodeId: {
                  type: 'string',
                  required: true,
                  description: 'The node id — pass this to udt_map_update, udt_lesson_update and udt_decide_next.',
                },
                title: { type: 'string', required: true, description: 'Display text. Never pass this as an id.' },
                relation: {
                  type: 'string',
                  required: true,
                  description: 'goal | part-of | prerequisite | related',
                },
                state: { type: 'string', required: true },
                parentNodeId: { type: 'string' },
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
          text: JSON.stringify(value),
        },
      ],
    },
    execute: (args, exec) => {
      const courseId = resolveCourseId(state, (args as { courseId?: string }).courseId, state.resolveProject(sessionOf(exec)))
      const map = state.readMap(courseId)
      if (!map) throw new Error(`no course "${courseId}"`)

      return Promise.resolve({
        courseId: map.course.id,
        title: map.course.title,
        goal: map.course.goal,
        status: map.course.status,
        nodes: map.nodes.map((node) => ({
          // Named `nodeId`, not `id`: every tool that takes a node argument
          // spells it `nodeId`, so the model reads the identifier it will pass
          // rather than translating between two spellings.
          nodeId: node.id,
          title: node.title,
          relation: node.relation,
          state: node.state,
          ...(node.parentId === undefined ? {} : { parentNodeId: node.parentId }),
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
      '• "add-evidence" — append one observation to a node. Record what happened, not how good it was. ' +
      'During an active planned lesson, supply its explicit attemptId and bound nodeId; the runtime stamps the conversation/attempt provenance. Stale attempts are refused.\n' +
      'A single call may add at most 8 nodes and a map holds at most 40. Never use this to plant a whole ' +
      'syllabus: add only what the current diagnosis justifies. ' +
      'An explicit courseId/nodeId write may select the project only when this conversation has no selection. ' +
      'Historical writes never replace new/project selection; check projectBinding in the result.',
    parameters: {
      courseId: { type: 'string', description: 'Goal to update; defaults to this conversation\'s selected project, or the explicitly named node\'s course.' },
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
      nodeId: { type: 'string', description: 'For op=set-state / add-evidence: the target node. Planned evidence must use the active attempt\'s bound node.' },
      attemptId: { type: 'string', description: 'For op=add-evidence during planned learning: required active attemptId from udt_path_get. Provenance is stamped by the runtime.' },
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
          ...PROJECT_BINDING_PROPERTIES,
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: JSON.stringify(value),
        },
      ],
    },
    execute: async (args, exec) => {
      const input = args as {
        courseId?: string
        op: (typeof MAP_OPS)[number]
        nodes?: { title: string; relation: NodeRelation; parentId?: string; state?: NodeState }[]
        nodeId?: string
        state?: NodeState
        evidenceKind?: EvidenceKind
        attemptId?: string
        evidenceNote?: string
        readiness?: Readiness
        at?: string
      }
      const sessionId = sessionOf(exec)
      const project = state.resolveProject(sessionId)
      const nodeCourseId = input.op === 'add-nodes' || input.nodeId === undefined
        ? undefined : state.readNode(input.nodeId)?.courseId
      const courseId = resolveCourseId(state, input.courseId ?? nodeCourseId, project)
      requireProjectMatch(project, courseId)
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
          ...await state.adoptProject(sessionId, courseId, now, project),
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
          ...await state.adoptProject(sessionId, courseId, now, project),
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
      const stored = await state.mutateNode(courseId, nodeId, (current) => {
        requireProjectMatch(state.resolveProject(sessionId), courseId)
        const planned = sessionId ? activeAttempt(state.readCourseRun(courseId, sessionId)) : undefined
        if (planned && ['requested', 'working'].includes(planned.status) && !input.attemptId) throw new Error('planned-evidence-needs-attemptId: read udt_path_get and bind its diagnosed node')
        const attempt = input.attemptId ? requireAttempt(state, courseId, sessionId, input.attemptId) : undefined
        if (attempt && attempt.nodeId !== current.id) throw new Error('bind-the-node-before-recording-planned-evidence')
        const trusted: Evidence = attempt ? { ...evidence, sessionId: sessionId!, attemptId: attempt.id } : evidence
        const result = recordEvidence(current, trusted, {
          now,
          ...(input.state === undefined ? {} : { state: input.state }),
        })
        if (!result.ok) throw new Error(violationMessage(result.violations))
        return result.node
      })
      return {
        courseId,
        op: input.op,
        addedNodeIds: [],
        nodeId: stored.id,
        state: stored.state,
        evidenceCount: stored.evidence.length,
        nodeCount: existing.length,
        ...await state.adoptProject(sessionId, courseId, now, project),
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
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['formula'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tex: { type: 'string', required: true, description: 'TeX source without delimiters.' },
            display: { type: 'boolean' },
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
        type: { type: 'string', required: true, enum: ['code'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            language: { type: 'string' },
            source: { type: 'string', required: true },
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
        type: { type: 'string', required: true, enum: ['quiz'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            questions: {
              type: 'array', required: true,
              items: {
                type: 'object', additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  kind: { type: 'string', required: true, enum: ['mcq', 'short'] },
                  prompt: { type: 'string', required: true },
                  options: { type: 'array', items: { type: 'string' } },
                  answer: { type: 'string' },
                  rubric: { type: 'string' },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['flashcard'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            front: { type: 'string', required: true },
            back: { type: 'string', required: true },
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['resource'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', required: true },
            sourceId: { type: 'string' },
            locator: { type: 'string' },
            url: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string', required: true },
        type: { type: 'string', required: true, enum: ['comparison'] },
        content: {
          type: 'object',
          additionalProperties: false,
          properties: {
            columns: { type: 'array', required: true, items: { type: 'string' } },
            rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'string' } } },
            caption: { type: 'string' },
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
/**
 * Attach host-rendered MathML to the two block types that carry formulas.
 *
 * This runs before `BlockSchema.parse`, so an invalid formula block is refused
 * with the block index, while a bad inline expression in a text block is left
 * as source for the client's styled fallback.
 */
function prepareMath(candidate: unknown, index: number): unknown {
  if (candidate === null || typeof candidate !== 'object') return candidate
  const block = candidate as { type?: unknown; content?: unknown }
  if (block.type === 'text' && block.content !== null && typeof block.content === 'object') {
    const content = block.content as Record<string, unknown>
    if (typeof content.md !== 'string') return candidate
    const math = renderMathFragments(content.md)
    const { math: _old, ...rest } = content
    return { ...block, content: math.length === 0 ? rest : { ...rest, math } }
  }
  if (block.type === 'formula' && block.content !== null && typeof block.content === 'object') {
    const content = block.content as Record<string, unknown>
    if (typeof content.tex !== 'string') return candidate
    const mathml = renderTexToMathML(content.tex, content.display === true)
    return { ...block, content: { ...content, mathml } }
  }
  return candidate
}

function udtLessonUpdateTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_lesson_update',
    description:
      'Write teaching content into the learner\'s Learning Surface as structured blocks.\n' +
      'The blocks appear in the panel beside the diagnosis map, so the learner reads them while ' +
      'answering in the chat — write for that surface, not as a chat message.\n' +
      'Block types: **text** {md}, **example** {title, steps[], takeaway?}, ' +
      '**diagram** {format: ascii|mermaid, spec, caption?}, **check** {prompt, expect?, hint?}, ' +
      '**formula** {tex, display?, caption?}, **code** {language?, source, caption?}, ' +
      '**quiz** {title?, questions[]}, **flashcard** {front, back, tags?}, ' +
      '**resource** {title, sourceId?, locator?, url?, note?}, **comparison** {columns[], rows[][], caption?}.\n' +
      `At most ${MAX_BLOCKS_PER_UPDATE} blocks per call and ${MAX_BLOCKS_PER_LESSON} per lesson; a teaching unit is a few ` +
      'blocks, not a chapter.\n' +
      '**Write your first unit as soon as you know it** rather than composing the whole thing first: ' +
      'the blocks appear in the learner\'s surface the moment you send them, so a short first unit ' +
      'turns a silent wait into visible progress. Send more later with append.\n' +
      'Default mode "append" adds to the current lesson; use "replace" only to correct what is there.\n' +
      'A check block has no input box: the surface displays the question and the learner answers in the chat. ' +
      'An explicit nodeId write may select its project only when this conversation has no selection. ' +
      'It never replaces new/project selection; check projectBinding in the result. ' +
      'For planned teaching, read udt_path_get, explicitly bind its node with udt_course_run_update and supply active attemptId. Content is saved per conversation/attempt with history; stale attempts are rejected.',
    parameters: {
      nodeId: {
        type: 'string',
        description: 'Node to write for. Omit to use this conversation\'s current focus (see udt_status).',
      },
      attemptId: { type: 'string', description: 'Required for planned teaching: active attemptId from udt_path_get.' },
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
          ...PROJECT_BINDING_PROPERTIES,
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: JSON.stringify(value),
        },
      ],
    },
    execute: async (args, exec) => {
      const input = args as {
        nodeId?: string
        attemptId?: string
        title?: string
        mode?: 'append' | 'replace'
        blocks: unknown[]
      }
      const mode = input.mode ?? 'append'

      const sessionId = sessionOf(exec)
      const project = state.resolveProject(sessionId)
      const focused = sessionId === undefined ? undefined : state.activeFocus(sessionId)
      const planned = sessionId && project.course ? activeAttempt(state.readCourseRun(project.course.id, sessionId)) : undefined
      if (planned && ['requested', 'working'].includes(planned.status) && !input.attemptId) throw new Error('planned-lesson-needs-attemptId: read udt_path_get and bind its diagnosed node')
      const attempt = input.attemptId && project.course ? requireAttempt(state, project.course.id, sessionId, input.attemptId) : undefined
      if (input.attemptId && !attempt) throw new Error('no-active-course-attempt')
      const nodeId = input.nodeId ?? attempt?.nodeId ?? focused?.node.id
      if (nodeId === undefined) {
        throw new Error('no nodeId given and no learning focus is active; call udt_status to see the focus')
      }
      const node = state.readNode(nodeId)
      if (node === undefined) throw new Error(`no node "${nodeId}"`)
      const courseId = resolveCourseId(state, node.courseId, project)
      requireProjectMatch(project, courseId)

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
      // block should not have to guess which. Host-owned MathML is generated
      // here so the model never supplies markup the client would trust.
      const prepared = input.blocks.map((candidate, index) => prepareMath(candidate, index))
      const parsed: KnownBlock[] = prepared.map((candidate, index) => {
        const result = KnownBlockSchema.safeParse(candidate)
        if (!result.success) {
          const issue = result.error.issues[0]
          const where = issue === undefined ? '' : `${issue.path.join('.') || '(root)'}: ${issue.message}`
          throw new Error(`block[${index}] is not a valid block — ${where}`)
        }
        return result.data
      })

      if (Buffer.byteLength(JSON.stringify(parsed), 'utf8') > MAX_LESSON_BYTES) {
        throw new Error(`blocks are too large; the whole unit must stay under ${MAX_LESSON_BYTES} bytes`)
      }

      const buildLesson = (existing: LessonRecord | undefined): LessonRecord => {
        const blocks = mode === 'replace' ? parsed : [...(existing?.blocks ?? []), ...parsed]
        if (blocks.length > MAX_BLOCKS_PER_LESSON) {
          throw new Error(
            `a lesson holds at most ${MAX_BLOCKS_PER_LESSON} blocks; this would make ${blocks.length}. ` +
              'Replace the lesson or start a new node.',
          )
        }
        const now = nowIso()
        return LessonSchema.parse({
          id: existing?.id ?? (attempt ? `${attempt.id}:${nodeId}:lesson` : `${nodeId}:lesson`),
          courseId,
          nodeId,
          title: input.title ?? existing?.title ?? state.readNode(nodeId)!.title,
          blocks,
          origin: 'tutor',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        })
      }
      const lesson = attempt && sessionId
        ? await writeCourseTeaching(state, courseId, sessionId, attempt.id, nodeId, buildLesson)
        : await state.mutateLesson(courseId, nodeId, (existing) => {
          requireProjectMatch(state.resolveProject(sessionId), courseId)
          const current = sessionId ? activeAttempt(state.readCourseRun(courseId, sessionId)) : undefined
          if (current && ['requested', 'working'].includes(current.status)) throw new Error('planned-lesson-needs-attemptId: read udt_path_get and bind its diagnosed node')
          return buildLesson(existing)
        })
      const now = lesson.updatedAt

      // The tutor has produced teaching for this node: the handoff that was
      // waiting on it is now ready, and its timing chain closes.
      // Atomic and monotonic: a lesson can only move a handoff forward, never
      // back, so a late activity event cannot undo it.
      if (sessionId !== undefined && state.readHandoff(sessionId, nodeId) !== undefined) {
        await state.updateHandoff(sessionId, nodeId, (current) => withLesson(current, now))
      }

      return {
        lessonId: lesson.id,
        nodeId,
        courseId,
        mode,
        blockCount: lesson.blocks.length,
        addedCount: parsed.length,
        origin: lesson.origin,
        ...await state.adoptProject(sessionId, courseId, now, project),
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
/* udt_decide_next                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Record the teaching decision about where the learner goes next.
 *
 * This tool exists because the plugin must not choose. The runtime knows which
 * nodes exist and which evidence supports what; it does not know whether a
 * learner is ready to move on, whether a gap is worth repairing here, or
 * whether something newly diagnosed should come first. The tutor does, and this
 * is where it says so.
 *
 * What the runtime does with the answer is structural only: it validates that
 * the nodes named exist and belong to the course, that the outcome and the
 * target agree, stores the recommendation, and turns the focus over if the
 * decision is a move. It never fills in a target the tutor left out.
 *
 * `reason` is required because the panel shows it verbatim. A recommendation
 * the learner cannot read is a jump, not a next step.
 */
function udtDecideNextTool(state: UdState): ToolDefinition {
  return defineTool({
    name: 'udt_decide_next',
    description:
      'Record your decision about what this learner should do after the current node.\n' +
      'Use your own readiness vocabulary for `action` — advance | advance-with-caution | review-first | ' +
      'step-down | more-practice | diagnose-again — and let it decide the shape:\n' +
      '• advance, advance-with-caution, step-down — MUST name `targetNodeId` (a move).\n' +
      '• more-practice, diagnose-again — MUST NOT name one (the learner stays here).\n' +
      '• review-first — may name one (go back to it) or omit it (review here).\n' +
      'The focus ends when you name a target, and stays open when you do not. Nothing moves on its own: ' +
      'the learner sees your `reason` and chooses whether to continue.\n' +
      'If the next step is a prerequisite you just diagnosed, add it to the map first with udt_map_update, ' +
      'then name it here.\n' +
      'Write `reason` for the learner — one or two plain sentences saying why this is the next thing.',
    parameters: {
      fromNodeId: {
        type: 'string',
        description: 'The node just worked on. Omit to use the current focus.',
      },
      action: {
        type: 'string',
        required: true,
        enum: [...READINESS_OUTCOMES],
        description:
          'Your readiness outcome: advance | advance-with-caution | review-first | step-down | more-practice | diagnose-again.',
      },
      targetNodeId: {
        type: 'string',
        description: 'Where to go. Required for a move; omit to stay on this node.',
      },
      reason: {
        type: 'string',
        required: true,
        description: 'Why this is the next step, in one or two plain sentences the learner will read.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fromNodeId: { type: 'string', required: true },
          action: { type: 'string', required: true },
          focusEnded: { type: 'boolean', required: true, description: 'Whether the focus was turned over.' },
          targetNodeId: { type: 'string', description: 'The named target, when there is one.' },
          reason: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text: value.focusEnded
            ? `Decision recorded: ${value.action} → next node "${value.targetNodeId}". The learner chooses when to continue.`
            : `Decision recorded: ${value.action} → stay on "${value.fromNodeId}".`,
        },
      ],
    },
    execute: async (args, exec) => {
      const input = args as {
        fromNodeId?: string
        action: Readiness
        targetNodeId?: string
        reason: string
      }
      const sessionId = sessionOf(exec)
      if (sessionId === undefined) {
        throw new Error('this call has no conversation; a decision must be recorded in one')
      }
      const focused = state.activeFocus(sessionId)
      const courseId = state.resolveProject(sessionId).course?.id
      if (courseId === undefined) {
        throw new Error('this conversation has no selected project; record a goal or select a project and start learning on a node first')
      }
      const fromNodeId = input.fromNodeId ?? focused?.node.id
      if (fromNodeId === undefined) {
        throw new Error('no fromNodeId given and no learning focus is active; call udt_status to see the focus')
      }

      // The runtime checks that the decision is well formed; it does not check
      // that it is wise, and it never supplies a missing target.
      const requirement = targetRequirement(input.action)
      if (requirement === 'required' && input.targetNodeId === undefined) {
        throw new Error(
          `action "${input.action}" is a move and must name targetNodeId. ` +
            'If the learner should stay here, use more-practice or diagnose-again.',
        )
      }
      if (requirement === 'forbidden' && input.targetNodeId !== undefined) {
        throw new Error(
          `action "${input.action}" means staying on this node, so targetNodeId must be omitted. ` +
            'Use advance, advance-with-caution, step-down or review-first to name a target.',
        )
      }

      const { nextStep, focus } = await state.decideNext({
        courseId,
        fromNodeId,
        action: input.action,
        ...(input.targetNodeId === undefined ? {} : { targetNodeId: input.targetNodeId }),
        reason: input.reason,
        now: nowIso(),
        sessionId,
      })

      return {
        fromNodeId: nextStep.fromNodeId,
        action: nextStep.action,
        focusEnded: focus.status === 'ended',
        ...(nextStep.targetNodeId === undefined ? {} : { targetNodeId: nextStep.targetNodeId }),
        reason: nextStep.reason,
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `Decide next: ${(args as { action?: string }).action ?? ''}`,
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
 * @returns how many tools were registered, so the loader log cannot drift from
 *   the registry itself (it used to say "4" while nine were registered).
 */
export function registerTools(host: ToolsHost, state: UdState): number {
  const core = [
    udtStatusTool(state),
    udtGoalCreateTool(state),
    udtMapGetTool(state),
    udtMapUpdateTool(state),
    udtLessonUpdateTool(state),
    udtDecideNextTool(state),
  ]
  const planning = planningTools(state)
  for (const tool of [...core, ...planning]) host.tools.register(tool)
  return core.length + planning.length
}

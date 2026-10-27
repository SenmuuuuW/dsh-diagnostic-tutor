/**
 * Learning Block and Lesson schemas.
 *
 * The data schema lives here (host side, zod-validated at the durable
 * boundary). The **renderers live in the client half** and are keyed by
 * `block.type`, so adding Formula, Code, Comparison, Practice or Resource later
 * means adding one renderer entry — never rewriting the lesson renderer.
 *
 * A block is `{ id, type, content, metadata? }`: the envelope is uniform and
 * `content` is shaped per type. The envelope is what the renderer registry
 * dispatches on; `content` is what a renderer understands. An unrecognised
 * `type` is not an error — the client falls back to a readable placeholder, so
 * a lesson authored by a newer host still renders in an older browser half.
 *
 * ---------------------------------------------------------------------------
 * What v0.0.4 deliberately does NOT do
 * ---------------------------------------------------------------------------
 * There is no model-generated lesson here. `buildPrototypeLesson` is a
 * **deterministic projection of state the runtime already holds** — the node's
 * own title, relation, state and evidence — assembled into the four block
 * types. It exists to prove the schema and the renderer end to end.
 *
 * That is why every lesson carries `origin`. A prototype lesson can never be
 * mistaken for teaching content, and when real generation arrives it will be
 * distinguishable in the stored record rather than by convention.
 */

import { z } from 'zod'

import { KNOWN_BLOCK_TYPE_NAMES } from './block-types.js'

import type { CourseRecord, NodeRecord } from './state.js'

/* -------------------------------------------------------------------------- */
/* Size limits                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A teaching unit is a few blocks, not a chapter.
 *
 * The cap is what makes "never generate a whole course in one call" structural
 * rather than advisory — the same reasoning as the diagnosis map's node caps.
 * Six leaves room for a real unit (orient, example, diagram, check) plus a
 * correction.
 */
export const MAX_BLOCKS_PER_UPDATE = 6

/**
 * A lesson accumulates across a session, so its ceiling is higher than one
 * call's — but it is still a ceiling. Past this the lesson has stopped being a
 * learning surface and become a document.
 */
export const MAX_BLOCKS_PER_LESSON = 24

/**
 * Per-field length caps, enforced by zod at the durable boundary.
 *
 * Structural validation alone would accept a single 5 MB text block; these make
 * "oversized payload" a rejection rather than a rendering problem.
 */
export const MAX_TEXT_CHARS = 6000
export const MAX_DIAGRAM_CHARS = 4000
export const MAX_PROMPT_CHARS = 1000
export const MAX_TITLE_CHARS = 200
export const MAX_STEP_CHARS = 400
export const MAX_STEPS = 12
export const MAX_MATH_TEX_CHARS = 2000
export const MAX_MATHML_CHARS = 12000
export const MAX_MATH_FRAGMENTS = 24
export const MAX_ID_CHARS = 120
export const MAX_CODE_CHARS = 6000
export const MAX_CODE_LANGUAGE_CHARS = 40
export const MAX_QUIZ_QUESTIONS = 8
export const MAX_QUIZ_OPTIONS = 8
export const MAX_QUIZ_ANSWER_CHARS = 2000
export const MAX_FLASHCARD_SIDE_CHARS = 2000
export const MAX_FLASHCARD_TAGS = 8
export const MAX_COMPARISON_COLUMNS = 8
export const MAX_COMPARISON_ROWS = 20
export const MAX_COMPARISON_CELL_CHARS = 500
export const MAX_LESSON_BYTES = 262_144

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

/** Fields every block carries, whatever its type. */
const blockBase = {
  id: z.string().min(1),
  /** Renderer-free annotations; never interpreted by the schema. */
  metadata: z.record(z.string(), z.unknown()).optional(),
}

export const MathFragmentSchema = z.object({
  /** Source TeX without delimiters. */
  tex: z.string().min(1).max(MAX_MATH_TEX_CHARS),
  display: z.boolean(),
  /** Host-rendered `<math>...</math>` subtree; optional for legacy records. */
  mathml: z.string().min(1).max(MAX_MATHML_CHARS),
})
export type MathFragmentRecord = z.infer<typeof MathFragmentSchema>

export const TextBlockSchema = z.object({
  ...blockBase,
  type: z.literal('text'),
  content: z.object({
    /** Markdown. Math uses the skill's convention: `\(...\)` / `\[...\]`. */
    md: z.string().min(1).max(MAX_TEXT_CHARS),
    /** Host pre-render of formulas in `md`, keyed by exact TeX and display mode. */
    math: z.array(MathFragmentSchema).max(MAX_MATH_FRAGMENTS).optional(),
  }),
})

export const FormulaBlockSchema = z.object({
  ...blockBase,
  type: z.literal('formula'),
  content: z.object({
    tex: z.string().min(1).max(MAX_MATH_TEX_CHARS),
    display: z.boolean().optional(),
    /** Host-rendered MathML; the client shows the TeX fallback when absent. */
    mathml: z.string().min(1).max(MAX_MATHML_CHARS).optional(),
    caption: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
  }),
})

export const ExampleBlockSchema = z.object({
  ...blockBase,
  type: z.literal('example'),
  content: z.object({
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    steps: z.array(z.string().min(1).max(MAX_STEP_CHARS)).min(1).max(MAX_STEPS),
    takeaway: z.string().min(1).max(MAX_STEP_CHARS).optional(),
  }),
})

export const DiagramBlockSchema = z.object({
  ...blockBase,
  type: z.literal('diagram'),
  content: z.object({
    /**
     * `ascii` renders as preformatted text and needs no dependency.
     * `mermaid` is carried by the schema from the start so a lesson authored
     * for a mermaid-capable client stays valid here; this client renders it as
     * a labelled source block rather than pulling in a renderer.
     */
    format: z.enum(['ascii', 'mermaid']),
    spec: z.string().min(1).max(MAX_DIAGRAM_CHARS),
    caption: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
  }),
})

export const CheckBlockSchema = z.object({
  ...blockBase,
  type: z.literal('check'),
  content: z.object({
    prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
    /** What the check is really probing; a hint for the teaching brain. */
    expect: z.enum(['reasoning', 'answer']).optional(),
    hint: z.string().min(1).max(MAX_PROMPT_CHARS).optional(),
  }),
})

export const CodeBlockSchema = z.object({
  ...blockBase,
  type: z.literal('code'),
  content: z.object({
    language: z.string().min(1).max(MAX_CODE_LANGUAGE_CHARS).optional(),
    source: z.string().min(1).max(MAX_CODE_CHARS),
    caption: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
  }),
})

const quizId = z.string().min(1).max(MAX_ID_CHARS)
export const QuizQuestionSchema = z.object({
  id: quizId,
  kind: z.enum(['mcq', 'short']),
  prompt: z.string().min(1).max(MAX_PROMPT_CHARS),
  options: z.array(z.string().min(1).max(300)).min(2).max(MAX_QUIZ_OPTIONS).optional(),
  /** Stored for the tutor; never rendered to the learner before a judgement. */
  answer: z.string().min(1).max(MAX_QUIZ_ANSWER_CHARS).optional(),
  rubric: z.string().min(1).max(MAX_QUIZ_ANSWER_CHARS).optional(),
  explanation: z.string().min(1).max(MAX_QUIZ_ANSWER_CHARS).optional(),
}).superRefine((question, ctx) => {
  if (question.kind === 'mcq' && (question.options === undefined || question.options.length < 2)) {
    ctx.addIssue({ code: 'custom', message: 'A multiple-choice question needs at least two options' })
  }
  if (question.options !== undefined && new Set(question.options).size !== question.options.length) {
    ctx.addIssue({ code: 'custom', message: 'Quiz options must be unique' })
  }
})
export const QuizBlockSchema = z.object({
  ...blockBase,
  type: z.literal('quiz'),
  content: z.object({
    title: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
    questions: z.array(QuizQuestionSchema).min(1).max(MAX_QUIZ_QUESTIONS),
  }).superRefine((quiz, ctx) => {
    const ids = new Set(quiz.questions.map((question) => question.id))
    if (ids.size !== quiz.questions.length) ctx.addIssue({ code: 'custom', message: 'Quiz question IDs must be unique' })
  }),
})

export const FlashcardBlockSchema = z.object({
  ...blockBase,
  type: z.literal('flashcard'),
  content: z.object({
    front: z.string().min(1).max(MAX_FLASHCARD_SIDE_CHARS),
    back: z.string().min(1).max(MAX_FLASHCARD_SIDE_CHARS),
    tags: z.array(z.string().min(1).max(40)).max(MAX_FLASHCARD_TAGS).optional(),
  }),
})

export const ResourceBlockSchema = z.object({
  ...blockBase,
  type: z.literal('resource'),
  content: z.object({
    title: z.string().min(1).max(MAX_TITLE_CHARS),
    sourceId: z.string().min(1).max(MAX_ID_CHARS).optional(),
    locator: z.string().min(1).max(300).optional(),
    /** Displayed as text only; the plugin never opens this URL itself. */
    url: z.string().min(1).max(500).optional(),
    note: z.string().min(1).max(500).optional(),
  }),
})

export const ComparisonBlockSchema = z.object({
  ...blockBase,
  type: z.literal('comparison'),
  content: z.object({
    columns: z.array(z.string().min(1).max(120)).min(1).max(MAX_COMPARISON_COLUMNS),
    rows: z.array(z.array(z.string().max(MAX_COMPARISON_CELL_CHARS)).min(1).max(MAX_COMPARISON_COLUMNS)).min(1).max(MAX_COMPARISON_ROWS),
    caption: z.string().min(1).max(MAX_TITLE_CHARS).optional(),
  }).superRefine((comparison, ctx) => {
    if (comparison.rows.some((row) => row.length !== comparison.columns.length)) {
      ctx.addIssue({ code: 'custom', message: 'Every comparison row must have one cell per column' })
    }
  }),
})

const KNOWN_BLOCK_SCHEMAS = [
  TextBlockSchema,
  ExampleBlockSchema,
  DiagramBlockSchema,
  CheckBlockSchema,
  FormulaBlockSchema,
  CodeBlockSchema,
  QuizBlockSchema,
  FlashcardBlockSchema,
  ResourceBlockSchema,
  ComparisonBlockSchema,
] as const

/** Every block type this version understands. */
export const BLOCK_SCHEMAS = KNOWN_BLOCK_SCHEMAS

export const KnownBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ExampleBlockSchema,
  DiagramBlockSchema,
  CheckBlockSchema,
  FormulaBlockSchema,
  CodeBlockSchema,
  QuizBlockSchema,
  FlashcardBlockSchema,
  ResourceBlockSchema,
  ComparisonBlockSchema,
])

const KNOWN_BLOCK_TYPES = new Set<string>(KNOWN_BLOCK_TYPE_NAMES)

/**
 * A block authored by a newer host.
 *
 * The durable boundary accepts it so an old client does not refuse to open a
 * document. Writes from the current model still go through `KnownBlockSchema`;
 * only records already on disk can carry an unknown type.
 */
export const UnknownBlockSchema = z.object({
  id: z.string().min(1).max(MAX_ID_CHARS),
  type: z.string().min(1).max(120),
  content: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((block, ctx) => {
  if (KNOWN_BLOCK_TYPES.has(block.type)) ctx.addIssue({ code: 'custom', message: 'Use the schema for this known block type' })
})

export const BlockSchema = z.union([KnownBlockSchema, UnknownBlockSchema])

export type TextBlock = z.infer<typeof TextBlockSchema>
export type ExampleBlock = z.infer<typeof ExampleBlockSchema>
export type DiagramBlock = z.infer<typeof DiagramBlockSchema>
export type CheckBlock = z.infer<typeof CheckBlockSchema>
export type FormulaBlock = z.infer<typeof FormulaBlockSchema>
export type CodeBlock = z.infer<typeof CodeBlockSchema>
export type QuizBlock = z.infer<typeof QuizBlockSchema>
export type FlashcardBlock = z.infer<typeof FlashcardBlockSchema>
export type ResourceBlock = z.infer<typeof ResourceBlockSchema>
export type ComparisonBlock = z.infer<typeof ComparisonBlockSchema>
export type KnownBlock = z.infer<typeof KnownBlockSchema>
export type UnknownBlock = z.infer<typeof UnknownBlockSchema>
/** A block this build can render. Kept as the default `Block` name for callers. */
export type Block = KnownBlock
/** A block read from storage; it may have been authored by a newer host. */
export type StoredBlock = z.infer<typeof BlockSchema>
export type BlockType = KnownBlock['type']


/** The block types this build can render, for diagnostics and tests. */
export const SUPPORTED_BLOCK_TYPES: readonly BlockType[] = BLOCK_SCHEMAS.map(
  (schema) => schema.shape.type.value,
)

/* -------------------------------------------------------------------------- */
/* Lesson                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `tutor` is what the runtime writes now: blocks the teaching brain submitted
 * through `udt_lesson_update`.
 *
 * `prototype` is retained rather than removed because v0.0.4 wrote records with
 * it, and the domain version cannot be bumped to invalidate them (the `single`
 * layout rejects a version mismatch outright — see `state.ts`). It is no longer
 * produced by the runtime.
 */
export const LESSON_ORIGINS = ['prototype', 'tutor'] as const
export const LessonOriginSchema = z.enum(LESSON_ORIGINS)
export type LessonOrigin = z.infer<typeof LessonOriginSchema>

export const LessonSchema = z.object({
  id: z.string().min(1),
  courseId: z.string().min(1),
  nodeId: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(BlockSchema).min(1).max(MAX_BLOCKS_PER_LESSON),
  /** Who produced the blocks: the teaching brain, or the v0.0.4 scaffold. */
  origin: LessonOriginSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type LessonRecord = z.infer<typeof LessonSchema>
export type LessonKey = string

/* -------------------------------------------------------------------------- */
/* Deterministic prototype lesson                                             */
/* -------------------------------------------------------------------------- */

/** Render the node's position in the map as an indented tree. */
function asciiTree(nodes: readonly NodeRecord[], focusId: string): string {
  const childrenOf = new Map<string | undefined, NodeRecord[]>()
  for (const node of nodes) {
    const bucket = childrenOf.get(node.parentId) ?? []
    bucket.push(node)
    childrenOf.set(node.parentId, bucket)
  }

  const lines: string[] = []
  const walk = (node: NodeRecord, depth: number, isLast: boolean): void => {
    const marker = depth === 0 ? '' : isLast ? '└─ ' : '├─ '
    const focus = node.id === focusId ? '   ◀ this node' : ''
    lines.push(`${'   '.repeat(Math.max(0, depth - 1))}${marker}${node.title} [${node.state}]${focus}`)
    const children = childrenOf.get(node.id) ?? []
    children.forEach((child, index) => walk(child, depth + 1, index === children.length - 1))
  }

  for (const root of childrenOf.get(undefined) ?? []) walk(root, 0, true)
  return lines.join('\n')
}

/** One readable line per evidence entry, newest last. */
function evidenceSteps(node: NodeRecord): string[] {
  if (node.evidence.length === 0) {
    return ['No observation has been recorded against this node yet.']
  }
  return node.evidence.map((entry) => {
    const readiness = entry.readiness === undefined ? '' : ` — readiness: ${entry.readiness}`
    const note = entry.note === undefined ? '' : `: ${entry.note}`
    return `${entry.kind}${readiness}${note}`
  })
}

/** How a node came to be on the map, in the map's own terms. */
function relationExplanation(node: NodeRecord): string {
  switch (node.relation) {
    case 'goal':
      return 'This is the goal itself — the frame the rest of the map hangs from. A goal is never marked confirmed, because it is not a claim about what you can do.'
    case 'prerequisite':
      return 'This was recorded as a **prerequisite**: something diagnosed as blocking the node above it.'
    case 'part-of':
      return 'This is a **part of** the node above it — a component the diagnosis separated out.'
    case 'related':
      return 'This is **related** to the node above it: useful context, but not a component and not a blocker.'
  }
}

/**
 * Build a prototype lesson for one node.
 *
 * **Not on the runtime path any more.** v0.0.5 teaches through the tutor, and
 * `udt_lesson_update` is how blocks arrive. This builder is kept for two
 * honest reasons: v0.0.4 wrote `origin: 'prototype'` records that must still
 * parse, and it is a convenient deterministic fixture for the preview and the
 * block-renderer tests.
 *
 * It projects stored state into the four block types — it does not invent
 * teaching content.
 *
 * @param input.course - the course the node belongs to.
 * @param input.node - the node to build for.
 * @param input.nodes - every node of the course, for the map diagram.
 * @param input.now - ISO timestamp.
 * @returns a validated lesson record.
 */
export function buildPrototypeLesson(input: {
  course: CourseRecord
  node: NodeRecord
  nodes: readonly NodeRecord[]
  now: string
}): LessonRecord {
  const { course, node, nodes, now } = input
  const evidenceCount = node.evidence.length

  return LessonSchema.parse({
    id: `${node.id}:prototype`,
    courseId: course.id,
    nodeId: node.id,
    title: node.title,
    origin: 'prototype',
    createdAt: now,
    updatedAt: now,
    blocks: [
      {
        id: 'where',
        type: 'text',
        content: {
          md:
            `**${node.title}** is on your map for *${course.title}* in the state \`${node.state}\`, ` +
            `with ${evidenceCount} recorded observation${evidenceCount === 1 ? '' : 's'}.\n\n` +
            relationExplanation(node),
        },
        metadata: { role: 'orientation' },
      },
      {
        id: 'evidence',
        type: 'example',
        content: {
          title: 'What the runtime has actually recorded',
          steps: evidenceSteps(node),
          takeaway:
            'A node only moves off `unconfirmed` because something was observed — never because it was asserted.',
        },
        metadata: { role: 'evidence' },
      },
      {
        id: 'map',
        type: 'diagram',
        content: {
          format: 'ascii',
          spec: asciiTree(nodes, node.id),
          caption: `Where ${node.title} sits in the diagnosis map.`,
        },
        metadata: { role: 'context' },
      },
      {
        id: 'check',
        type: 'check',
        content: {
          prompt:
            `Before any teaching starts: in your own words, what do you already know about **${node.title}**, ` +
            'and where does it stop being clear?',
          expect: 'reasoning',
          hint: 'A rough answer is more useful than a polished one — the gaps are the point.',
        },
        metadata: { role: 'check', stopAndWait: true },
      },
    ],
  })
}

/**
 * Read a block's type without trusting the value.
 *
 * Used by the client's renderer registry so an unknown type degrades instead of
 * throwing.
 *
 * @param value - any parsed block-shaped value.
 * @returns the declared type, or `undefined`.
 */
export function blockTypeOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const type = (value as { type?: unknown }).type
  return typeof type === 'string' ? type : undefined
}

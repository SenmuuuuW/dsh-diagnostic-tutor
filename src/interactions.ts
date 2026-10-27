/** Recording learner submissions. No grading, no mastery, no automatic next step. */
import { randomUUID } from 'node:crypto'

import { z } from 'zod'
import { isKnownBlock } from './block-types.js'
import type { BlockResponse } from './path.js'
import { BlockAnswerSchema } from './path.js'
import { pathView, requireAttempt } from './path-runtime.js'
import type { UdState } from './state.js'

export const AnswerSubmissionSchema = z.object({
  attemptId: z.string().min(1).max(200),
  blockId: z.string().min(1).max(200),
  answers: z.array(BlockAnswerSchema).min(1).max(16),
}).strict()
export type AnswerSubmission = z.infer<typeof AnswerSubmissionSchema>

export interface AnswerInput extends AnswerSubmission {
  courseId: string
  sessionId: string
  expectedRevision: number
}

/**
 * Persist a quiz/flashcard submission on the active attempt and append a neutral
 * practice observation to its bound node. The node's state is never changed.
 */
export async function recordBlockResponse(state: UdState, input: AnswerInput): Promise<ReturnType<typeof pathView>> {
  const path = state.readPath(input.courseId)
  if (path === undefined) throw new Error('no-learning-path: ask for a route first')
  if (path.revision !== input.expectedRevision) throw new Error('revision-conflict: refresh the learning path')
  const attempt = requireAttempt(state, input.courseId, input.sessionId, input.attemptId)
  const lesson = [...attempt.units].reverse()[0]?.lesson
  const block = lesson?.blocks.find((candidate) => candidate.id === input.blockId)
  if (block === undefined || !isKnownBlock(block)) throw new Error('unknown-block: refresh the lesson')
  if (block.type !== 'quiz' && block.type !== 'flashcard') throw new Error('not-an-interactive-block: this block does not take an answer')
  if (block.type === 'quiz') {
    const questions = new Map(block.content.questions.map((question) => [question.id, question]))
    for (const answer of input.answers) {
      const question = questions.get(answer.questionId)
      if (question === undefined) throw new Error(`unknown-question: no question "${answer.questionId}"`)
      if (question.options !== undefined && !question.options.includes(answer.value) && question.kind === 'mcq') {
        throw new Error('invalid-answer-option: choose one of the offered options')
      }
    }
  } else if (input.answers.length !== 1 || input.answers[0]?.questionId !== block.id) {
    throw new Error('invalid-flashcard-answer: answer the card itself')
  }
  const response: BlockResponse = {
    id: randomUUID(),
    blockId: block.id,
    kind: block.type,
    answers: input.answers,
    submittedAt: new Date().toISOString(),
  }
  await state.mutateCourseRun(input.courseId, input.sessionId, (run) => {
    const current = requireAttempt(state, input.courseId, input.sessionId, input.attemptId)
    return {
      ...run,
      attempts: run.attempts.map((entry) => entry.id === current.id
        ? { ...entry, responses: [...(entry.responses ?? []).filter((entryResponse) => entryResponse.blockId !== block.id), response], updatedAt: response.submittedAt }
        : entry),
      updatedAt: response.submittedAt,
    }
  })
  if (attempt.nodeId !== null) {
    const at = response.submittedAt
    await state.mutateNode(input.courseId, attempt.nodeId, (node) => ({
      ...node,
      evidence: [...node.evidence, { kind: 'practice', at, note: `Submitted ${block.type} response for ${block.id}.`, sessionId: input.sessionId, attemptId: attempt.id }],
      updatedAt: at,
    }))
  }
  return pathView(state, input.courseId, input.sessionId)
}

/** Model-facing review queue. Scheduling only; no mastery judgement. */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import {
  MAX_REVIEW_CARDS, REVIEW_RATINGS, dueCards, scheduleReview,
} from './review.js'
import type { ReviewCard } from './review.js'
import type { UdState } from './state.js'

const ReviewInputSchema = z.object({
  front: z.string().min(1).max(2000),
  back: z.string().min(1).max(4000),
  courseId: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(120).optional(),
  blockId: z.string().min(1).max(120).optional(),
  sourceRefs: z.array(z.object({ sourceId: z.string().min(1).max(120), locator: z.string().min(1).max(300) })).max(6).optional(),
}).strict()

function output() {
  return { schema: { type: 'object', additionalProperties: true } as const, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function validate(state: UdState, raw: unknown, index: number) {
  const input = ReviewInputSchema.parse(raw)
  if (input.courseId !== undefined) {
    if (state.readCourse(input.courseId) === undefined) throw new Error(`card[${index}] references an unknown course`)
    if (input.nodeId !== undefined && state.readNode(input.nodeId)?.courseId !== input.courseId) throw new Error(`card[${index}] references a node outside the course`)
  } else if (input.nodeId !== undefined) throw new Error(`card[${index}] cannot name a node without its course`)
  for (const ref of input.sourceRefs ?? []) {
    if (state.readSource(ref.sourceId) === undefined) throw new Error(`card[${index}] references an unknown source`)
  }
  return input
}

export function reviewTools(state: UdState): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_review_add',
      description:
        'Add review cards to the learner-owned spaced-repetition queue. Scheduling is runtime policy, not a mastery claim: no node state changes. ' +
        'Use a flashcard or a check as the source of a card; include sourceRefs when the card quotes a source. New cards are due immediately.',
      parameters: {
        cards: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              front: { type: 'string', required: true },
              back: { type: 'string', required: true },
              courseId: { type: 'string' },
              nodeId: { type: 'string' },
              blockId: { type: 'string' },
              sourceRefs: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { sourceId: { type: 'string', required: true }, locator: { type: 'string', required: true } } } },
            },
          },
        },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { cards?: unknown }
        if (!Array.isArray(input.cards) || input.cards.length === 0) throw new Error('review-add-needs-cards')
        if (state.listReviewCards().length + input.cards.length > MAX_REVIEW_CARDS) throw new Error('too-many-review-cards')
        const now = new Date().toISOString()
        const cards: ReviewCard[] = input.cards.map((candidate, index) => {
          const parsed = validate(state, candidate, index)
          return {
            id: randomUUID(), front: parsed.front, back: parsed.back,
            dueAt: now, intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, status: 'open', createdAt: now, updatedAt: now,
            ...(parsed.courseId === undefined ? {} : { courseId: parsed.courseId }),
            ...(parsed.nodeId === undefined ? {} : { nodeId: parsed.nodeId }),
            ...(parsed.blockId === undefined ? {} : { blockId: parsed.blockId }),
            ...(parsed.sourceRefs === undefined ? {} : { sourceRefs: parsed.sourceRefs }),
          }
        })
        for (const card of cards) await state.writeReviewCard(card)
        return JSON.parse(JSON.stringify({ ok: true, cards })) as Record<string, never>
      },
    }),
    defineTool({
      name: 'udt_review_next',
      description: 'Read the review cards that are due now (open, dueAt <= now), earliest first. This only reports the queue; it does not grade or change learning state.',
      parameters: { limit: { type: 'integer', description: 'Maximum cards, 1-20; default 5.' } },
      output: output(),
      execute: async (args) => {
        const raw = (args as { limit?: number }).limit
        const limit = Number.isInteger(raw) ? Math.min(20, Math.max(1, raw!)) : 5
        return JSON.parse(JSON.stringify({ now: new Date().toISOString(), cards: dueCards(state.listReviewCards()).slice(0, limit) })) as Record<string, never>
      },
    }),
    defineTool({
      name: 'udt_review_grade',
      description: 'Record one review grade (again | hard | good | easy) and schedule the card. This is interval arithmetic only: it does not mark a node confirmed, does not complete a lesson and does not auto-advance.',
      parameters: {
        cardId: { type: 'string', required: true },
        rating: { type: 'string', required: true, enum: [...REVIEW_RATINGS] },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { cardId?: string; rating?: string }
        if (input.cardId === undefined) throw new Error('review-grade-needs-cardId')
        if (input.rating === undefined || !(REVIEW_RATINGS as readonly string[]).includes(input.rating)) throw new Error('review-grade-needs-rating')
        const card = state.readReviewCard(input.cardId)
        if (card === undefined) throw new Error('no-such-review-card: read udt_review_next')
        const { card: updated, log } = scheduleReview(card, input.rating as (typeof REVIEW_RATINGS)[number])
        await state.writeReviewCard(updated)
        await state.writeReviewLog(log)
        return JSON.parse(JSON.stringify({ ok: true, card: updated, log })) as Record<string, never>
      },
    }),
  ]
}

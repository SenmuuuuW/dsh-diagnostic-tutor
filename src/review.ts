/** Review cards and a dependency-free local interval scheduler. No mastery claims. */
import { z } from 'zod'

export const REVIEW_CARDS_TABLE = 'review_cards'
export const REVIEW_LOG_TABLE = 'review_log'
export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const
export const REVIEW_STATUSES = ['open', 'suspended'] as const
export const MAX_REVIEW_CARDS = 500
export const MAX_REVIEW_FRONT_CHARS = 2000
export const MAX_REVIEW_BACK_CHARS = 4000

export const ReviewSourceRefSchema = z.object({
  sourceId: z.string().min(1).max(120),
  locator: z.string().min(1).max(300),
}).strict()

export const ReviewCardSchema = z.object({
  id: z.string().min(1).max(120),
  courseId: z.string().min(1).max(120).optional(),
  nodeId: z.string().min(1).max(120).optional(),
  blockId: z.string().min(1).max(120).optional(),
  front: z.string().min(1).max(MAX_REVIEW_FRONT_CHARS),
  back: z.string().min(1).max(MAX_REVIEW_BACK_CHARS),
  sourceRefs: z.array(ReviewSourceRefSchema).max(6).optional(),
  dueAt: z.string(),
  /** Days; fractional values are allowed for the first "again" step. */
  intervalDays: z.number().min(0).max(3650),
  ease: z.number().min(1.3).max(3.2),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  status: z.enum(REVIEW_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict()
export type ReviewCard = z.infer<typeof ReviewCardSchema>

export const ReviewLogSchema = z.object({
  id: z.string().min(1).max(120),
  cardId: z.string().min(1).max(120),
  rating: z.enum(REVIEW_RATINGS),
  at: z.string(),
  previousDue: z.string(),
  nextDue: z.string(),
  intervalDays: z.number().min(0),
  ease: z.number().min(1.3).max(3.2),
}).strict()
export type ReviewLog = z.infer<typeof ReviewLogSchema>
export type ReviewRating = (typeof REVIEW_RATINGS)[number]

const DAY_MS = 86_400_000

/** Apply one grade. This is scheduling arithmetic, not a judgement about learning. */
export function scheduleReview(card: ReviewCard, rating: ReviewRating, now = new Date()): { card: ReviewCard; log: ReviewLog } {
  let intervalDays = card.intervalDays
  let ease = card.ease
  let lapses = card.lapses
  if (rating === 'again') {
    intervalDays = 0
    ease = Math.max(1.3, ease - 0.2)
    lapses += 1
  } else if (rating === 'hard') {
    intervalDays = Math.max(1, card.intervalDays * 1.2)
    ease = Math.max(1.3, ease - 0.15)
  } else if (rating === 'good') {
    intervalDays = Math.max(1, card.intervalDays * ease)
  } else {
    intervalDays = Math.max(2, card.intervalDays * ease * 1.3)
    ease = Math.min(3.2, ease + 0.15)
  }
  const dueAt = rating === 'again'
    ? new Date(now.getTime() + 10 * 60_000)
    : new Date(now.getTime() + intervalDays * DAY_MS)
  const updated: ReviewCard = {
    ...card,
    intervalDays,
    ease,
    lapses,
    reps: card.reps + 1,
    dueAt: dueAt.toISOString(),
    updatedAt: now.toISOString(),
  }
  const log: ReviewLog = {
    id: `${card.id}:${now.getTime()}:${card.reps + 1}`,
    cardId: card.id,
    rating,
    at: now.toISOString(),
    previousDue: card.dueAt,
    nextDue: updated.dueAt,
    intervalDays,
    ease,
  }
  return { card: updated, log }
}

export function dueCards(cards: readonly ReviewCard[], now = new Date()): ReviewCard[] {
  const time = now.getTime()
  return [...cards]
    .filter((card) => card.status === 'open' && Date.parse(card.dueAt) <= time)
    .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt))
}

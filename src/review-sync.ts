/** Project lesson flashcards into the learner-owned review queue. */
import { createHash } from 'node:crypto'

import { isKnownBlock } from './block-types.js'
import type { LessonRecord } from './lesson.js'
import { MAX_REVIEW_CARDS } from './review.js'
import type { ReviewCard } from './review.js'
import type { UdState } from './state.js'

function autoCardId(courseId: string, nodeId: string, blockId: string): string {
  return `auto-${createHash('sha256').update(`${courseId}:${nodeId}:${blockId}`).digest('hex').slice(0, 32)}`
}

/**
 * Create or refresh one review card per flashcard block in the lesson.
 *
 * This is projection, not teaching: it never grades, never resets an existing
 * schedule and never changes node state. Replacing a lesson updates the visible
 * front/back while preserving the card's schedule. Removed flashcards are left
 * alone rather than silently deleting review history.
 */
export async function syncLessonFlashcards(
  state: UdState,
  input: { courseId: string; nodeId: string; lesson: LessonRecord; now: string },
): Promise<string[]> {
  const ids: string[] = []
  for (const block of input.lesson.blocks) {
    if (!isKnownBlock(block) || block.type !== 'flashcard') continue
    const id = autoCardId(input.courseId, input.nodeId, block.id)
    const existing = state.readReviewCard(id)
    const sourceRefs = block.sourceRefs
    if (existing !== undefined) {
      if (existing.front !== block.content.front || existing.back !== block.content.back || JSON.stringify(existing.sourceRefs) !== JSON.stringify(sourceRefs)) {
        await state.writeReviewCard({
          ...existing,
          front: block.content.front,
          back: block.content.back,
          ...(sourceRefs === undefined ? {} : { sourceRefs }),
          updatedAt: input.now,
        })
      }
      ids.push(id)
      continue
    }
    if (state.listReviewCards().length >= MAX_REVIEW_CARDS) continue
    const card: ReviewCard = {
      id, courseId: input.courseId, nodeId: input.nodeId, blockId: block.id,
      front: block.content.front, back: block.content.back,
      ...(sourceRefs === undefined ? {} : { sourceRefs }),
      dueAt: input.now, intervalDays: 0, ease: 2.5, reps: 0, lapses: 0,
      status: 'open', createdAt: input.now, updatedAt: input.now,
    }
    await state.writeReviewCard(card)
    ids.push(id)
  }
  return ids
}

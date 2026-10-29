import { describe, expect, it } from 'vitest'

import { REVIEW_CARDS_TABLE, REVIEW_LOG_TABLE, ReviewCardSchema, dueCards, scheduleReview } from '../src/review.js'
import type { ReviewCard } from '../src/review.js'
import { openUdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { createHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'
const card: ReviewCard = {
  id: 'card-1', front: 'What is a shape?', back: 'A tuple of dimensions.', dueAt: NOW,
  intervalDays: 0, ease: 2.5, reps: 0, lapses: 0, status: 'open', createdAt: NOW, updatedAt: NOW,
}

describe('review scheduling', () => {
  it('schedules again, good and easy without any mastery field', () => {
    const again = scheduleReview(card, 'again', new Date(NOW))
    expect(again.card.intervalDays).toBe(0)
    expect(again.card.lapses).toBe(1)
    expect(again.card.dueAt).not.toBe(NOW)
    expect(again.log.rating).toBe('again')
    const good = scheduleReview(card, 'good', new Date(NOW))
    expect(good.card.intervalDays).toBe(1)
    expect(good.card.reps).toBe(1)
    const easy = scheduleReview(card, 'easy', new Date(NOW))
    expect(easy.card.intervalDays).toBe(2)
    expect(easy.log).toMatchObject({ cardId: card.id, intervalDays: 2 })
  })

  it('only reports open due cards', () => {
    expect(dueCards([card], new Date(NOW))).toHaveLength(1)
    expect(dueCards([{ ...card, dueAt: '2027-01-01T00:00:00.000Z' }], new Date(NOW))).toHaveLength(0)
    expect(dueCards([{ ...card, status: 'suspended' }], new Date(NOW))).toHaveLength(0)
  })

  it('accepts the durable card schema', () => {
    expect(ReviewCardSchema.safeParse(card).success).toBe(true)
  })
})

async function open() {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
  const tools = new Map<string, { execute: (args: unknown) => Promise<Record<string, unknown>> }>()
  registerTools({ tools: { register(definition) { tools.set(definition.name, definition as never); return () => {} } } } as ToolsHost, state)
  return { harness, state, tools }
}

describe('review tools', () => {
  it('adds a due card, reads it, grades it and records a log', async () => {
    const { harness, state, tools } = await open()
    try {
      const added = await tools.get('udt_review_add')!.execute({ cards: [{ front: 'Q', back: 'A' }] })
      const id = (added.cards as { id: string }[])[0]!.id
      expect((await tools.get('udt_review_next')!.execute({})).cards as unknown[]).toHaveLength(1)
      const graded = await tools.get('udt_review_grade')!.execute({ cardId: id, rating: 'good' })
      expect((graded.card as { reps: number }).reps).toBe(1)
      expect(state.listReviewLog()).toHaveLength(1)
      expect((await tools.get('udt_review_next')!.execute({})).cards).toHaveLength(0)
      expect(state.exportState(NOW).reviewCards).toHaveLength(1)
      expect(state.exportState(NOW).reviewLog).toHaveLength(1)
      expect(REVIEW_CARDS_TABLE).toBe('review_cards')
      expect(REVIEW_LOG_TABLE).toBe('review_log')
    } finally { await harness.close() }
  })

  it('rejects unknown sources and an unknown card', async () => {
    const { harness, state, tools } = await open()
    try {
      await expect(tools.get('udt_review_add')!.execute({ cards: [{ front: 'Q', back: 'A', sourceRefs: [{ sourceId: 'missing', locator: 'x' }] }] })).rejects.toThrow(/unknown source/)
      await expect(tools.get('udt_review_grade')!.execute({ cardId: 'missing', rating: 'good' })).rejects.toThrow(/no-such-review-card/)
      expect(state.listReviewCards()).toHaveLength(0)
    } finally { await harness.close() }
  })
})

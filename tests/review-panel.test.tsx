// @vitest-environment jsdom
import { act } from 'react'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ReviewCardView } from '../src/contract.js'
import { ReviewPage } from '../src/client/review-panel.jsx'
import type { PathClient } from '../src/client/path-client.js'

const card: ReviewCardView = { id: 'card-1', front: 'What is a shape?', back: 'A tuple of dimensions.', dueAt: '2026-01-01T00:00:00.000Z' }
let root: Root | null = null
let container: HTMLDivElement
afterEach(() => { act(() => root?.unmount()); container.remove(); root = null })

async function mount(client: PathClient) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(createElement(ReviewPage, { client, onOpenRoute: () => {} }))
    await Promise.resolve(); await Promise.resolve()
  })
}

function button(label: string): HTMLButtonElement {
  const target = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.trim().startsWith(label))
  expect(target, label).toBeDefined()
  return target!
}

describe('review page', () => {
  it('reveals the back and records a grade without showing a score', async () => {
    const reviewNext = vi.fn(async () => ({ ok: true as const, cards: [card], count: 1 }))
    const reviewGrade = vi.fn(async () => ({ ok: true as const, card, remaining: 0 }))
    const reviewUndo = vi.fn(async () => ({ ok: true as const, card, remaining: 1 }))
    const client = { reviewNext, reviewGrade, reviewUndo } as unknown as PathClient
    await mount(client)
    expect(container.textContent).toContain('What is a shape?')
    await act(async () => { button('Show the back').click(); await Promise.resolve() })
    expect(container.textContent).toContain('A tuple of dimensions.')
    await act(async () => { button('Good').click(); await Promise.resolve() })
    expect(reviewGrade).toHaveBeenCalledWith({ cardId: 'card-1', rating: 'good' })
    expect(container.textContent).toContain('Undo last grade')
    await act(async () => { button('Undo last grade').click(); await Promise.resolve() })
    expect(reviewUndo).toHaveBeenCalledWith('card-1')
    expect(container.textContent).not.toMatch(/\d+\s*%/)
  })

  it('shows an empty state when nothing is due', async () => {
    const client = { reviewNext: vi.fn(async () => ({ ok: true as const, cards: [], count: 0 })), reviewGrade: vi.fn() } as unknown as PathClient
    await mount(client)
    expect(container.textContent).toContain('Nothing due')
  })
})

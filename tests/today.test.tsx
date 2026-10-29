// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { TaskView } from '../src/contract.js'
import { TodayCard } from '../src/client/today.jsx'

const NOW = '2026-01-01T00:00:00.000Z'
const tasks: TaskView[] = [
  { id: 'a', title: 'Read chapter 2', dueAt: '2026-01-02T10:00:00.000Z', estimateMin: 30, status: 'open', createdAt: NOW },
  { id: 'b', title: 'Finish exercise', status: 'open', createdAt: NOW },
  { id: 'c', title: 'Already done', status: 'done', createdAt: NOW },
]

describe('Today card', () => {
  it('shows open tasks only and asks for a calendar export', () => {
    const html = renderToStaticMarkup(createElement(TodayCard, { tasks, onExport: () => {}, onComplete: () => {} }))
    expect(html).toContain('Today')
    expect(html).toContain('Read chapter 2')
    expect(html).toContain('Finish exercise')
    expect(html).not.toContain('Already done')
    expect(html).toContain('Export calendar')
    expect(html).toContain('Done')
    expect(html).not.toMatch(/\d+\s*%/)
  })

  it('renders nothing when there is no open task', () => {
    expect(renderToStaticMarkup(createElement(TodayCard, { tasks: [] }))).toBe('')
  })
})

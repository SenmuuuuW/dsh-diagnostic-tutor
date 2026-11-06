import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { extractPdfPages, sourceDraftFromPdfBytes } from '../src/pdf.js'
import { addSource } from '../src/sources.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const FIXTURES = join(import.meta.dirname, 'fixtures', 'pdf')
const COURSE = 'pdf-course'
const NODE = `${COURSE}:goal`
const NOW = '2026-11-05T12:00:00.000Z'

async function bytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(FIXTURES, name)))
}

describe('local PDF extraction', () => {
  it('preserves original page numbers, including a page with no text', async () => {
    const { pages, content } = await extractPdfPages(await bytes('sample-3-pages.pdf'))
    expect(pages.map((page) => page.page)).toEqual([1, 2, 3])
    expect(pages[0]?.text).toContain('gradient descent')
    expect(pages[1]?.text).toBe('')
    expect(pages[2]?.text).toContain('Step 3')
    expect(content).toContain('[Page 1]')
    expect(content).toContain('[Page 3]')
  })

  it('rejects corrupt, encrypted and oversized PDFs without partial facts', async () => {
    await expect(extractPdfPages(await bytes('corrupt.pdf'))).rejects.toThrow(/source-pdf-unreadable/)
    await expect(extractPdfPages(await bytes('encrypted.pdf'))).rejects.toThrow(/source-pdf-encrypted/)
    const oversized = new Uint8Array(20 * 1024 * 1024 + 1)
    oversized.set(new TextEncoder().encode('%PDF-'))
    await expect(extractPdfPages(oversized)).rejects.toThrow(/source-pdf-too-large/)
  })

  it('builds a page-aware source draft with original-byte identity', async () => {
    const raw = await bytes('sample-3-pages.pdf')
    const draft = await sourceDraftFromPdfBytes(raw, 'sample.pdf', 'upload:sample.pdf')
    expect(draft).toMatchObject({ kind: 'pdf', pageCount: 3, bytes: raw.byteLength })
    expect(draft.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(draft.pages).toHaveLength(3)
  })
})

describe('PDF sources + bounded page context', () => {
  let harness: TestHarness
  let state: UdState
  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    registerTools({ tools: harness.ctx.get('tools')! }, state)
    await state.writeCourse({ id: COURSE, title: 'PDF course', goal: 'Read a PDF', status: 'active', createdAt: NOW, updatedAt: NOW })
    await state.writeNode(newNode({ id: NODE, courseId: COURSE, title: 'PDF course', relation: 'goal', now: NOW }))
  })
  afterEach(async () => { await harness.close() })

  it('stores pages, deduplicates exact PDFs, and returns only selected pages to the model', async () => {
    const draft = await sourceDraftFromPdfBytes(await bytes('sample-3-pages.pdf'), 'sample.pdf', 'upload:sample.pdf')
    const first = await addSource(state, draft)
    const second = await addSource(state, draft)
    expect(second.deduped).toBe(true)
    expect(second.source.id).toBe(first.source.id)
    expect(first.source.pageCount).toBe(3)
    expect(first.source.content).toContain('[Page 2]')
    const tool = harness.ctx.get('tools')!.get('udt_source_get')!
    const view = await tool.execute({ sourceId: first.source.id, pages: [3], maxChars: 1000 }, {} as never) as Record<string, any>
    expect(view).toMatchObject({ ok: true, pageRange: [3, 3], source: { pageCount: 3 } })
    expect(view.pages).toEqual([{ page: 3, text: expect.stringContaining('Step 3') }])
    expect(view.pages[0].text).not.toContain('Page 1')
    await expect(tool.execute({ sourceId: first.source.id, pages: [9] }, {} as never)).rejects.toThrow(/source-pdf-page-not-found/)
  })

  it('refuses a citation page outside the extracted PDF and accepts an in-range range', async () => {
    const draft = await sourceDraftFromPdfBytes(await bytes('sample-3-pages.pdf'), 'sample.pdf', 'upload:sample.pdf')
    const { source } = await addSource(state, draft)
    const append = harness.ctx.get('tools')!.get('udt_lesson_append_block')!
    await expect(append.execute({ nodeId: NODE, block: {
      id: 'bad-citation', type: 'text', content: { md: 'Beyond the PDF.' },
      sourceRefs: [{ sourceId: source.id, locator: 'page 9', page: 9 }],
    } }, {} as never)).rejects.toThrow(/cites page 9/)
    const written = await append.execute({ nodeId: NODE, block: {
      id: 'good-citation', type: 'text', content: { md: 'From page two.' },
      sourceRefs: [{ sourceId: source.id, locator: 'pages 2-3', page: 2, pageEnd: 3 }],
    } }, {} as never) as Record<string, any>
    expect(written.blockCount).toBe(1)
    expect(written.markdown).toContain('pages 2-3 p.2–3')
  })

  it('deletes a PDF source without touching the lesson store', async () => {
    const draft = await sourceDraftFromPdfBytes(await bytes('sample-3-pages.pdf'), 'sample.pdf', 'upload:sample.pdf')
    const { source } = await addSource(state, draft)
    await state.deleteSource(source.id)
    expect(state.readSource(source.id)).toBeUndefined()
    expect(state.listSources()).toEqual([])
  })
})

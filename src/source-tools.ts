/** Model-facing source ingestion: zero network, explicit local file or pasted text. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { addSource, sourceDraftFromFile, sourceDraftFromText } from './sources.js'
import { sourceDraftFromPdfFile } from './pdf.js'
import type { UdState } from './state.js'

function output() {
  return { schema: { type: 'object', additionalProperties: true } as const, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function metadata(record: ReturnType<UdState['listSources']>[number]) {
  return {
    id: record.id, kind: record.kind, title: record.title, locator: record.locator,
    sha256: record.sha256, bytes: record.bytes, createdAt: record.createdAt, status: record.status,
    ...(record.pageCount === undefined ? {} : { pageCount: record.pageCount }),
  }
}

const MAX_CONTEXT_PAGES = 20
const MAX_CONTEXT_CHARS = 20_000

/** A bounded, page-labelled PDF excerpt for the model context. */
function pdfExcerpt(record: ReturnType<UdState['readSource']>, requestedPages: number[] | undefined, maxChars: number) {
  if (record === undefined) throw new Error('no-such-source: read udt_source_list')
  const all = record.pages ?? []
  const selected = requestedPages === undefined || requestedPages.length === 0
    ? all.slice(0, MAX_CONTEXT_PAGES)
    : [...new Set(requestedPages)].sort((a, b) => a - b).map((page) => all.find((entry) => entry.page === page)).filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
  if (selected.length === 0) throw new Error(`source-pdf-page-not-found: pages must be between 1 and ${record.pageCount ?? all.length}`)
  let remaining = Math.min(Math.max(maxChars, 1), MAX_CONTEXT_CHARS)
  const pages: { page: number; text: string }[] = []
  let truncated = false
  for (const entry of selected) {
    if (remaining <= 0) { truncated = true; break }
    const text = entry.text.slice(0, remaining)
    if (text.length < entry.text.length) truncated = true
    pages.push({ page: entry.page, text })
    remaining -= text.length
  }
  return {
    ok: true,
    source: metadata(record),
    pages,
    pageRange: pages.length === 0 ? null : [pages[0]!.page, pages.at(-1)!.page],
    truncated,
    selection: requestedPages === undefined || requestedPages.length === 0 ? `first ${pages.length} pages` : 'requested pages',
    ...(pages.every((page) => page.text.trim() === '') ? { note: 'No extractable text on the selected pages; this build does not OCR images.' } : {}),
  }
}

export function sourceTools(state: UdState): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_source_add',
      description:
        'Add learner-owned source material before teaching from it. Use kind=file with an absolute path to one local .md/.markdown/.txt file, kind=pdf with an absolute path to one local .pdf file, or kind=text/markdown with pasted text. ' +
        'The plugin reads only that explicit file and never scans a directory or fetches a URL; for a web page, use your own web tool and pass the extracted text with a locator. ' +
        'Content is stored locally in the udt storage domain. Identical content is deduplicated by SHA-256. ' +
        'After adding, cite passages on lesson blocks with sourceRefs; never invent a sourceId.',
      parameters: {
        kind: { type: 'string', required: true, enum: ['text', 'file', 'markdown', 'pdf'] },
        path: { type: 'string', description: 'Absolute path for kind=file. Never a directory or URL.' },
        text: { type: 'string', description: 'Text for kind=text/markdown.' },
        title: { type: 'string' },
        locator: { type: 'string', description: 'Original URL, path or human-readable location.' },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { kind?: string; path?: string; text?: string; title?: string; locator?: string }
        if (input.kind !== 'text' && input.kind !== 'markdown' && input.kind !== 'file' && input.kind !== 'pdf') throw new Error('source-kind-required: use text, markdown, file or pdf')
        const draft = input.kind === 'pdf'
          ? await sourceDraftFromPdfFile(input.path ?? '')
          : input.kind === 'file'
            ? await sourceDraftFromFile(input.path ?? '')
            : sourceDraftFromText({ text: input.text ?? '', kind: input.kind, ...(input.title === undefined ? {} : { title: input.title }), ...(input.locator === undefined ? {} : { locator: input.locator }) })
        const { source, deduped } = await addSource(state, draft)
        return { ...metadata(source), deduped }
      },
    }),
    defineTool({
      name: 'udt_source_list',
      description: 'List learner-owned sources with metadata only. Never returns full content; use udt_source_get for a selected source.',
      parameters: {},
      output: output(),
      execute: async () => {
        const sources = state.listSources().map(metadata)
        return { count: sources.length, bytes: state.listSources().reduce((sum, source) => sum + source.bytes, 0), sources }
      },
    }),
    defineTool({
      name: 'udt_source_get',
      description:
        'Read one learner-owned source by sourceId. For text sources this returns stored text. For PDF sources, pass `pages` (1-based original page numbers) to select pages; otherwise the first ' +
        `${MAX_CONTEXT_PAGES} pages are returned, bounded to ${MAX_CONTEXT_CHARS} characters. Never load a whole textbook: choose the pages the teaching actually needs. ` +
        'This does not fetch anything.',
      parameters: {
        sourceId: { type: 'string', required: true },
        pages: { type: 'array', items: { type: 'integer' }, description: 'PDF pages to read, 1-based, at most 20.' },
        maxChars: { type: 'integer', description: `Maximum extracted characters, capped at ${MAX_CONTEXT_CHARS}.` },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { sourceId?: string; pages?: number[]; maxChars?: number }
        const source = state.readSource(input.sourceId ?? '')
        if (source === undefined) throw new Error('no-such-source: read udt_source_list')
        if (source.kind === 'pdf') {
          const pages = Array.isArray(input.pages) ? input.pages.filter((page): page is number => Number.isInteger(page) && page > 0) : undefined
          return pdfExcerpt(source, pages, input.maxChars ?? MAX_CONTEXT_CHARS)
        }
        return JSON.parse(JSON.stringify(source)) as Record<string, never>
      },
    }),
  ]
}

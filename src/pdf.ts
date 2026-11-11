/** Local PDF text extraction. Reads only an explicitly supplied file or buffer. */
import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import {
  MAX_PDF_BYTES, MAX_PDF_PAGES, MAX_PDF_PAGE_TEXT_CHARS, MAX_PDF_TEXT_CHARS,
  MAX_SOURCE_TITLE_CHARS, type SourcePage,
} from './source-schema.js'
import type { SourceDraft } from './sources.js'

const MAX_PAGE_TEXT = MAX_PDF_PAGE_TEXT_CHARS

function assertPdfBytes(buffer: Uint8Array): void {
  if (buffer.byteLength === 0) throw new Error('source-pdf-empty: the selected PDF is empty')
  if (buffer.byteLength > MAX_PDF_BYTES) throw new Error(`source-pdf-too-large: keep one PDF under ${MAX_PDF_BYTES} bytes`)
  const magic = new TextDecoder('latin1').decode(buffer.subarray(0, 5))
  if (magic !== '%PDF-') throw new Error('source-pdf-invalid: the selected file is not a PDF')
}

function pageText(items: unknown[]): string {
  let text = ''
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue
    const record = item as { str?: unknown; hasEOL?: unknown }
    if (typeof record.str === 'string') text += record.str
    if (record.hasEOL === true) text += '\n'
    if (text.length > MAX_PAGE_TEXT) throw new Error(`source-pdf-page-too-large: one page exceeds ${MAX_PAGE_TEXT} characters`)
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
}

/** Extract one PDF buffer, preserving 1-based page numbers. No OCR. */
export async function extractPdfPages(buffer: Uint8Array): Promise<{ pages: SourcePage[]; content: string; sha256: string }> {
  assertPdfBytes(buffer)
  // pdf.js transfers its input to the worker; keep the caller's buffer intact.
  const data = new Uint8Array(buffer)
  const sha256 = createHash('sha256').update(buffer).digest('hex')
  let task: ReturnType<typeof getDocument> | undefined
  try {
    task = getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    })
    const pdf = await task.promise
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`source-pdf-too-many-pages: this PDF has ${pdf.numPages} pages; the limit is ${MAX_PDF_PAGES}`)
    const pages: SourcePage[] = []
    let total = 0
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = pageText(content.items as unknown[])
      total += text.length
      if (total > MAX_PDF_TEXT_CHARS) throw new Error(`source-pdf-too-much-text: extracted text exceeds ${MAX_PDF_TEXT_CHARS} characters`)
      pages.push({ page: pageNumber, text })
    }
    const content = pages.map((page) => `[Page ${page.page}]\n${page.text}`).join('\n\n')
    return { pages, content, sha256 }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('source-pdf-')) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/password|encrypt/i.test(message)) throw new Error('source-pdf-encrypted: password-protected PDFs are not supported')
    throw new Error('source-pdf-unreadable: the PDF could not be read')
  } finally {
    await task?.destroy().catch(() => undefined)
  }
}

export async function sourceDraftFromPdfBytes(buffer: Uint8Array, filename: string, locator: string): Promise<SourceDraft> {
  const bytes = buffer.byteLength
  const { pages, content, sha256 } = await extractPdfPages(buffer)
  const title = (basename(filename).trim() || 'PDF document').slice(0, MAX_SOURCE_TITLE_CHARS)
  const emptyPages = pages.filter((page) => page.text.trim() === '').map((page) => page.page)
  return {
    kind: 'pdf', title, locator: locator.slice(0, 500), content,
    pages, pageCount: pages.length, sha256, bytes,
    textLayerPages: pages.length - emptyPages.length,
    emptyPages,
    extraction: 'pdf-text',
  }
}

/**
 * Read one explicitly selected local PDF. Refuses directories, symlinks,
 * non-PDF extensions and oversized files; never scans a directory or fetches.
 */
export async function sourceDraftFromPdfFile(path: string): Promise<SourceDraft> {
  if (!isAbsolute(path)) throw new Error('source-path-must-be-absolute: pass the full path to one PDF file')
  const resolved = resolve(path)
  const stats = await lstat(resolved)
  if (stats.isSymbolicLink()) throw new Error('source-symlink-refused: pass the file itself')
  if (!stats.isFile()) throw new Error('source-not-a-file: choose one PDF file')
  if (extname(resolved).toLowerCase() !== '.pdf') throw new Error('source-unsupported-file: only .pdf is accepted for a PDF source')
  if (stats.size > MAX_PDF_BYTES) throw new Error(`source-pdf-too-large: keep one PDF under ${MAX_PDF_BYTES} bytes`)
  const buffer = await readFile(resolved)
  return sourceDraftFromPdfBytes(buffer, resolved, resolved)
}

/** Learner-owned source material. Pure schema, no DSH imports. */
import { z } from 'zod'

export const SOURCE_KINDS = ['text', 'file', 'markdown', 'pdf'] as const
export const SOURCE_STATUSES = ['ready', 'error'] as const
export const MAX_SOURCE_BYTES = 131_072
export const MAX_SOURCE_CHARS = MAX_SOURCE_BYTES
export const MAX_SOURCES = 40
export const MAX_SOURCE_TITLE_CHARS = 200
export const MAX_SOURCE_LOCATOR_CHARS = 500

/** PDF limits are separate from the small text-source limits. */
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_PDF_PAGES = 400
export const MAX_PDF_TEXT_CHARS = 2_000_000
export const MAX_PDF_PAGE_TEXT_CHARS = 100_000
export const MAX_PDF_CONTENT_CHARS = MAX_PDF_TEXT_CHARS + MAX_PDF_PAGES * 20

export const SourcePageSchema = z.object({
  /** 1-based original PDF page number. */
  page: z.number().int().min(1).max(MAX_PDF_PAGES),
  text: z.string().max(MAX_PDF_PAGE_TEXT_CHARS),
}).strict()
export type SourcePage = z.infer<typeof SourcePageSchema>

export const SourceRecordSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(SOURCE_KINDS),
  title: z.string().min(1).max(MAX_SOURCE_TITLE_CHARS),
  /** Original path, URL, or a human-readable locator. Never fetched by the plugin. */
  locator: z.string().min(1).max(MAX_SOURCE_LOCATOR_CHARS),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(0).max(MAX_PDF_BYTES),
  createdAt: z.string(),
  status: z.enum(SOURCE_STATUSES),
  /** Extracted text. Optional so an errored future record can stay metadata-only. */
  content: z.string().max(MAX_PDF_CONTENT_CHARS).optional(),
  /** Extracted PDF pages, preserving original page numbers. */
  pages: z.array(SourcePageSchema).max(MAX_PDF_PAGES).optional(),
  pageCount: z.number().int().min(1).max(MAX_PDF_PAGES).optional(),
}).strict().superRefine((source, ctx) => {
  if (source.kind === 'pdf') {
    if (source.pageCount === undefined || source.pages === undefined) {
      ctx.addIssue({ code: 'custom', message: 'A PDF source needs pageCount and pages' })
      return
    }
    if (source.pages.length !== source.pageCount) ctx.addIssue({ code: 'custom', message: 'PDF pageCount must equal the extracted page array length' })
    for (const page of source.pages) {
      if (page.page > source.pageCount) ctx.addIssue({ code: 'custom', message: `Page ${page.page} is outside pageCount ${source.pageCount}` })
    }
  } else if (source.pages !== undefined || source.pageCount !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Only PDF sources carry pages/pageCount' })
  }
})
export type SourceRecord = z.infer<typeof SourceRecordSchema>
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const SOURCES_TABLE = 'sources'

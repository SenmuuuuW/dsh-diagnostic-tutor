/** Learner-owned source material. Pure schema, no DSH imports. */
import { z } from 'zod'

export const SOURCE_KINDS = ['text', 'file', 'markdown'] as const
export const SOURCE_STATUSES = ['ready', 'error'] as const
export const MAX_SOURCE_BYTES = 131_072
export const MAX_SOURCE_CHARS = MAX_SOURCE_BYTES
export const MAX_SOURCES = 40
export const MAX_SOURCE_TITLE_CHARS = 200
export const MAX_SOURCE_LOCATOR_CHARS = 500

export const SourceRecordSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(SOURCE_KINDS),
  title: z.string().min(1).max(MAX_SOURCE_TITLE_CHARS),
  /** Original path, URL, or a human-readable locator. Never fetched by the plugin. */
  locator: z.string().min(1).max(MAX_SOURCE_LOCATOR_CHARS),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(0).max(MAX_SOURCE_BYTES),
  createdAt: z.string(),
  status: z.enum(SOURCE_STATUSES),
  /** Extracted text. Optional so an errored future record can stay metadata-only. */
  content: z.string().max(MAX_SOURCE_CHARS).optional(),
}).strict()
export type SourceRecord = z.infer<typeof SourceRecordSchema>
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const SOURCES_TABLE = 'sources'

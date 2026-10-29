/** Local source ingestion. No network access is ever made by this module. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import { TextDecoder } from 'node:util'

import { MAX_SOURCE_BYTES, MAX_SOURCE_TITLE_CHARS, MAX_SOURCES, type SourceRecord } from './source-schema.js'

const ALLOWED_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const decoder = new TextDecoder('utf-8', { fatal: true })

export interface SourceDraft {
  kind: 'text' | 'file' | 'markdown'
  title: string
  locator: string
  content: string
}

export function sourceDraftFromText(input: {
  text: string
  kind?: 'text' | 'markdown'
  title?: string
  locator?: string
}): SourceDraft {
  const text = input.text
  if (text.length === 0) throw new Error('source-empty: paste some text first')
  if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_BYTES) throw new Error(`source-too-large: keep one source under ${MAX_SOURCE_BYTES} bytes`)
  const kind = input.kind ?? 'text'
  const title = (input.title?.trim() || (kind === 'markdown' ? 'Pasted Markdown' : 'Pasted text')).slice(0, MAX_SOURCE_TITLE_CHARS)
  return { kind, title, locator: (input.locator?.trim() || title).slice(0, 500), content: text }
}

/**
 * Read one explicitly selected local markdown/text file.
 *
 * This is the only place the plugin reads outside its own storage domain. It
 * refuses directories, symlinks, unsupported extensions and oversized files;
 * it never scans a directory or follows a URL.
 */
export async function sourceDraftFromFile(path: string): Promise<SourceDraft> {
  if (!isAbsolute(path)) throw new Error('source-path-must-be-absolute: pass the full path to one file')
  const resolved = resolve(path)
  const stats = await lstat(resolved)
  if (stats.isSymbolicLink()) throw new Error('source-symlink-refused: pass the file itself')
  if (!stats.isFile()) throw new Error('source-not-a-file: choose one markdown or text file')
  const extension = extname(resolved).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('source-unsupported-file: only .md, .markdown and .txt are accepted in this phase')
  if (stats.size > MAX_SOURCE_BYTES) throw new Error(`source-too-large: keep one source under ${MAX_SOURCE_BYTES} bytes`)
  const buffer = await readFile(resolved)
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error(`source-too-large: keep one source under ${MAX_SOURCE_BYTES} bytes`)
  let content: string
  try { content = decoder.decode(buffer) } catch { throw new Error('source-not-utf8: convert the file to UTF-8 first') }
  if (content.includes('\u0000')) throw new Error('source-binary: the selected file is not text')
  const title = basename(resolved).slice(0, MAX_SOURCE_TITLE_CHARS)
  return { kind: 'file', title, locator: resolved, content }
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function sourceRecord(draft: SourceDraft, now = new Date().toISOString()): SourceRecord {
  const bytes = Buffer.byteLength(draft.content, 'utf8')
  if (bytes > MAX_SOURCE_BYTES) throw new Error(`source-too-large: keep one source under ${MAX_SOURCE_BYTES} bytes`)
  return {
    id: randomUUID(), kind: draft.kind, title: draft.title, locator: draft.locator,
    sha256: sha256(draft.content), bytes, createdAt: now, status: 'ready', content: draft.content,
  }
}

export interface SourceStore {
  listSources(): SourceRecord[]
  readSource(id: string): SourceRecord | undefined
  writeSource(record: SourceRecord): Promise<SourceRecord>
}

/** Add one source, deduplicating identical content by SHA-256. */
export async function addSource(store: SourceStore, draft: SourceDraft, now?: string): Promise<{ source: SourceRecord; deduped: boolean }> {
  const record = sourceRecord(draft, now)
  const existing = store.listSources().find((source) => source.sha256 === record.sha256 && source.status === 'ready')
  if (existing !== undefined) return { source: existing, deduped: true }
  if (store.listSources().length >= MAX_SOURCES) throw new Error(`too-many-sources: this learner already has ${MAX_SOURCES} sources`)
  await store.writeSource(record)
  return { source: record, deduped: false }
}

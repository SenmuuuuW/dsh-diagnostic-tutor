import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { addSource, sourceDraftFromFile, sourceDraftFromText } from '../src/sources.js'
import { openUdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import type { ToolsHost } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { MAX_SOURCE_BYTES, MAX_SOURCES } from '../src/source-schema.js'
import { createHarness } from './harness.js'

const NOW = '2026-01-01T00:00:00.000Z'

async function open() {
  const harness = await createHarness()
  const state = await openUdState(harness.ctx.get('storageDomain')!)
  return { harness, state }
}

describe('source ingestion', () => {
  it('stores pasted text with a digest and byte count', async () => {
    const { harness, state } = await open()
    try {
      const { source, deduped } = await addSource(state, sourceDraftFromText({ text: 'A source paragraph.', title: 'Notes' }), NOW)
      expect(deduped).toBe(false)
      expect(source).toMatchObject({ title: 'Notes', kind: 'text', bytes: 19, status: 'ready' })
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(state.readSource(source.id)?.content).toBe('A source paragraph.')
    } finally { await harness.close() }
  })

  it('deduplicates identical content and enforces the source cap', async () => {
    const { harness, state } = await open()
    try {
      const draft = sourceDraftFromText({ text: 'same content' })
      const first = await addSource(state, draft)
      const second = await addSource(state, draft)
      expect(second.deduped).toBe(true)
      expect(second.source.id).toBe(first.source.id)
      for (let index = 0; index < MAX_SOURCES - 1; index += 1) {
        await addSource(state, sourceDraftFromText({ text: `source ${index}` }))
      }
      await expect(addSource(state, sourceDraftFromText({ text: 'over the cap' }))).rejects.toThrow(/too-many-sources/)
    } finally { await harness.close() }
  })

  it('reads one explicit UTF-8 markdown file and rejects symlinks, unsupported files and oversize files', async () => {
    const { harness } = await open()
    const dir = await mkdtemp(join(tmpdir(), 'udt-source-'))
    try {
      const file = join(dir, 'lesson.md')
      await writeFile(file, '# Heading\n\nText.')
      const draft = await sourceDraftFromFile(file)
      expect(draft).toMatchObject({ kind: 'file', title: 'lesson.md', locator: file })
      expect(draft.content).toContain('# Heading')
      await expect(sourceDraftFromFile('relative.md')).rejects.toThrow(/absolute/)
      await writeFile(join(dir, 'lesson.pdf'), 'pdf')
      await expect(sourceDraftFromFile(join(dir, 'lesson.pdf'))).rejects.toThrow(/unsupported-file/)
      const link = join(dir, 'linked.md')
      await symlink(file, link)
      await expect(sourceDraftFromFile(link)).rejects.toThrow(/symlink/)
      const big = join(dir, 'big.txt')
      await writeFile(big, 'x'.repeat(MAX_SOURCE_BYTES + 1))
      await expect(sourceDraftFromFile(big)).rejects.toThrow(/too-large/)
    } finally { await harness.close() }
  })
})

describe('source tools and API', () => {
  it('adds, lists without content, and gets one stored source through tools', async () => {
    const { harness, state } = await open()
    try {
      const tools = new Map<string, { execute: (args: unknown) => Promise<Record<string, unknown>> }>()
      registerTools({ tools: { register(definition) { tools.set(definition.name, definition as never); return () => {} } } } as ToolsHost, state)
      const added = await tools.get('udt_source_add')!.execute({ kind: 'text', text: 'Source body', title: 'Reading' })
      expect(added.id).toBeTypeOf('string')
      const list = await tools.get('udt_source_list')!.execute({})
      expect(list.count).toBe(1)
      expect((list.sources as { content?: unknown }[])[0]?.content).toBeUndefined()
      const got = await tools.get('udt_source_get')!.execute({ sourceId: added.id })
      expect(got.content).toBe('Source body')
    } finally { await harness.close() }
  })

  it('serves a source only through the trust-fenced route', async () => {
    const { harness, state } = await open()
    try {
      const { source } = await addSource(state, sourceDraftFromText({ text: 'API source' }))
      const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }) }))
      const req = { method: 'GET', url: `${API_PREFIX}/source?id=${source.id}`, headers: { host: '127.0.0.1:3080' }, async *[Symbol.asyncIterator]() { /* no body */ } } as unknown as IncomingMessage
      const response = { statusCode: 0, body: '', setHeader() {}, end(chunk: string) { this.body += chunk } }
      await handler(req, response as unknown as ServerResponse)
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body).source.content).toBe('API source')
      const missing = { ...req, url: `${API_PREFIX}/source?id=missing` }
      const missingResponse = { statusCode: 0, body: '', setHeader() {}, end(chunk: string) { this.body += chunk } }
      await handler(missing as unknown as IncomingMessage, missingResponse as unknown as ServerResponse)
      expect(missingResponse.statusCode).toBe(404)
    } finally { await harness.close() }
  })

  it('includes sources in export and clears them on reset', async () => {
    const { harness, state } = await open()
    try {
      const { source } = await addSource(state, sourceDraftFromText({ text: 'exported' }))
      expect(state.exportState(NOW).sources.map((entry) => entry.id)).toContain(source.id)
      await state.resetState(NOW)
      expect(state.listSources()).toHaveLength(0)
    } finally { await harness.close() }
  })
})

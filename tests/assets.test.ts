import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { API_PREFIX, createApiHandler } from '../src/api.js'
import { inspectImage, LocalAssetStore, addAsset, deleteAsset, readAssetBytes } from '../src/assets.js'
import { KnownBlockSchema } from '../src/lesson.js'
import { newNode, openUdState } from '../src/state.js'
import type { UdState } from '../src/state.js'
import { registerTools } from '../src/tools.js'
import { guarded } from '../src/trust-fence.js'
import { createHarness } from './harness.js'
import type { TestHarness } from './harness.js'

const FIXTURES = join(import.meta.dirname, 'fixtures', 'images')
const COURSE = 'assets-course'
const NODE = `${COURSE}:goal`
const NOW = '2026-11-05T12:00:00.000Z'

class Response {
  statusCode = 200
  body = Buffer.alloc(0)
  headers: Record<string, string> = {}
  setHeader(name: string, value: string): void { this.headers[name.toLowerCase()] = value }
  end(chunk?: string | Buffer): void { this.body = chunk === undefined ? Buffer.alloc(0) : Buffer.from(chunk) }
  json(): Record<string, any> { return JSON.parse(this.body.toString('utf8')) as Record<string, any> }
}
function request(path: string, method: string, body?: Uint8Array | unknown): IncomingMessage {
  return {
    method, url: `${API_PREFIX}${path}`, headers: { host: '127.0.0.1:3080' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(body instanceof Uint8Array ? body : JSON.stringify(body))
    },
  } as unknown as IncomingMessage
}

describe('local image assets', () => {
  let harness: TestHarness
  let state: UdState
  let root: string
  let store: LocalAssetStore
  let assetStore: LocalAssetStore
  beforeEach(async () => {
    harness = await createHarness()
    state = await openUdState(harness.ctx.get('storageDomain')!)
    root = await mkdtemp(join(tmpdir(), 'udt-assets-'))
    store = new LocalAssetStore(root)
    assetStore = store
    registerTools({ tools: harness.ctx.get('tools')! }, state, { assetStore: store })
    await state.writeCourse({ id: COURSE, title: 'Assets', goal: 'Use an image', status: 'active', createdAt: NOW, updatedAt: NOW })
    await state.writeNode(newNode({ id: NODE, courseId: COURSE, title: 'Assets', relation: 'goal', now: NOW }))
  })
  afterEach(async () => { await harness.close(); await rm(root, { recursive: true, force: true }) })

  it('sniffs PNG/JPEG/WebP by bytes and rejects a text file with an image extension', async () => {
    for (const file of ['sample.png', 'sample.jpg', 'sample.webp']) {
      const facts = inspectImage(new Uint8Array(await readFile(join(FIXTURES, file))))
      expect(facts.width).toBeGreaterThan(0)
      expect(facts.height).toBeGreaterThan(0)
    }
    await expect(addAsset(state, store, new Uint8Array(await readFile(join(FIXTURES, 'not-image.png'))))).rejects.toThrow(/asset-unsupported-type/)
  })

  it('stores bytes outside udt, deduplicates by SHA-256, and deletes both metadata and bytes', async () => {
    const bytes = new Uint8Array(await readFile(join(FIXTURES, 'sample.png')))
    const first = await addAsset(state, store, bytes, 'sample.png')
    expect(first.deduped).toBe(false)
    expect(first.asset.width).toBe(32)
    expect(state.listAssets()).toHaveLength(1)
    expect(await store.exists(first.asset.sha256)).toBe(true)
    const again = await addAsset(state, store, bytes, 'renamed.png')
    expect(again.deduped).toBe(true)
    expect(again.asset.id).toBe(first.asset.id)
    expect((await readAssetBytes(state, store, first.asset.id)).bytes).toEqual(Buffer.from(bytes))
    await deleteAsset(state, store, first.asset.id)
    expect(state.readAsset(first.asset.id)).toBeUndefined()
    expect(await store.exists(first.asset.sha256)).toBe(false)
    await expect(readAssetBytes(state, store, first.asset.id)).rejects.toThrow(/no-such-asset/)
  })

  it('uploads through the bounded HTTP route and rejects a spoofed extension', async () => {
    const bytes = new Uint8Array(await readFile(join(FIXTURES, 'sample.png')))
    const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }), assetStore }))
    const res = new Response()
    await handler(request('/asset?filename=course.png', 'POST', bytes), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ ok: true, asset: { mediaType: 'image/png', width: 32, height: 24, filename: 'course.png' } })
    const duplicate = new Response()
    await handler(request('/asset?filename=renamed.png', 'POST', bytes), duplicate as unknown as ServerResponse)
    expect(duplicate.json()).toMatchObject({ ok: true, deduped: true, asset: { id: body.asset.id } })
    const fake = new Response()
    await handler(request('/asset?filename=fake.png', 'POST', new Uint8Array(await readFile(join(FIXTURES, 'not-image.png')))), fake as unknown as ServerResponse)
    expect(fake.statusCode).toBe(400)
  })

  it('exports and restores asset bytes through a local backup document', async () => {
    const bytes = new Uint8Array(await readFile(join(FIXTURES, 'sample.png')))
    const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }), assetStore }))
    const upload = new Response()
    await handler(request('/asset?filename=backup.png', 'POST', bytes), upload as unknown as ServerResponse)
    const asset = upload.json().asset as { id: string; sha256: string }
    const exportResponse = new Response()
    await handler(request('/assets/export', 'GET'), exportResponse as unknown as ServerResponse)
    expect(exportResponse.statusCode).toBe(200)
    const backup = exportResponse.json()
    expect(backup.assets[0]).toMatchObject({ id: asset.id, sha256: asset.sha256, width: 32, height: 24 })
    expect(Buffer.from(backup.assets[0].dataBase64, 'base64')).toEqual(Buffer.from(bytes))
    await deleteAsset(state, store, asset.id)
    expect(state.listAssets()).toHaveLength(0)
    const importResponse = new Response()
    await handler(request('/assets/import', 'POST', backup), importResponse as unknown as ServerResponse)
    expect(importResponse.statusCode).toBe(200)
    expect(importResponse.json()).toMatchObject({ ok: true, imported: 1, deduped: 0 })
    expect(state.listAssets()).toHaveLength(1)
    expect((await readAssetBytes(state, store, state.listAssets()[0]!.id)).bytes).toEqual(Buffer.from(bytes))
  })

  it('clears metadata and bytes on a confirmed reset', async () => {
    const bytes = new Uint8Array(await readFile(join(FIXTURES, 'sample.png')))
    const { asset } = await addAsset(state, store, bytes, 'sample.png')
    expect(await store.exists(asset.sha256)).toBe(true)
    const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }), assetStore }))
    const res = new Response()
    await handler(request('/reset', 'POST'), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(200)
    expect(state.listAssets()).toHaveLength(0)
    expect(await store.exists(asset.sha256)).toBe(false)
  })

  it('accepts a local path but rejects a relative path', async () => {
    const { addAssetFromFile } = await import('../src/assets.js')
    await expect(addAssetFromFile(state, store, 'relative.png')).rejects.toThrow(/asset-path-must-be-absolute/)
    const added = await addAssetFromFile(state, store, join(FIXTURES, 'sample.jpg'))
    expect(added.asset.mediaType).toBe('image/jpeg')
  })

  it('serves an image only through the local asset route and blocks remote URLs in an image block', async () => {
    const bytes = new Uint8Array(await readFile(join(FIXTURES, 'sample.webp')))
    const { asset } = await addAsset(state, store, bytes, 'sample.webp')
    const handler = guarded(createApiHandler({ state, prompt: () => ({ prompted: false }), assetStore }))
    const res = new Response()
    await handler(request(`/asset?id=${encodeURIComponent(asset.id)}`, 'GET'), res as unknown as ServerResponse)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body).toEqual(Buffer.from(bytes))
    const missing = new Response()
    await handler(request('/asset?id=not-real', 'GET'), missing as unknown as ServerResponse)
    expect(missing.statusCode).toBe(404)
    expect(KnownBlockSchema.safeParse({ id: 'image-1', type: 'image', content: { assetId: asset.id, alt: 'A sample', caption: 'Local only' } }).success).toBe(true)
    expect(KnownBlockSchema.safeParse({ id: 'image-2', type: 'image', content: { assetId: asset.id, alt: 'A sample', url: 'https://example.com/a.png' } }).success).toBe(false)
    const append = harness.ctx.get('tools')!.get('udt_lesson_append_block')!
    const written = await append.execute({ nodeId: NODE,
      block: { id: 'image-block', type: 'image', content: { assetId: asset.id, alt: 'A local image' } } }, {} as never) as Record<string, any>
    expect(written).toMatchObject({ blockId: 'image-block', blockCount: 1, added: true })
    expect(written.markdown).toContain('local asset')
  })
})

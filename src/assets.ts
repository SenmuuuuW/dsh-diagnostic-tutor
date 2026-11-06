/** Content-addressed local raster assets. No network, no path from user input. */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import {
  ASSET_MEDIA_TYPES, MAX_ASSET_BYTES, MAX_ASSET_DIMENSION, MAX_ASSET_PIXELS, MAX_ASSETS,
  type AssetMediaType, type AssetRecord,
} from './asset-schema.js'

/** Where image bytes live when the host does not inject another root. */
export function defaultAssetRoot(): string {
  const explicit = process.env.DSH_DIAGNOSTIC_TUTOR_ASSET_ROOT
  if (explicit !== undefined && explicit.trim() !== '') return resolve(explicit)
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'storages', 'diagnostic-tutor-assets')
}

export interface AssetStore {
  readonly root: string
  read(sha256: string): Promise<Buffer>
  write(sha256: string, bytes: Uint8Array): Promise<void>
  remove(sha256: string): Promise<void>
  exists(sha256: string): Promise<boolean>
  /** Delete the whole local asset tree, used only by a confirmed reset. */
  clear(): Promise<void>
}

/** File bytes are content-addressed and deduplicated; metadata lives in udt. */
export class LocalAssetStore implements AssetStore {
  readonly root: string
  constructor(root: string = defaultAssetRoot()) { this.root = resolve(root) }
  private path(sha256: string): string {
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('asset-invalid-hash')
    return join(this.root, sha256.slice(0, 2), sha256)
  }
  async read(sha256: string): Promise<Buffer> {
    return readFile(this.path(sha256))
  }
  async write(sha256: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(sha256)
    const parent = dirname(target)
    await mkdir(parent, { recursive: true, mode: 0o700 })
    const handle = await open(target, 'w', 0o600)
    try { await handle.writeFile(bytes) } finally { await handle.close() }
  }
  async remove(sha256: string): Promise<void> { await rm(this.path(sha256), { force: true }) }
  async clear(): Promise<void> { await rm(this.root, { recursive: true, force: true }) }
  async exists(sha256: string): Promise<boolean> {
    try { return (await stat(this.path(sha256))).isFile() } catch { return false }
  }
}

export interface AssetState {
  listAssets(): AssetRecord[]
  readAsset(id: string): AssetRecord | undefined
  writeAsset(record: AssetRecord): Promise<AssetRecord>
  deleteAsset(id: string): Promise<void>
}

interface ImageFacts { mediaType: AssetMediaType; width: number; height: number }

function jpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  let offset = 2
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return undefined
    const marker = bytes[offset + 1]!
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!
    if (length < 2 || offset + 2 + length > bytes.length) return undefined
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: (bytes[offset + 5]! << 8) | bytes[offset + 6]!, width: (bytes[offset + 7]! << 8) | bytes[offset + 8]! }
    }
    offset += 2 + length
  }
  return undefined
}

function webpSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(12, 16)) === 'VP8 ') {
    if (bytes.length < 30) return undefined
    return { width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff, height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff }
  }
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk === 'VP8X') return {
    width: 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16)),
    height: 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16)),
  }
  if (chunk === 'VP8L') {
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }
  return undefined
}

/** Identify an image from bytes, never from a filename or declared MIME type. */
export function inspectImage(bytes: Uint8Array): ImageFacts {
  if (bytes.length === 0) throw new Error('asset-empty: choose an image')
  if (bytes.length > MAX_ASSET_BYTES) throw new Error(`asset-too-large: keep one image under ${MAX_ASSET_BYTES} bytes`)
  const png = bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  if (png) {
    const width = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!
    const height = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!
    return checkDimensions('image/png', width, height)
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const size = jpegSize(bytes)
    if (size === undefined) throw new Error('asset-invalid-image: could not read JPEG dimensions')
    return checkDimensions('image/jpeg', size.width, size.height)
  }
  if (bytes.length >= 16 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    const size = webpSize(bytes)
    if (size === undefined) throw new Error('asset-invalid-image: could not read WebP dimensions')
    return checkDimensions('image/webp', size.width, size.height)
  }
  throw new Error(`asset-unsupported-type: only ${ASSET_MEDIA_TYPES.join(', ')} are accepted`)
}

function checkDimensions(mediaType: AssetMediaType, width: number, height: number): ImageFacts {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('asset-invalid-image: invalid dimensions')
  if (width > MAX_ASSET_DIMENSION || height > MAX_ASSET_DIMENSION || width * height > MAX_ASSET_PIXELS) {
    throw new Error(`asset-dimensions-too-large: keep images within ${MAX_ASSET_DIMENSION}×${MAX_ASSET_DIMENSION}`)
  }
  return { mediaType, width, height }
}

export async function addAsset(state: AssetState, store: AssetStore, bytes: Uint8Array, filename?: string): Promise<{ asset: AssetRecord; deduped: boolean }> {
  const facts = inspectImage(bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const existing = state.listAssets().find((asset) => asset.sha256 === sha256)
  if (existing !== undefined) return { asset: existing, deduped: true }
  if (state.listAssets().length >= MAX_ASSETS) throw new Error(`too-many-assets: this learner already has ${MAX_ASSETS} images`)
  const record: AssetRecord = {
    id: randomUUID(), sha256, mediaType: facts.mediaType, bytes: bytes.byteLength,
    width: facts.width, height: facts.height,
    ...(filename === undefined || filename.trim() === '' ? {} : { filename: filename.trim().slice(0, 200) }),
    createdAt: new Date().toISOString(),
  }
  await store.write(sha256, bytes)
  try { await state.writeAsset(record) } catch (error) { await store.remove(sha256).catch(() => undefined); throw error }
  return { asset: record, deduped: false }
}

export async function deleteAsset(state: AssetState, store: AssetStore, id: string): Promise<void> {
  const asset = state.readAsset(id)
  if (asset === undefined) throw new Error('no-such-asset')
  await state.deleteAsset(id)
  // If another metadata row still points at the same content, keep the bytes.
  if (!state.listAssets().some((entry) => entry.sha256 === asset.sha256)) await store.remove(asset.sha256)
}

export async function readAssetBytes(state: AssetState, store: AssetStore, id: string): Promise<{ asset: AssetRecord; bytes: Buffer }> {
  const asset = state.readAsset(id)
  if (asset === undefined) throw new Error('no-such-asset')
  if (!(await store.exists(asset.sha256))) throw new Error('asset-file-missing')
  return { asset, bytes: await store.read(asset.sha256) }
}

/** Read one explicitly selected local image. Never scans a directory. */
export async function addAssetFromFile(state: AssetState, store: AssetStore, path: string): Promise<{ asset: AssetRecord; deduped: boolean }> {
  if (!isAbsolute(path)) throw new Error('asset-path-must-be-absolute: pass the full path to one image')
  const resolved = resolve(path)
  const stats = await lstat(resolved)
  if (stats.isSymbolicLink()) throw new Error('asset-symlink-refused: pass the image itself')
  if (!stats.isFile()) throw new Error('asset-not-a-file: choose one image')
  if (stats.size > MAX_ASSET_BYTES) throw new Error(`asset-too-large: keep one image under ${MAX_ASSET_BYTES} bytes`)
  const bytes = await readFile(resolved)
  return addAsset(state, store, bytes, resolved.split('/').at(-1))
}

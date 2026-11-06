/** Local raster asset metadata. Bytes live outside udt.json. */
import { z } from 'zod'

export const ASSET_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_ASSET_BYTES = 5 * 1024 * 1024
export const MAX_ASSET_DIMENSION = 4096
export const MAX_ASSET_PIXELS = 16_777_216
export const MAX_ASSETS = 80

export const AssetRecordSchema = z.object({
  id: z.string().min(1).max(120),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  mediaType: z.enum(ASSET_MEDIA_TYPES),
  bytes: z.number().int().min(1).max(MAX_ASSET_BYTES),
  width: z.number().int().min(1).max(MAX_ASSET_DIMENSION),
  height: z.number().int().min(1).max(MAX_ASSET_DIMENSION),
  /** Display-only original name; never used as a filesystem path. */
  filename: z.string().min(1).max(200).optional(),
  createdAt: z.string(),
}).strict()
export type AssetRecord = z.infer<typeof AssetRecordSchema>
export type AssetMediaType = (typeof ASSET_MEDIA_TYPES)[number]

export const ASSETS_TABLE = 'assets'

/** Model-facing local asset metadata. Pixels are never sent to a model here. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { addAssetFromFile } from './assets.js'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AssetStore } from './assets.js'
import type { AssetRecord } from './asset-schema.js'
import type { UdState } from './state.js'

function metadata(asset: AssetRecord) {
  return {
    id: asset.id, sha256: asset.sha256, mediaType: asset.mediaType, bytes: asset.bytes,
    width: asset.width, height: asset.height, createdAt: asset.createdAt,
    ...(asset.filename === undefined ? {} : { filename: asset.filename }),
  }
}

function output() {
  return { schema: { type: 'object', additionalProperties: true } as const, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

export function assetTools(state: UdState, store: AssetStore | undefined): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_asset_list',
      description:
        'List locally stored course images as metadata only (id, dimensions, type, original filename). ' +
        'Use an id with an **image** lesson block. This does not analyze the image contents; the model cannot see pixels through this tool.',
      parameters: {},
      output: output(),
      execute: async () => ({ count: state.listAssets().length, assets: state.listAssets().map(metadata) }),
    }),
    defineTool({
      name: 'udt_asset_add',
      description:
        'Add one explicitly selected local PNG/JPEG/WebP image as course material. Pass an absolute path; the plugin never scans a directory or accepts a URL. ' +
        'The file is sniffed by bytes, size/dimension-limited, hashed, and stored in the local asset directory; metadata is written to udt. ' +
        'This only stores the image for display. It does NOT give the model image understanding.',
      parameters: {
        path: { type: 'string', required: true, description: 'Absolute path to one local image file.' },
      },
      output: output(),
      execute: async (args) => {
        if (store === undefined) throw new Error('asset-storage-unavailable: this runtime has no local asset directory')
        const input = args as { path?: string }
        if (typeof input.path !== 'string' || input.path.length === 0) throw new Error('asset-path-required')
        const { asset, deduped } = await addAssetFromFile(state, store, input.path)
        return { ...metadata(asset), deduped }
      },
    }),

    defineTool({
      name: 'udt_material_visual',
      description:
        'Expose one locally stored course image to the current host agent as a tool-mediated image asset. ' +
        'Returns the exact content-addressed path; the agent may use its host Read/image tool to inspect the pixels. ' +
        'This does NOT itself prove vision support, OCR, or understanding: if the host cannot read images, say so. ' +
        'Never treat the returned path or a model description as learner evidence; material access is not mastery.',
      parameters: {
        assetId: { type: 'string', required: true, description: 'Asset id from udt_asset_list.' },
      },
      output: output(),
      execute: async (args) => {
        if (store === undefined) throw new Error('asset-storage-unavailable: this runtime has no local asset directory')
        const input = args as { assetId?: string }
        const asset = state.readAsset(input.assetId ?? '')
        if (asset === undefined) throw new Error('no-such-asset: read udt_asset_list')
        const path = join(store.root, asset.sha256.slice(0, 2), asset.sha256)
        if (!existsSync(path)) throw new Error('asset-file-missing')
        return {
          assetId: asset.id,
          path,
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          sha256: asset.sha256,
          bytes: asset.bytes,
          access: 'tool-mediated-host-image',
          caveat: 'The host agent must actually read the file with an image tool. A path alone is not visual understanding; no OCR is implied.',
        }
      },
    }),
  ]
}

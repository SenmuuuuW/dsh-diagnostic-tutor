/** Model-facing local asset metadata. Pixels are never sent to a model here. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { addAssetFromFile } from './assets.js'
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
  ]
}

/** Model-facing source ingestion: zero network, explicit local file or pasted text. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

import { addSource, sourceDraftFromFile, sourceDraftFromText } from './sources.js'
import type { UdState } from './state.js'

function output() {
  return { schema: { type: 'object', additionalProperties: true } as const, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function metadata(record: ReturnType<UdState['listSources']>[number]) {
  return { id: record.id, kind: record.kind, title: record.title, locator: record.locator, sha256: record.sha256, bytes: record.bytes, createdAt: record.createdAt, status: record.status }
}

export function sourceTools(state: UdState): ToolDefinition[] {
  return [
    defineTool({
      name: 'udt_source_add',
      description:
        'Add learner-owned source material before teaching from it. Use kind=file with an absolute path to one local .md/.markdown/.txt file, or kind=text/markdown with pasted text. ' +
        'The plugin reads only that explicit file and never scans a directory or fetches a URL; for a web page, use your own web tool and pass the extracted text with a locator. ' +
        'Content is stored locally in the udt storage domain. Identical content is deduplicated by SHA-256. ' +
        'After adding, cite passages on lesson blocks with sourceRefs; never invent a sourceId.',
      parameters: {
        kind: { type: 'string', required: true, enum: ['text', 'file', 'markdown'] },
        path: { type: 'string', description: 'Absolute path for kind=file. Never a directory or URL.' },
        text: { type: 'string', description: 'Text for kind=text/markdown.' },
        title: { type: 'string' },
        locator: { type: 'string', description: 'Original URL, path or human-readable location.' },
      },
      output: output(),
      execute: async (args) => {
        const input = args as { kind?: string; path?: string; text?: string; title?: string; locator?: string }
        if (input.kind !== 'text' && input.kind !== 'markdown' && input.kind !== 'file') throw new Error('source-kind-required: use text, markdown or file')
        const draft = input.kind === 'file'
          ? await sourceDraftFromFile(input.path ?? '')
          : sourceDraftFromText({ text: input.text ?? '', kind: input.kind, ...(input.title === undefined ? {} : { title: input.title }), ...(input.locator === undefined ? {} : { locator: input.locator }) })
        const { source, deduped } = await addSource(state, draft)
        return { ...metadata(source), deduped }
      },
    }),
    defineTool({
      name: 'udt_source_list',
      description: 'List learner-owned sources with metadata only. Never returns full content; use udt_source_get for a selected source.',
      parameters: {},
      output: output(),
      execute: async () => {
        const sources = state.listSources().map(metadata)
        return { count: sources.length, bytes: state.listSources().reduce((sum, source) => sum + source.bytes, 0), sources }
      },
    }),
    defineTool({
      name: 'udt_source_get',
      description: 'Read one learner-owned source by sourceId. This returns stored text for citation; it does not fetch anything.',
      parameters: { sourceId: { type: 'string', required: true } },
      output: output(),
      execute: async (args) => {
        const source = state.readSource((args as { sourceId?: string }).sourceId ?? '')
        if (source === undefined) throw new Error('no-such-source: read udt_source_list')
        return JSON.parse(JSON.stringify(source)) as Record<string, never>
      },
    }),
  ]
}

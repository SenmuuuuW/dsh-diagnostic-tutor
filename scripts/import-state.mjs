#!/usr/bin/env node
/**
 * Import a full dsh-diagnostic-tutor export into a local DSH storage root.
 * The current state is snapshotted before validation/import; a rejected import
 * leaves it untouched. Asset bytes are not in the state export; import image
 * files separately with the assets endpoint/reviewed flow.
 *
 * node scripts/import-state.mjs --root ~/.dsh/storages --file export.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import { openUdState } from '../lib/state.js'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
  if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]])
  return all
}, []))
if (!args.root || !args.file) { console.error('usage: node scripts/import-state.mjs --root <storages> --file <export.json>'); process.exit(2) }
const raw = await readFile(args.file, 'utf8')
const document = JSON.parse(raw)
const ctx = new Context()
await ctx.plugin(Storage)
await ctx.plugin(storageJson, { root: args.root })
await ctx.plugin(storageDomain, { backend: 'json' })
const state = await openUdState(ctx.get('storageDomain'))
const now = new Date().toISOString()
const backup = state.exportState(now)
await writeFile(`${args.file}.before-import-${Date.now()}.json`, JSON.stringify(backup, null, 2), { mode: 0o600 })
const imported = await state.importState(document, now)
console.log(JSON.stringify({ ok: true, courses: imported.courses.length, nodes: imported.nodes.length, lessons: imported.lessons.length, backup: `${args.file}.before-import-*.json` }))
await state.close()

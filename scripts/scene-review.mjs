#!/usr/bin/env node
/**
 * Local, human-only Scene review/approval CLI.
 *
 * Approve/revoke require an interactive TTY confirmation. There is intentionally
 * no HTTP approval route: DSH's loopback trust boundary is a machine boundary,
 * not a human identity boundary.
 */
import { createHash } from 'node:crypto'
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { validateSceneSpec, formatValidationErrors } from '../src/scene/spec.js'
import { visualLintScene } from '../src/scene/visual-lint.js'

const ENV = 'DSH_DIAGNOSTIC_TUTOR_SCENE_REGISTRY'
function registryPath() {
  if (process.env[ENV]) return resolve(process.env[ENV])
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(home, 'storages', 'diagnostic-tutor-approved-scenes.json')
}
function auditPath() { return registryPath() + '.audit.jsonl' }
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
}
function digest(spec, fallback) { return createHash('sha256').update(stable({ fallback, spec })).digest('hex') }
function argsOf(argv) {
  const positional = []; const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true } else positional.push(argv[i])
  }
  return { positional, flags }
}
async function readCandidate(file) {
  const raw = JSON.parse(await readFile(file, 'utf8'))
  if (raw?.type === 'scene') {
    const content = raw.content
    if (!content || typeof content !== 'object') throw new Error('scene block has no content')
    return { sceneVersion: content.sceneVersion ?? '1', spec: content.spec, fallback: content.fallback, title: raw.title ?? content.spec?.metadata?.title, id: raw.id, source: raw.source ?? file }
  }
  if (raw !== null && typeof raw === 'object' && raw.version !== undefined && raw.primitives !== undefined) {
    // Direct SceneSpec file: use its own fallback text when present.
    return { sceneVersion: '1', spec: raw, fallback: raw.fallback?.text ?? raw.metadata?.title ?? 'Review this scene before approval.', title: raw.metadata?.title, id: raw.metadata?.id, source: file }
  }
  if (raw !== null && typeof raw === 'object' && raw.spec !== undefined) {
    return { sceneVersion: raw.sceneVersion ?? '1', spec: raw.spec, fallback: raw.fallback, title: raw.title ?? raw.spec?.metadata?.title, id: raw.id, source: raw.source ?? file }
  }
  throw new Error('candidate must be a SceneSpec, {spec,fallback}, or scene block')
}
function inspect(candidate) {
  const validation = validateSceneSpec(candidate.spec)
  const visual = validation.ok ? visualLintScene(validation.spec) : { ok: false, diagnostics: [], stats: { primitiveCount: 0, frames: 0 } }
  return { validation, visual }
}
async function readRegistry() {
  const path = registryPath()
  if (!existsSync(path)) return { version: 1, scenes: [] }
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) { throw new Error(`cannot parse registry ${path}: ${error.message}`) }
}
async function writeRegistry(document) {
  const path = registryPath(); await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(document, null, 2) + '\n', { mode: 0o600 })
  await chmod(temp, 0o600); await rename(temp, path)
}
async function audit(event, fields) {
  const path = auditPath(); await mkdir(dirname(path), { recursive: true })
  await appendFile(path, JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 })
}
async function confirm(question) {
  if (!stdin.isTTY) throw new Error('interactive TTY required: approval/revocation must be confirmed by a human in a terminal')
  const rl = createInterface({ input: stdin, output: stdout })
  try { const answer = await rl.question(question); return answer.trim() === 'APPROVE' } finally { rl.close() }
}
function printInspection(candidate, result) {
  console.log(JSON.stringify({ id: candidate.id ?? null, title: candidate.title ?? null, digest: result.validation.ok ? digest(result.validation.spec, candidate.fallback) : null, validation: result.validation.ok ? { ok: true } : { ok: false, errors: result.validation.errors }, visual: result.visual, fallback: candidate.fallback }, null, 2))
}

const { positional, flags } = argsOf(process.argv.slice(2))
const command = positional[0]
if (command === 'lint') {
  const candidate = await readCandidate(positional[1])
  const result = inspect(candidate); printInspection(candidate, result)
  process.exitCode = result.validation.ok && result.visual.ok ? 0 : 1
} else if (command === 'approve') {
  const candidate = await readCandidate(positional[1]); const result = inspect(candidate)
  if (!result.validation.ok) { console.error(formatValidationErrors(result.validation.errors)); process.exitCode = 2 }
  else if (!result.visual.ok) { console.error('visual errors block approval:\n' + result.visual.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => `- ${entry.code}: ${entry.message}`).join('\n')); process.exitCode = 2 }
  else {
    const warnings = result.visual.diagnostics.filter((entry) => entry.severity === 'warning')
    if (warnings.length > 0 && flags['ack-warnings'] !== true) { console.error(`approval requires --ack-warnings after reviewing ${warnings.length} warning(s):\n` + warnings.map((entry) => `- ${entry.code}: ${entry.message}`).join('\n')); process.exitCode = 2 }
    else if (typeof flags.reviewer !== 'string' || flags.reviewer.length === 0) { console.error('--reviewer is required'); process.exitCode = 2 }
    else {
      const document = await readRegistry(); const sceneDigest = digest(result.validation.spec, candidate.fallback)
      const entry = { id: candidate.id ?? `scene-${sceneDigest.slice(0, 12)}`, title: candidate.title ?? 'Untitled reviewed scene', spec: result.validation.spec, fallback: candidate.fallback, digest: sceneDigest, approvedAt: new Date().toISOString(), reviewer: flags.reviewer, ...(typeof flags.note === 'string' ? { note: flags.note } : {}), source: candidate.source, warningsAcknowledged: warnings.length > 0 }
      console.log(`Candidate: ${entry.id}\nDigest: ${entry.digest}\nWarnings: ${warnings.length}\nRegistry: ${registryPath()}`)
      if (!(await confirm('Type APPROVE to write this human approval: '))) { console.error('not approved'); process.exitCode = 3 }
      else {
        const scenes = (Array.isArray(document.scenes) ? document.scenes : []).filter((existing) => existing.id !== entry.id); scenes.push(entry)
        await writeRegistry({ version: 1, scenes }); await audit('approve', { id: entry.id, digest: entry.digest, reviewer: entry.reviewer, warnings: warnings.length }); console.log('approved locally')
      }
    }
  }
} else if (command === 'revoke') {
  const id = positional[1]; if (!id) throw new Error('usage: revoke <scene-id> --reviewer NAME')
  const document = await readRegistry(); const existing = document.scenes.find((scene) => scene.id === id); if (!existing) throw new Error(`no approved scene "${id}"`)
  if (!(await confirm(`Type APPROVE to revoke ${id}: `))) { console.error('not revoked'); process.exitCode = 3 }
  else { await writeRegistry({ version: 1, scenes: document.scenes.filter((scene) => scene.id !== id) }); await audit('revoke', { id, digest: existing.digest, reviewer: typeof flags.reviewer === 'string' ? flags.reviewer : null }); console.log('revoked locally') }
} else if (command === 'list') {
  const document = await readRegistry(); console.log(`registry: ${registryPath()}`)
  for (const scene of document.scenes ?? []) console.log(`${scene.id}\t${scene.digest.slice(0, 12)}\t${scene.reviewer}\t${scene.approvedAt}\t${scene.title}`)
} else if (command === 'verify') {
  const document = await readRegistry(); let bad = 0
  for (const scene of document.scenes ?? []) {
    const validation = validateSceneSpec(scene.spec); const visual = validation.ok ? visualLintScene(validation.spec) : null; const expected = validation.ok ? digest(validation.spec, scene.fallback) : null
    const ok = validation.ok && visual?.ok === true && expected === scene.digest; if (!ok) bad += 1
    console.log(`${ok ? 'OK ' : 'BAD'} ${scene.id} ${expected === scene.digest ? 'digest-match' : 'digest-mismatch'}${visual?.ok === false ? ' visual-errors' : ''}`)
  }
  process.exitCode = bad === 0 ? 0 : 1
} else {
  console.error(`usage:
  node scripts/scene-review.mjs lint <candidate.json>
  node scripts/scene-review.mjs approve <candidate.json> --reviewer NAME [--note TEXT] [--ack-warnings]
  node scripts/scene-review.mjs list
  node scripts/scene-review.mjs verify
  node scripts/scene-review.mjs revoke <scene-id> --reviewer NAME`)
  process.exitCode = 2
}

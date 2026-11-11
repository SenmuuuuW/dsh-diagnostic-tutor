#!/usr/bin/env node
/** Human-only local review of AI Scene Candidates. No HTTP approval route. */
import { createHash } from 'node:crypto'
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { readCandidate, updateCandidate, listCandidates } from '../lib/scene/candidates.js'
import { validateSceneSpec } from '../lib/scene/spec.js'
import { visualLintScene } from '../lib/scene/visual-lint.js'
import { sceneDigest } from '../lib/scene/approval.js'

const ENV = 'DSH_DIAGNOSTIC_TUTOR_SCENE_REGISTRY'
function registryPath() { if (process.env[ENV]) return process.env[ENV]; return join(process.env.DSH_HOME || join(process.env.HOME || '.', '.dsh'), 'storages', 'diagnostic-tutor-approved-scenes.json') }
function auditPath() { return registryPath() + '.audit.jsonl' }
async function confirm(q) { if (!stdin.isTTY) throw new Error('interactive TTY required'); const rl = createInterface({ input: stdin, output: stdout }); try { return (await rl.question(q)).trim() === 'APPROVE' } finally { rl.close() } }
async function writeRegistry(scene) { const path = registryPath(); await mkdir(dirname(path), { recursive: true }); const doc = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : { version: 1, scenes: [] }; const scenes = (doc.scenes ?? []).filter((entry) => entry.id !== scene.id); scenes.push(scene); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, JSON.stringify({ version: 1, scenes }, null, 2) + '\n', { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, path) }
async function audit(event, fields) { await mkdir(dirname(auditPath()), { recursive: true }); await appendFile(auditPath(), JSON.stringify({ at: new Date().toISOString(), event, ...fields }) + '\n', { mode: 0o600 }) }
const [command, id] = process.argv.slice(2).filter((value) => !value.startsWith('--'))
const flags = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1] && !list[index + 1].startsWith('--') ? list[index + 1] : true]); return all }, []))
if (command === 'list') { for (const c of await listCandidates()) console.log(`${c.id}\t${c.status}\t${c.request.courseId}\t${c.request.teachingObjective.slice(0, 80)}`) }
else if (command === 'show') { const c = await readCandidate(id); if (!c) throw new Error('unknown candidate'); console.log(JSON.stringify({ id: c.id, status: c.status, request: c.request, validation: c.validation, review: c.review, attached: c.attached, exp: c.expiresAt }, null, 2)) }
else if (command === 'approve') {
  const c = await readCandidate(id); if (!c) throw new Error('unknown candidate'); if (c.status !== 'needs-review') throw new Error(`candidate-not-reviewable: ${c.status}`); if (!c.generation) throw new Error('candidate-has-no-generation')
  const validation = validateSceneSpec(c.generation.spec); if (!validation.ok) throw new Error('candidate-invalid'); const visual = visualLintScene(validation.spec); if (!visual.ok) throw new Error('candidate-visual-errors'); const warnings = visual.diagnostics.filter((e) => e.severity === 'warning'); if (warnings.length && flags['ack-warnings'] !== true) throw new Error(`candidate warnings require --ack-warnings: ${warnings.length}`); if (typeof flags.reviewer !== 'string' || flags.reviewer.length === 0) throw new Error('--reviewer is required'); const digest = sceneDigest({ spec: validation.spec, fallback: c.generation.fallback }); if (!digest) throw new Error('candidate digest unavailable')
  console.log(`Candidate: ${c.id}\nDigest: ${digest}\nWarnings: ${warnings.length}`); if (!(await confirm('Type APPROVE to approve this candidate: '))) { console.error('not approved'); process.exit(3) }
  const updated = await updateCandidate(c.id, (current) => ({ ...current, status: 'approved', revision: current.revision + 1, review: { reviewer: flags.reviewer, ...(typeof flags.note === 'string' ? { note: flags.note } : {}), approvedAt: new Date().toISOString(), digest, warningsAcknowledged: warnings.length > 0 } }))
  await writeRegistry({ id: `candidate-${c.id}`, title: c.request.teachingObjective.slice(0, 200), spec: validation.spec, fallback: c.generation.fallback, digest, approvedAt: updated.review.approvedAt, reviewer: updated.review.reviewer, ...(updated.review.note ? { note: updated.review.note } : {}), source: `candidate:${c.id}`, warningsAcknowledged: warnings.length > 0 }); await audit('candidate.approve', { candidateId: c.id, digest, reviewer: flags.reviewer, warnings: warnings.length }); console.log('approved')
}
else if (command === 'reject' || command === 'revoke') { const c = await readCandidate(id); if (!c) throw new Error('unknown candidate'); if (command === 'reject' && c.status !== 'needs-review') throw new Error(`candidate-not-reviewable: ${c.status}`); if (command === 'revoke' && c.status !== 'approved' && c.status !== 'attached') throw new Error(`candidate-not-revocable: ${c.status}`); if (!(await confirm(`Type APPROVE to ${command} ${c.id}: `))) { console.error('not changed'); process.exit(3) } await updateCandidate(c.id, (current) => ({ ...current, status: command === 'reject' ? 'rejected' : 'revoked', revision: current.revision + 1, ...(command === 'reject' ? { rejectedAt: new Date().toISOString() } : { revokedAt: new Date().toISOString() }) })); await audit(`candidate.${command}`, { candidateId: c.id }); console.log(command === 'reject' ? 'rejected' : 'revoked') }
else { console.error('usage: scene-candidate-review.mjs list|show|approve|reject|revoke [id] [--reviewer NAME] [--note TEXT] [--ack-warnings]'); process.exit(2) }

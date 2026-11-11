#!/usr/bin/env node
/**
 * Controlled development bridge: attach a validated SceneSpec to a Candidate
 * request. The generator is external (research pipeline); this worker never
 * approves and never writes a lesson.
 *
 * node scripts/scene-candidate-worker.mjs --candidate scn-... --scene candidate.json
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { recordGeneratedCandidate, readCandidate } from '../lib/scene/candidates.js'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]); return all }, []))
const candidateId = args.candidate; const scenePath = args.scene
if (!candidateId || !scenePath) { console.error('usage: --candidate <id> --scene <json>'); process.exit(2) }
const candidate = await readCandidate(candidateId)
if (!candidate) throw new Error(`unknown candidate ${candidateId}`)
const raw = JSON.parse(await readFile(scenePath, 'utf8'))
const spec = raw.spec ?? raw
const fallback = raw.fallback?.text ?? raw.fallback
if (typeof fallback !== 'string' || fallback.length === 0) throw new Error('scene file needs a fallback string')
const updated = await recordGeneratedCandidate(candidateId, {
  attemptId: `worker-${Date.now()}`, contractVersion: 'v4', spec, fallback,
  inputHash: createHash('sha256').update(JSON.stringify(candidate.request)).digest('hex'),
  outputHash: createHash('sha256').update(JSON.stringify(spec)).digest('hex'),
  repairHistory: [],
})
console.log(JSON.stringify({ candidateId: updated.id, status: updated.status, digest: updated.validation?.digest, visualOk: updated.validation?.visual?.ok, warnings: updated.validation?.visual?.diagnostics?.filter((entry) => entry.severity === 'warning').length }, null, 2))

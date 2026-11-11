#!/usr/bin/env node
/**
 * Experimental local queue worker for Scene Candidates.
 *
 * DSH does not currently expose a background model-execution service to a plugin.
 * The worker therefore polls the local Candidate store and invokes an explicitly
 * configured generation command. It never approves, attaches, or writes evidence.
 *
 *   DSH_SCENE_GENERATOR_COMMAND='node my-generator.mjs' \
 *   node scripts/scene-candidate-worker-daemon.mjs --once
 *
 * Command contract:
 *   <command> --candidate <request.json> --output <scene.json>
 * The command must write {spec,fallback} or a raw SceneSpec with fallback.text.
 * Exit non-zero on failure. Timeout defaults to 10 minutes.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { readCandidate, listCandidates, recordGeneratedCandidate, updateCandidate } from '../lib/scene/candidates.js'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]); return all }, []))
const once = args.once === true || process.argv.includes('--once')
const intervalMs = Number(args.interval ?? process.env.DSH_SCENE_WORKER_INTERVAL_MS ?? 2000)
const timeoutMs = Number(process.env.DSH_SCENE_WORKER_TIMEOUT_MS ?? 10 * 60 * 1000)
const commandSpec = process.env.DSH_SCENE_GENERATOR_COMMAND
const workRoot = process.env.DSH_SCENE_WORKER_DIR ?? '/tmp/udt-scene-worker'
mkdirSync(workRoot, { recursive: true })
const started = new Set()

function runCommand(candidate) {
  if (!commandSpec) return Promise.reject(new Error('DSH_SCENE_GENERATOR_COMMAND is not configured; automatic generation is unavailable'))
  const input = join(workRoot, `${candidate.id}.request.json`)
  const output = join(workRoot, `${candidate.id}.scene.json`)
  writeFileSync(input, JSON.stringify({ candidateId: candidate.id, ...candidate.request }, null, 2))
  rmSync(output, { force: true })
  const parts = commandSpec.split(/\s+/)
  return new Promise((resolve, reject) => {
    const child = spawn(parts[0], [...parts.slice(1), '--candidate', input, '--output', output], { stdio: 'ignore', env: process.env })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`generation-timeout after ${timeoutMs}ms`)) }, timeoutMs)
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`generator-exit-${code}`))
      if (!existsSync(output)) return reject(new Error('generator-produced-no-output'))
      try {
        const raw = JSON.parse(readFileSync(output, 'utf8'))
        const spec = raw.spec ?? raw
        const fallback = raw.fallback?.text ?? raw.fallback ?? spec.fallback?.text
        if (typeof fallback !== 'string' || fallback.length === 0) throw new Error('generator-output-has-no-fallback')
        resolve({ spec, fallback })
      } catch (error) { reject(error) }
    })
  })
}

async function tick() {
  const candidates = (await listCandidates()).filter((candidate) => candidate.status === 'requested')
  for (const candidate of candidates) {
    if (started.has(candidate.id)) continue
    started.add(candidate.id)
    try {
      const claimed = await updateCandidate(candidate.id, (current) => {
        if (current.status !== 'requested') throw new Error(`candidate-not-requested: ${current.status}`)
        return { ...current, status: 'generating', revision: current.revision + 1 }
      })
      console.log(JSON.stringify({ event: 'generation.start', candidateId: claimed.id }))
      const generated = await runCommand(claimed)
      await recordGeneratedCandidate(claimed.id, { contractVersion: 'worker', spec: generated.spec, fallback: generated.fallback, repairHistory: [] })
      console.log(JSON.stringify({ event: 'generation.needs-review', candidateId: claimed.id }))
    } catch (error) {
      console.error(JSON.stringify({ event: 'generation.failed', candidateId: candidate.id, error: String(error) }))
      try { await updateCandidate(candidate.id, (current) => current.status === 'generating' ? { ...current, status: 'failed', revision: current.revision + 1, failure: String(error) } : current) } catch {}
    } finally { started.delete(candidate.id) }
  }
}

await tick()
if (!once) { setInterval(() => { void tick() }, intervalMs) }

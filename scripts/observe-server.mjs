/**
 * Server-side observer: you drive your own browser, this watches the server.
 *
 * The browser-driving version of this smoke never worked, for reasons that were
 * never the plugin's: a workspace picker where a composer was expected, session
 * rows that shift under a collapsing group header, sessions that are not
 * addressable by URL, and a Lexical editor whose insertText silently fails if
 * it is not settled first.
 *
 * None of that is needed to answer the actual release question. Every fact the
 * gate depends on is already written down on the server:
 *
 *   which session an action went to   handoffs[node].sessionId, written from
 *                                     the POST /focus body itself
 *   what the tutor decided            next_steps[fromNode], read via /overview
 *   where the learner is              focus[course].nodeId
 *   whether a lesson arrived          lessons, via /lesson?nodeId=
 *   whether the plugin misbehaved     HTTP status and handoff.failureReason
 *
 * So this polls the plugin API and the store on an interval and writes a
 * timeline. It opens no browser, clicks nothing, and types nothing. You use the
 * DSH window you already have.
 *
 * Usage:
 *   node scripts/observe-server.mjs <url-with-token> [minutes] [storePath]
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2]
const minutes = Number(process.argv[3] ?? 45)
const storePath = process.argv[4] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/observe-server'
if (!url) {
  console.error('usage: node scripts/observe-server.mjs <url-with-token> [minutes] [storePath]')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const logPath = join(outDir, 'timeline.log')
writeFileSync(logPath, '')

const base = new URL(url).origin
const t0 = Date.now()
const log = (m) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s] ${m}`
  console.log(line)
  appendFileSync(logPath, `${line}\n`)
}

const record = { focusEvents: [], snapshots: [], lessons: {}, problems: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Read the store, tolerating a write in flight. */
function readStore() {
  try {
    return JSON.parse(readFileSync(storePath, 'utf8'))
  } catch {
    return null
  }
}

/** The persisted handoffs, which is where a POST /focus sessionId lands. */
function handoffIndex(doc) {
  const out = {}
  for (const [node, h] of Object.entries(doc?.tables?.handoffs ?? {})) {
    out[node] = {
      status: h.status,
      attempts: h.attempts,
      sessionId: h.sessionId ?? null,
      requestedAt: h.requestedAt,
      lessonAt: h.lessonAt ?? null,
      failureReason: h.failureReason ?? null,
    }
  }
  return out
}

async function api(path) {
  const r = await fetch(`${base}/diagnostic-tutor/api${path}`, { signal: AbortSignal.timeout(8000) })
  if (!r.ok) {
    record.problems.push({ at: new Date().toISOString(), problem: `${r.status} ${path}` })
    return null
  }
  return r.json()
}

log(`observing ${base} — drive your own DSH window; this only reads`)
log(`store: ${storePath}`)

let prevHandoffs = {}
let prevFocus = null
let prevNext = null
let prevLessons = 0
let lastHeartbeat = 0
const seenLessons = new Set()

const deadline = Date.now() + minutes * 60_000
while (Date.now() < deadline) {
  const doc = readStore()
  const overview = await api('/overview')

  if (doc !== null) {
    const handoffs = handoffIndex(doc)

    // A new or changed handoff is the record of a POST /focus. This is the
    // network evidence, read from where the server wrote it.
    for (const [node, h] of Object.entries(handoffs)) {
      const before = prevHandoffs[node]
      if (before === undefined || JSON.stringify(before) !== JSON.stringify(h)) {
        record.focusEvents.push({ at: new Date().toISOString(), node, ...h })
        log(`FOCUS  node=${node.slice(-28)}`)
        log(`       sessionId=${h.sessionId}  attempts=${h.attempts}  status=${h.status}`)
        if (h.failureReason !== null) log(`       failureReason=${h.failureReason}`)
      }
    }
    prevHandoffs = handoffs

    const lessonCount = Object.keys(doc.tables.lessons ?? {}).length
    if (lessonCount !== prevLessons) {
      prevLessons = lessonCount
      log(`LESSONS now ${lessonCount}`)
    }
  }

  if (overview !== null) {
    const focus = overview.focus?.nodeId ?? null
    const next = overview.nextStep
    const handoff = overview.handoff

    if (focus !== prevFocus) {
      log(`FOCUS MOVED → ${focus ?? '(none)'}`)
      prevFocus = focus
      record.snapshots.push({ at: new Date().toISOString(), event: 'focus', focus })
    }
    const nextKey = next === null ? null : `${next.action}|${next.fromNodeId}|${next.targetNodeId}`
    if (nextKey !== prevNext) {
      if (next !== null) {
        log(`DECISION ${next.action}  from=${next.fromNodeId.slice(-26)}  target=${next.targetNodeId?.slice(-26) ?? '(stay)'}`)
      } else if (prevNext !== null) {
        log('DECISION consumed (card cleared)')
      }
      prevNext = nextKey
      record.snapshots.push({ at: new Date().toISOString(), event: 'decision', next })
    }
    if (handoff !== null && handoff.phase !== undefined) {
      const key = `${handoff.targetNodeId}|${handoff.phase}|${handoff.attempts}`
      if (record.lastHandoffKey !== key) {
        record.lastHandoffKey = key
        log(`HANDOFF ${handoff.phase} attempts=${handoff.attempts} target=${handoff.targetNodeId.slice(-24)}`)
      }
    }

    // A lesson is the proof a Continue actually finished.
    for (const node of overview.nodes ?? []) {
      if (seenLessons.has(node.id)) continue
      const body = await api(`/lesson?nodeId=${encodeURIComponent(node.id)}`)
      if (body?.lesson) {
        seenLessons.add(node.id)
        record.lessons[node.id] = { title: body.lesson.title, blocks: body.lesson.blocks.length, at: new Date().toISOString() }
        log(`LESSON "${body.lesson.title}" on ${node.id.slice(-26)} (${body.lesson.blocks.length} blocks)`)
      }
    }
  }

  // A quiet heartbeat, so an empty log means "nothing happened" rather than
  // "the observer died".
  if (Date.now() - lastHeartbeat > 60_000) {
    lastHeartbeat = Date.now()
    const doc = readStore()
    log(
      `… alive | focus=${prevFocus?.slice(-22) ?? 'null'} | ` +
      `lessons=${doc === null ? '?' : Object.keys(doc.tables.lessons ?? {}).length} | ` +
      `decisions=${doc === null ? '?' : Object.keys(doc.tables.next_steps ?? {}).length}`,
    )
  }

  writeFileSync(join(outDir, 'record.json'), JSON.stringify(record, null, 1))
  await sleep(3000)
}

log('observation window closed')
writeFileSync(join(outDir, 'record.json'), JSON.stringify(record, null, 1))

console.log('\n=== OBSERVED ===')
console.log(`focus events (POST /focus, read from the store): ${record.focusEvents.length}`)
for (const e of record.focusEvents) {
  console.log(`  ${e.at}  session=${e.sessionId}  node=${e.node}  attempts=${e.attempts}  status=${e.status}`)
}
console.log(`lessons seen: ${Object.keys(record.lessons).length}`)
for (const [node, l] of Object.entries(record.lessons)) console.log(`  ${node}: ${l.title}`)
console.log(`problems: ${record.problems.length}`)
for (const p of record.problems.slice(0, 8)) console.log(`  ${p.problem}`)

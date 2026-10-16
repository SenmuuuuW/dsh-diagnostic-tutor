/**
 * Observer mode: a human drives, this only watches.
 *
 * Everything this used to do to the DSH UI has been removed, because every one
 * of those attempts failed for a reason that had nothing to do with the plugin:
 *
 *   New Session opens a workspace picker, so there is no composer after it
 *   the session list interleaves a workspace header per group with the rows
 *     beneath it, so no fixed index survives
 *   clicking a header collapses its group and reshuffles later indices
 *   session selection is not addressable — the URL stays '/' across switches
 *   the composer is a Lexical contenteditable whose insertText is timing-
 *     sensitive, so typing can silently go nowhere
 *   document.body.innerText spans the sidebar too, so it cannot say which
 *     conversation is on screen
 *
 * So this script navigates nothing, types nothing and clicks nothing. It
 * records what the runtime did while a person used the product, and the
 * verdicts come from the network, the API and the store — not from a selector.
 *
 * Usage:
 *   node scripts/observe-smoke.mjs <url-with-token> [minutes] [storePath]
 */

import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9411
const url = process.argv[2]
const minutes = Number(process.argv[3] ?? 45)
const storePath = process.argv[4] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/observe-smoke'
if (!url) {
  console.error('usage: node scripts/observe-smoke.mjs <url-with-token> [minutes] [storePath]')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const logPath = join(outDir, 'timeline.log')
const t0 = Date.now()
const log = (m) => {
  const line = `[${((Date.now() - t0) / 1000).toFixed(0).padStart(5)}s] ${m}`
  console.log(line)
  appendFileSync(logPath, `${line}\n`)
}

const apiBase = new URL(url).origin
const record = {
  startedAt: new Date().toISOString(),
  focusPosts: [],
  api: [],
  problems: [],
  store: [],
  screenshots: [],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Observer {
  #socket
  #next = 1
  #pending = new Map()
  #shots = 0

  static async attach(port) {
    for (let a = 0; a < 80; a += 1) {
      try {
        const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const p = t.find((x) => x.type === 'page')
        if (p?.webSocketDebuggerUrl) {
          const o = new Observer()
          await o.#open(p.webSocketDebuggerUrl)
          return o
        }
      } catch { /* starting */ }
      await sleep(250)
    }
    throw new Error('could not attach to Chrome')
  }

  #open(ws) {
    return new Promise((res, rej) => {
      this.#socket = new WebSocket(ws)
      this.#socket.addEventListener('open', () => res())
      this.#socket.addEventListener('error', rej)
      this.#socket.addEventListener('message', (e) => {
        const m = JSON.parse(e.data)
        this.#handle(m)
        const q = this.#pending.get(m.id)
        if (!q) return
        this.#pending.delete(m.id)
        if (m.error) q.reject(new Error(JSON.stringify(m.error)))
        else q.resolve(m.result)
      })
    })
  }

  #handle(m) {
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params.request.url
      if (!u.includes('/diagnostic-tutor/api/')) return
      const path = u.split('/api/')[1] ?? ''
      const method = m.params.request.method
      if (method === 'POST') {
        let body = null
        try { body = JSON.parse(String(m.params.request.postData ?? 'null')) } catch { /* not json */ }
        const entry = { at: new Date().toISOString(), path, body }
        record.focusPosts.push(entry)
        log(`POST ${path} ${JSON.stringify(body)}`)
        if (path === 'focus' && body?.sessionId) {
          log(`  ^ sessionId = ${body.sessionId}  nodeId = ${body.nodeId}`)
        }
        void this.#screenshot(`post-${path.replace(/\//g, '-')}-${++this.#shots}`)
      } else {
        log(`GET  ${path}`)
      }
      return
    }
    if (m.method === 'Network.responseReceived') {
      const { status, url: u } = m.params.response
      if (u.includes('/diagnostic-tutor/') && status >= 400) {
        const problem = `${status} ${u.split('/api/')[1] ?? u}`
        record.problems.push({ at: new Date().toISOString(), kind: 'http', problem })
        log(`!! HTTP ${problem}`)
      }
      return
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)
      record.problems.push({ at: new Date().toISOString(), kind: 'console', problem: text })
      log(`!! console.error ${text}`)
      return
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const text = String(m.params.exceptionDetails?.text ?? '').slice(0, 200)
      record.problems.push({ at: new Date().toISOString(), kind: 'exception', problem: text })
      log(`!! exception ${text}`)
    }
  }

  send(method, params = {}) {
    const id = this.#next++
    return new Promise((res, rej) => {
      this.#pending.set(id, { resolve: res, reject: rej })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async #screenshot(name) {
    try {
      const shot = await this.send('Page.captureScreenshot', { format: 'png' })
      const file = join(outDir, `${String(this.#shots).padStart(3, '0')}-${name}.png`)
      writeFileSync(file, Buffer.from(shot.data, 'base64'))
      record.screenshots.push(file)
    } catch { /* transient */ }
  }

  async screenshotNow(name) {
    this.#shots += 1
    await this.#screenshot(name)
  }
}

/** One poll of the plugin's own API — the persisted truth as the UI sees it. */
async function pollApi() {
  try {
    const r = await fetch(`${apiBase}/diagnostic-tutor/api/overview`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return
    const d = await r.json()
    const snap = {
      at: new Date().toISOString(),
      course: d.course?.title ?? null,
      nodeCount: (d.nodes ?? []).length,
      focus: d.focus?.nodeId ?? null,
      nextStep: d.nextStep
        ? { action: d.nextStep.action, from: d.nextStep.fromNodeId, target: d.nextStep.targetNodeId }
        : null,
      handoff: d.handoff
        ? { phase: d.handoff.phase, attempts: d.handoff.attempts, target: d.handoff.targetNodeId, elapsedMs: d.handoff.elapsedMs }
        : null,
    }
    const prev = record.api.at(-1)
    if (prev === undefined || JSON.stringify({ ...prev, at: undefined }) !== JSON.stringify({ ...snap, at: undefined })) {
      record.api.push(snap)
      log(
        `api focus=${snap.focus?.slice(-24) ?? 'null'} nodes=${snap.nodeCount} ` +
        `next=${snap.nextStep ? `${snap.nextStep.action}→${snap.nextStep.target?.slice(-18) ?? 'stay'}` : 'null'} ` +
        `handoff=${snap.handoff ? `${snap.handoff.phase}(${snap.handoff.attempts})` : 'null'}`,
      )
    }
  } catch { /* server busy or restarting */ }
}

/** One snapshot of the store — the persisted truth on disk. */
function pollStore() {
  try {
    const d = JSON.parse(readFileSync(storePath, 'utf8'))
    const snap = {
      at: new Date().toISOString(),
      lessons: Object.keys(d.tables.lessons ?? {}).length,
      decisions: Object.keys(d.tables.next_steps ?? {}).length,
      handoffs: Object.fromEntries(
        Object.entries(d.tables.handoffs ?? {}).map(([k, v]) => [k.slice(-24), { s: v.status, a: v.attempts, sid: (v.sessionId ?? '').slice(0, 20) }]),
      ),
      focus: Object.fromEntries(
        Object.entries(d.tables.focus ?? {}).map(([k, v]) => [k, { node: v.nodeId.slice(-24), status: v.status, nextStepId: v.nextStepId?.slice(-24) ?? null }]),
      ),
    }
    const prev = record.store.at(-1)
    if (prev === undefined || JSON.stringify({ ...prev, at: undefined }) !== JSON.stringify({ ...snap, at: undefined })) {
      record.store.push(snap)
      log(`store lessons=${snap.lessons} decisions=${snap.decisions}`)
    }
  } catch { /* mid-write */ }
}

const profile = await mkdtemp(join(tmpdir(), 'dt-observe-'))
log('launching a VISIBLE Chrome window — drive the journey in it')
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,1000',
    '--new-window',
    url,
  ],
  { stdio: 'ignore', detached: false },
)

const observer = await Observer.attach(PORT)
await observer.send('Page.enable')
await observer.send('Runtime.enable')
await observer.send('Network.enable')
log('observer attached; recording network, API, store, console and screenshots')

const deadline = Date.now() + minutes * 60_000
let lastShot = 0
while (Date.now() < deadline) {
  await sleep(3000)
  await pollApi()
  pollStore()
  // A picture every two minutes, plus one per request, so the UI half of the
  // evidence exists without anyone having to remember to take it.
  if (Date.now() - lastShot > 120_000) {
    lastShot = Date.now()
    await observer.screenshotNow('periodic')
  }
  writeFileSync(join(outDir, 'record.json'), JSON.stringify(record, null, 1))
}

log('observation window closed')
writeFileSync(join(outDir, 'record.json'), JSON.stringify(record, null, 1))
console.log('\n=== OBSERVED ===')
console.log(`POST /focus requests: ${record.focusPosts.filter((p) => p.path === 'focus').length}`)
for (const p of record.focusPosts.filter((x) => x.path === 'focus')) {
  console.log(`  ${p.at} session=${p.body?.sessionId} node=${p.body?.nodeId}`)
}
console.log(`problems: ${record.problems.length}`)
for (const p of record.problems.slice(0, 10)) console.log(`  ${p.kind}: ${p.problem}`)
console.log(`screenshots: ${record.screenshots.length} in ${outDir}`)
console.log(`api snapshots: ${record.api.length}, store snapshots: ${record.store.length}`)
chrome.kill('SIGTERM')

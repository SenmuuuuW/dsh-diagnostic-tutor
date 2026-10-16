/**
 * The Retry gate, in an isolated DSH home.
 *
 * Retry has two triggers: `failed` (the prompt could not be delivered) and
 * `stalled` (derived — the record stopped moving for STALL_AFTER_MS).
 *
 * `failed` is NOT reachable through the normal UI: the panel always targets the
 * conversation the learner is looking at, and DSH gives the active conversation
 * an agent eagerly, so `promptSession` always finds one. Getting `prompted:
 * false` needs a session with no agent while the registry holds something other
 * than exactly one — a state the product does not put a learner in. That was
 * tried first and produced `working`, which is the honest result.
 *
 * So this drives the `stalled` path, produced by real runtime behaviour: start
 * a turn, press DSH's own **Stop generating**, and the tutor never writes a
 * lesson. The handoff stops moving, and after the real STALL_AFTER_MS the
 * runtime derives `stalled` on its own. The production timeout is not shortened
 * to make this pass.
 *
 * Nothing is mocked. The stall is real, the record is read from the store, and
 * the retry is a real click that sends a real request.
 *
 * Usage:
 *   node scripts/e2e-retry.mjs <url-with-token> [storePath]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9351
const url = process.argv[2]
const storePath = process.argv[3] ?? '/tmp/udt-iso/storages/udt.json'
const outDir = '/tmp/e2e-retry'
if (!url) {
  console.error('usage: node scripts/e2e-retry.mjs <url-with-token> [storePath]')
  process.exit(2)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(outDir, { recursive: true })
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const apiBase = new URL(url).origin
const overview = async () => (await fetch(`${apiBase}/diagnostic-tutor/api/overview`)).json()

/** The persisted handoff records, read from the isolated store. */
async function storeHandoffs() {
  const doc = JSON.parse(await readFile(storePath, 'utf8'))
  return doc.tables.handoffs ?? {}
}
async function storeFocus() {
  const doc = JSON.parse(await readFile(storePath, 'utf8'))
  return doc.tables.focus ?? {}
}
async function storeNextSteps() {
  const doc = JSON.parse(await readFile(storePath, 'utf8'))
  return doc.tables.next_steps ?? {}
}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #focusPosts = []
  static async attach(port) {
    for (let a = 0; a < 60; a += 1) {
      try {
        const t = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const p = t.find((x) => x.type === 'page')
        if (p?.webSocketDebuggerUrl) {
          const c = new Cdp()
          await c.#open(p.webSocketDebuggerUrl)
          return c
        }
      } catch { /* starting */ }
      await sleep(250)
    }
    throw new Error('could not attach')
  }
  #open(ws) {
    return new Promise((res, rej) => {
      this.#socket = new WebSocket(ws)
      this.#socket.addEventListener('open', () => res())
      this.#socket.addEventListener('error', rej)
      this.#socket.addEventListener('message', (e) => {
        const m = JSON.parse(e.data)
        if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/focus')) {
          this.#focusPosts.push({
            body: String(m.params.request.postData ?? ''),
            at: Date.now(),
          })
        }
        const q = this.#pending.get(m.id)
        if (!q) return
        this.#pending.delete(m.id)
        if (m.error) q.reject(new Error(JSON.stringify(m.error)))
        else q.resolve(m.result)
      })
    })
  }
  send(method, params = {}) {
    const id = this.#next++
    return new Promise((res, rej) => {
      this.#pending.set(id, { resolve: res, reject: rej })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result?.value
  }
  takeFocusPosts() { const f = [...this.#focusPosts]; this.#focusPosts = []; return f }
  close() { this.#socket?.close() }
}

const transcript = (cdp) =>
  cdp.evaluate(`document.body.innerText.length + ':' + document.body.innerText.slice(-300)`)

async function turnFinished(cdp, before, timeoutMs = 600_000) {
  const deadline = Date.now() + timeoutMs
  let last = before
  let lastChange = Date.now()
  let grew = false
  while (Date.now() < deadline) {
    await sleep(1500)
    const now = await transcript(cdp)
    if (now !== last) { last = now; lastChange = Date.now(); grew = true; continue }
    if (grew && Date.now() - lastChange > 9000) return true
  }
  return false
}

async function say(cdp, text) {
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(400)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

const openLearn = (cdp) => cdp.evaluate(`(() => {
  const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
  if (!hit) return false;
  hit.click();
  return true;
})()`)

/** The handoff line as the learner sees it, including the retry button. */
const readHandoffUi = (cdp) => cdp.evaluate(`(() => {
  const line = document.querySelector('.dt-handoff');
  if (!line) return null;
  const retry = line.querySelector('.dt-handoff-retry');
  return {
    phase: line.getAttribute('data-phase'),
    label: line.querySelector('.dt-handoff-label')?.textContent?.trim() ?? '',
    detail: line.querySelector('.dt-handoff-detail')?.textContent?.trim() ?? '',
    attemptText: line.querySelector('.dt-handoff-try')?.textContent?.trim() ?? null,
    retryButton: retry?.textContent?.trim() ?? null,
    retryEnabled: retry ? retry.disabled === false : false,
  };
})()`)

const profile = await mkdtemp(join(tmpdir(), 'dt-retry-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900', 'about:blank'], { stdio: 'ignore' })

const record = {}
const checks = []
const check = (name, ok, detail) => { checks.push([name, ok]); if (detail) log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`) }

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  // A conversation with a live agent, so the prompt is delivered and the stall
  // that follows is about the turn, not about the agent being absent.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(3000)
  const warm = await transcript(cdp)
  await say(cdp, '在。')
  await turnFinished(cdp, warm)
  log('conversation has an agent')

  await openLearn(cdp)
  await sleep(3000)

  // Pick a node deterministically: one that already has a lesson can never
  // show a stall, because `handoffView` reports lesson-ready the moment one
  // exists — which is exactly what made the first attempt at this look like a
  // missing stall.
  const view0 = await overview()
  const candidates = (view0.nodes ?? []).filter((n) => n.relation !== 'goal')
  let chosen = null
  for (const node of candidates) {
    const body = await (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(node.id)}`)).json()
    if (body.lesson === null) { chosen = node; break }
  }
  if (chosen === null) throw new Error('every node already has a lesson — nothing left to stall on')

  const picked = await cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.dt-node')];
    const want = ${JSON.stringify(chosen.title)};
    const hit = rows.find((el) => (el.querySelector('.dt-node-title')?.textContent ?? '').trim() === want)
      ?? rows.find((el) => (el.textContent || '').includes(want));
    if (!hit) return null;
    hit.click();
    return want;
  })()`)
  if (picked === null) throw new Error(`could not find the map row for "${chosen.title}"`)
  record.plannedNode = chosen.id
  log(`node: ${picked}`)
  await sleep(1500)

  let armed = 'absent'
  for (let a = 0; a < 20 && armed !== 'ready'; a += 1) {
    armed = await cdp.evaluate(`(() => {
      const wanted = ['Start learning', 'Learning in progress'];
      const hit = [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()));
      return hit ? (hit.disabled ? 'disabled' : 'ready') : 'absent';
    })()`)
    if (armed !== 'ready') await sleep(700)
  }
  if (armed !== 'ready') throw new Error(`Start learning is ${armed}`)

  // ---- press it, expecting a real delivery failure ----------------------
  cdp.takeFocusPosts()
  await cdp.evaluate(`(() => {
    const wanted = ['Start learning', 'Learning in progress'];
    [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()))?.click();
  })()`)
  await sleep(6000)

  const posts = cdp.takeFocusPosts()
  record.firstPost = JSON.parse(posts[0]?.body ?? '{}')
  const view1 = await overview()
  const handoffs1 = await storeHandoffs()
  const nodeId = view1.focus?.nodeId ?? record.firstPost.nodeId
  record.targetNodeId = nodeId
  record.handoffAfterFirst = handoffs1[nodeId] ?? null
  record.sessionId = record.firstPost.sessionId ?? null

  log(`POST /focus → ${posts.length} request(s)`)
  log(`handoff status = ${record.handoffAfterFirst?.status} attempts = ${record.handoffAfterFirst?.attempts}`)
  log(`failureReason: ${record.handoffAfterFirst?.failureReason ?? '(none)'}`)

  check('the tutor was reached', record.handoffAfterFirst?.status !== 'failed',
    `status=${record.handoffAfterFirst?.status}`)
  check('the handoff recorded the prompt', record.handoffAfterFirst?.promptedAt !== undefined)

  // ---- stop the turn, so the lesson never arrives ------------------------
  // Stop generating lives in the chat view, and the learning panel replaces the
  // chat — so return to the conversation first, then stop the turn.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'Back to the conversation');
    hit?.click();
  })()`)
  await sleep(2000)

  let stopped = false
  for (let a = 0; a < 30 && !stopped; a += 1) {
    stopped = await cdp.evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || '') === 'Stop generating');
      if (!b) return false;
      b.click();
      return true;
    })()`)
    if (!stopped) await sleep(1000)
  }
  record.stoppedTurn = stopped
  log(`pressed Stop generating: ${stopped}`)
  if (!stopped) throw new Error('no Stop generating button — cannot produce a real stall')
  await sleep(2000)

  // ---- wait out the REAL stall timeout -----------------------------------
  log('waiting for the real STALL_AFTER_MS (150s) — not shortened')
  let stalled = null
  const stallDeadline = Date.now() + 240_000
  while (Date.now() < stallDeadline) {
    const view = await overview()
    if (view.handoff?.phase === 'stalled') { stalled = view.handoff; break }
    await sleep(5000)
  }
  record.stalledView = stalled
  log(`derived phase: ${stalled?.phase ?? '(never stalled)'}`)
  check('the runtime derived stalled on its own', stalled !== null, `phase=${stalled?.phase}`)

  await openLearn(cdp)
  await sleep(2500)
  const ui1 = await readHandoffUi(cdp)
  record.uiBeforeRetry = ui1
  log(`UI: ${JSON.stringify(ui1)}`)
  check('the UI shows the stall', ui1 !== null && ui1.phase === 'stalled', `phase=${ui1?.phase}`)
  check('the UI offers a retry button', ui1?.retryButton !== null && ui1?.retryButton !== undefined,
    `button=${ui1?.retryButton}`)
  check('the retry button is enabled', ui1?.retryEnabled === true)

  if (ui1 === null || ui1.retryButton === null) {
    throw new Error('no retry button — nothing to click, stopping here')
  }

  // ---- retry for real ----------------------------------------------------
  await openLearn(cdp)
  await sleep(2500)
  const attemptsBefore = (await storeHandoffs())[nodeId]?.attempts ?? null
  const focusCountBefore = Object.keys(await storeFocus()).length
  const nextStepsBefore = Object.keys(await storeNextSteps()).length

  cdp.takeFocusPosts()
  const clicked = await cdp.evaluate(`(() => {
    const b = document.querySelector('.dt-handoff-retry');
    if (!b) return false;
    b.click();
    return true;
  })()`)
  record.clicked = clicked
  log(`clicked Retry: ${clicked}`)
  await sleep(3000)

  const retryPosts = cdp.takeFocusPosts()
  record.retryPosts = retryPosts.map((p) => JSON.parse(p.body || '{}'))
  const handoffAfter = (await storeHandoffs())[nodeId] ?? null
  record.handoffAfterRetry = handoffAfter
  log(`retry sent ${retryPosts.length} POST /focus: ${JSON.stringify(record.retryPosts)}`)
  log(`handoff now: status=${handoffAfter?.status} attempts=${handoffAfter?.attempts}`)

  check('the retry sent a request', retryPosts.length >= 1, `${retryPosts.length} request(s)`)
  check('the retry names the same target', record.retryPosts[0]?.nodeId === nodeId,
    `${record.retryPosts[0]?.nodeId}`)
  check('the retry names the same conversation', record.retryPosts[0]?.sessionId === record.sessionId,
    `${record.retryPosts[0]?.sessionId}`)
  check('the attempt count went up by one',
    attemptsBefore !== null && handoffAfter?.attempts === attemptsBefore + 1,
    `${attemptsBefore} → ${handoffAfter?.attempts}`)
  check('no duplicate focus was created',
    Object.keys(await storeFocus()).length === focusCountBefore)
  check('no duplicate decision was created',
    Object.keys(await storeNextSteps()).length === nextStepsBefore)
  check('only one handoff exists for this target',
    Object.keys(await storeHandoffs()).filter((k) => k === nodeId).length === 1)
  check('the retry was really prompted', handoffAfter?.promptedAt !== undefined,
    `promptedAt=${handoffAfter?.promptedAt ?? '(none)'}`)
  check('the retry reset the failure state', handoffAfter?.status !== 'stalled')

  // ---- the tutor answers -------------------------------------------------
  let lesson = null
  const deadline = Date.now() + 420_000
  while (Date.now() < deadline) {
    const body = await (await fetch(`${apiBase}/diagnostic-tutor/api/lesson?nodeId=${encodeURIComponent(nodeId)}`)).json()
    if (body.lesson !== null) { lesson = body.lesson; break }
    await sleep(3000)
  }
  record.lesson = lesson === null ? null : { title: lesson.title, blocks: lesson.blocks.length }
  log(`lesson: ${record.lesson?.title ?? '(none)'}`)

  const finalHandoff = (await storeHandoffs())[nodeId] ?? null
  record.finalPhase = (await overview()).handoff?.phase ?? null
  await openLearn(cdp)
  await sleep(2500)
  const ui2 = await readHandoffUi(cdp)
  record.uiAfter = ui2

  check('the tutor produced a lesson', lesson !== null)
  check('the handoff reached ready', finalHandoff?.status === 'ready', `status=${finalHandoff?.status}`)
  check('the retry button is gone', ui2?.retryButton === null || ui2?.retryButton === undefined,
    `button=${ui2?.retryButton ?? 'gone'}`)

  console.log('\n=== RETRY GATE ===')
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
  console.log('\n--- record ---')
  console.log(JSON.stringify(record, null, 1))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length} checks, ${failed.length} failed`)
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

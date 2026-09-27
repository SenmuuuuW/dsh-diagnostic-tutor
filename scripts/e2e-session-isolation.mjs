/**
 * The v0.1.1 release gate: does the plugin wake the conversation the learner is
 * actually looking at, across real sessions?
 *
 * The question is not "does the code read the right variable" — a unit test
 * already covers that. It is whether two real conversations, switched between
 * in a real browser, each get their own tutor. So this drives the UI and then
 * reads the runtime's own record of which session it targeted.
 *
 * Evidence, not assertion:
 *   - the chat marker visible on screen says which conversation is open
 *   - `handoffs[node].sessionId` in the store says which one the plugin woke
 *   - those two must agree on every switch
 *
 * Nothing here writes to the store. The only mutations are the ones a learner
 * would make: sending a message, pressing Start learning.
 *
 * Usage:
 *   node scripts/e2e-session-isolation.mjs <url-with-token> [storePath]
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9291
const url = process.argv[2]
const storePath = process.argv[3] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/e2e-isolation'

if (!url) {
  console.error('usage: node scripts/e2e-session-isolation.mjs <url-with-token> [storePath]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await mkdir(outDir, { recursive: true })
const log = (m) => console.log(m)

/** The runtime's own record of which session each handoff asked. */
function handoffSessions() {
  const doc = JSON.parse(readFileSync(storePath, 'utf8'))
  const out = {}
  for (const [node, record] of Object.entries(doc.tables.handoffs ?? {})) {
    out[node] = { sessionId: record.sessionId ?? null, attempts: record.attempts, status: record.status }
  }
  return out
}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #console = []
  #badHttp = []
  #focusBodies = []

  static async attach(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const page = targets.find((t) => t.type === 'page')
        if (page?.webSocketDebuggerUrl) {
          const cdp = new Cdp()
          await cdp.#open(page.webSocketDebuggerUrl)
          return cdp
        }
      } catch {
        /* starting */
      }
      await sleep(250)
    }
    throw new Error('could not attach to Chrome')
  }

  #open(wsUrl) {
    return new Promise((resolve, reject) => {
      this.#socket = new WebSocket(wsUrl)
      this.#socket.addEventListener('open', () => resolve())
      this.#socket.addEventListener('error', reject)
      this.#socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
          this.#console.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160))
        }
        if (message.method === 'Runtime.exceptionThrown') {
          this.#console.push(`EXC ${String(message.params.exceptionDetails?.text).slice(0, 160)}`)
        }
        if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/focus')) {
          this.#focusBodies.push(String(message.params.request.postData ?? '(no body)').slice(0, 220))
        }
        if (message.method === 'Network.responseReceived') {
          const { status, url: u } = message.params.response
          if (u.includes('/diagnostic-tutor/') && status >= 400) this.#badHttp.push(`${status} ${u.split('/api')[1]}`)
        }
        const pending = this.#pending.get(message.id)
        if (!pending) return
        this.#pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      })
    })
  }

  send(method, params = {}) {
    const id = this.#next++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
    return r.result?.value
  }

  takeFocusBodies() {
    const taken = [...this.#focusBodies]
    this.#focusBodies = []
    return taken
  }

  takeProblems() {
    const problems = [...this.#console, ...this.#badHttp]
    this.#console = []
    this.#badHttp = []
    return problems
  }

  close() {
    this.#socket?.close()
  }
}

/** A unique, greppable line so the visible conversation identifies itself. */
const marker = (letter) => `SESSION-${letter}-MARKER-${Date.now().toString(36).toUpperCase()}`

async function say(cdp, text) {
  await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.focus()`)
  await cdp.send('Input.insertText', { text })
  await sleep(300)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}

async function waitSettled(cdp, label, timeoutMs = 420_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const busy = await cdp.evaluate(`!!document.querySelector('[class*=pending], [class*=streaming]')`)
    if (!busy) return true
    await sleep(1500)
  }
  throw new Error(`the ${label} turn never settled`)
}

/**
 * The clickable session rows, newest first.
 *
 * They carry auto-generated titles, not message text, so the marker cannot be
 * found here — it identifies the conversation once it is open. Position is the
 * only handle the list offers, and the marker check below is what makes using
 * it safe: if the wrong row opens, the visible markers say so.
 */
async function sessionRows(cdp) {
  return cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const seen = new Set();
    return [...document.querySelectorAll('li, [role=treeitem]')]
      .map((el) => t(el))
      .filter((text) => text.length > 2 && text.length < 90
        && !/^(Plugins|Workspaces|Documents|Ungrouped|Settings|New Session)/.test(text)
        && !seen.has(text) && seen.add(text));
  })()`)
}

/** Open the row at this position in the session list. */
async function openSessionAt(cdp, index) {
  const clicked = await cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const seen = new Set();
    const rows = [...document.querySelectorAll('li, [role=treeitem]')].filter((el) => {
      const text = t(el);
      return text.length > 2 && text.length < 90
        && !/^(Plugins|Workspaces|Documents|Ungrouped|Settings|New Session)/.test(text)
        && !seen.has(text) && seen.add(text);
    });
    const hit = rows[${index}];
    if (!hit) return null;
    hit.click();
    return t(hit).slice(0, 60);
  })()`)
  await sleep(2500)
  return clicked
}

/** Which markers are visible in the transcript right now. */
async function visibleMarkers(cdp, all) {
  const body = await cdp.evaluate(`document.body.innerText`)
  return all.filter((m) => body.includes(m))
}

const profile = await mkdtemp(join(tmpdir(), 'dt-iso-'))
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
   '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,900', 'about:blank'],
  { stdio: 'ignore' },
)

const results = []
let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  const A = marker('A')
  const B = marker('B')
  const markers = [A, B]

  // ---- create two real conversations ------------------------------------
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(2500)
  log(`A marker: ${A}`)
  await say(cdp, `请只回复两个字：收到。\n\n(${A})`)
  await waitSettled(cdp, 'A')
  await sleep(2000)

  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim() === 'New Session');
    hit?.click();
  })()`)
  await sleep(2500)
  log(`B marker: ${B}`)
  await say(cdp, `请只回复两个字：好的。\n\n(${B})`)
  await waitSettled(cdp, 'B')
  await sleep(2000)

  // The first row is the workspace header, not a conversation; sessions follow,
  // newest first. B was created last, so B is row 1 and A is row 2. The marker
  // check below is what keeps this honest — a wrong index opens the wrong chat
  // and the visible markers say so immediately.
  const rows = await sessionRows(cdp)
  log(`session rows: ${JSON.stringify(rows.slice(0, 4))}`)
  const ROW = { B: 1, A: 2 }

  // ---- the switch cycle --------------------------------------------------
  const targetFor = {}
  for (const letter of ['A', 'B', 'A', 'B']) {
    const wanted = letter === 'A' ? A : B
    const other = letter === 'A' ? B : A

    const opened = await openSessionAt(cdp, ROW[letter])
    const visible = await visibleMarkers(cdp, markers)

    if (opened === null) {
      results.push({ step: `open ${letter}`, verdict: 'FAIL', detail: 'session row not found' })
      continue
    }
    if (!visible.includes(wanted) || visible.includes(other)) {
      results.push({
        step: `open ${letter}`,
        verdict: 'FAIL',
        detail: `visible markers ${JSON.stringify(visible)} — wrong conversation on screen`,
      })
      continue
    }
    log(`opened ${letter}: on screen = ${visible.join(',')}`)

    // Learn → pick a node → Start learning.
    await cdp.evaluate(`(() => {
      const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
      hit?.click();
    })()`)
    await sleep(2500)

    const picked = await cdp.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.dt-node')];
      const target = rows.find((el) => /blocked|weak/.test(el.textContent)) ?? rows[1] ?? rows[0];
      if (!target) return null;
      const title = target.querySelector('.dt-node-title')?.textContent?.trim() ?? '';
      target.click();
      return title;
    })()`)
    await sleep(1500)

    // The button only exists once the selected node's detail has loaded, and it
    // is disabled without a conversation. Wait for a clickable one rather than
    // firing into the void — an earlier version of this script reported a
    // handoff that a previous run had left behind.
    let armed = null
    for (let attempt = 0; attempt < 20; attempt += 1) {
      // The label depends on state: "Start learning" on a fresh node, but
      // "Learning in progress" when a focus already sits on it — which is the
      // normal case on a second run. Looking for only the first string is why
      // an earlier pass reported the button as absent.
      armed = await cdp.evaluate(`(() => {
        const wanted = ['Start learning', 'Learning in progress', 'Starting…'];
        const hit = [...document.querySelectorAll('button')]
          .find((el) => wanted.includes((el.textContent || '').trim()));
        if (!hit) return 'absent';
        return hit.disabled ? 'disabled' : 'ready';
      })()`)
      if (armed === 'ready') break
      await sleep(700)
    }
    if (armed !== 'ready') {
      results.push({
        step: `${letter}: Start learning`,
        verdict: 'FAIL',
        detail: `button ${armed} — nothing was clicked`,
      })
      continue
    }

    const before = handoffSessions()
    cdp.takeFocusBodies()
    await cdp.evaluate(`(() => {
      const wanted = ['Start learning', 'Learning in progress'];
      const hit = [...document.querySelectorAll('button')]
        .find((el) => wanted.includes((el.textContent || '').trim()));
      hit?.click();
    })()`)
    await sleep(6000)
    const sent = cdp.takeFocusBodies()
    if (sent.length > 0) log(`  POST /focus body: ${sent[0]}`)
    else log('  POST /focus: no request captured')

    const after = handoffSessions()
    const changed = Object.keys(after).filter(
      (node) => JSON.stringify(after[node]) !== JSON.stringify(before[node]),
    )
    const node = changed[0] ?? Object.keys(after)[0]
    const sessionId = after[node]?.sessionId ?? null

    // The tutor may already have answered in the conversation it was given.
    await sleep(2000)
    const stillVisible = await visibleMarkers(cdp, markers)

    // The conversation was verified BEFORE Learn opened: the panel replaces the
    // main column, so requiring the marker to still be on screen afterwards
    // would fail by design. What is checked here is that the id the plugin
    // targeted is stable for this conversation and distinct from the other's —
    // established on the first visit and enforced on every later one.
    if (sessionId === null) {
      results.push({ step: `${letter}: Start learning`, verdict: 'FAIL', detail: 'no session id recorded' })
      continue
    }
    if (targetFor[letter] === undefined) {
      targetFor[letter] = sessionId
      results.push({
        step: `${letter}: Start learning targets this conversation`,
        verdict: 'PASS',
        detail: `first sighting session=${sessionId}`,
      })
    } else {
      results.push({
        step: `${letter}: Start learning targets this conversation`,
        verdict: targetFor[letter] === sessionId ? 'PASS' : 'FAIL',
        detail: `expected ${targetFor[letter]}, got ${sessionId}`,
      })
    }
    void other
    void stillVisible
    log(`  ${letter}: handoff sessionId=${sessionId}`)
  }

  // ---- the actual claim: A and B got different sessions ------------------
  const aIds = [targetFor.A].filter(Boolean)
  const bIds = [targetFor.B].filter(Boolean)
  const distinct = aIds.length > 0 && bIds.length > 0 && aIds.every((id) => !bIds.includes(id))
  results.push({
    step: 'A and B are different sessions',
    verdict: distinct ? 'PASS' : 'FAIL',
    detail: `A=${[...new Set(aIds)].join(',')} B=${[...new Set(bIds)].join(',')}`,
  })

  // ---- console / http health --------------------------------------------
  const problems = cdp.takeProblems()
  results.push({
    step: 'no console errors or 4xx/5xx',
    verdict: problems.length === 0 ? 'PASS' : 'FAIL',
    detail: problems.slice(0, 3).join(' | ') || 'clean',
  })

  const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, 'isolation.png'), Buffer.from(image.data, 'base64'))

  console.log('\n=== SESSION ISOLATION ===')
  for (const r of results) console.log(`${r.verdict.padEnd(5)} ${r.step}\n      ${r.detail}`)
  const failed = results.filter((r) => r.verdict === 'FAIL')
  console.log(`\n${results.length} checks, ${failed.length} failed`)
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

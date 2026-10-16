/**
 * UI acceptance: does the panel show the focus of the conversation you are in?
 *
 * The bug this closes was found here — in the UI, by a person — so the UI is
 * where it has to be shown fixed. What is checked is deliberately narrow:
 *
 *   when the panel renders, it asks `GET /overview?sessionId=X` — the network
 *   says which conversation it believes it is in
 *
 *   the map marks exactly one node `data-focused="true"` — the UI says which
 *   node it believes that conversation is working on
 *
 *   the store says which node that conversation is actually on
 *
 * All three must agree, and must keep agreeing as the conversation changes.
 * The row is found by title and the session id comes from the request, so the
 * verdict does not depend on knowing which row is which going in.
 *
 * Usage:
 *   node scripts/e2e-ui-scope.mjs <url-with-token> [storePath]
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9431
const url = process.argv[2]
const storePath = process.argv[3] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/e2e-ui-scope'
if (!url) {
  console.error('usage: node scripts/e2e-ui-scope.mjs <url-with-token> [storePath]')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const base = new URL(url).origin

/** What the store says a conversation is focused on. */
function storeFocus(sessionId) {
  const doc = JSON.parse(readFileSync(storePath, 'utf8'))
  const match = Object.entries(doc.tables.focus ?? {}).find(([key]) => {
    const parts = key.split('\u001f')
    return parts.length === 3 && parts[1] === sessionId
  })
  return match === undefined ? null : match[1].nodeId
}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #problems = []
  #overviewAsks = []
  #focusPosts = []

  static async attach(port) {
    for (let a = 0; a < 80; a += 1) {
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
        if (m.method === 'Network.requestWillBeSent') {
          const u = m.params.request.url
          if (u.includes('/overview')) {
            this.#overviewAsks.push(new URL(u).searchParams.get('sessionId'))
          }
          if (u.includes('/api/focus') && m.params.request.method === 'POST') {
            try { this.#focusPosts.push(JSON.parse(String(m.params.request.postData ?? '{}'))) } catch { /* ignore */ }
          }
        }
        if (m.method === 'Runtime.exceptionThrown') {
          this.#problems.push(`exception: ${String(m.params.exceptionDetails?.text).slice(0, 140)}`)
        }
        if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
          this.#problems.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 140)}`)
        }
        if (m.method === 'Network.responseReceived' && m.params.response.url.includes('/diagnostic-tutor/')
          && m.params.response.status >= 400) {
          this.#problems.push(`http ${m.params.response.status} ${m.params.response.url.split('/api/')[1]}`)
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

  /** The session the panel most recently asked about. */
  lastAsk() {
    return this.#overviewAsks.filter(Boolean).at(-1) ?? null
  }
  clearAsks() { this.#overviewAsks = [] }
  takeProblems() { const p = [...this.#problems]; this.#problems = []; return p }
  takeFocusPosts() { const p = [...this.#focusPosts]; this.#focusPosts = []; return p }

  async shot(name) {
    const s = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(s.data, 'base64'))
  }
  close() { this.#socket?.close() }
}

const ROWS = `(() => {
  const t = (el) => (el?.textContent || '').trim();
  const seen = new Set();
  return [...document.querySelectorAll('li, [role=treeitem]')]
    .map((el) => t(el))
    .filter((x) => x.length > 2 && x.length < 90
      && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(x)
      && !seen.has(x) && seen.add(x));
})()`

/**
 * Open a conversation, open Learn, and read what the panel shows.
 *
 * @returns the session the panel asked about, and the node it marked focused.
 */
async function inspect(cdp, title) {
  const opened = await cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const seen = new Set();
    const rows = [...document.querySelectorAll('li, [role=treeitem]')].filter((el) => {
      const x = t(el);
      return x.length > 2 && x.length < 90 && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(x) && !seen.has(x) && seen.add(x);
    });
    const hit = rows.find((el) => t(el).startsWith(${JSON.stringify(title)}));
    if (!hit) return false;
    hit.click();
    return true;
  })()`)
  if (!opened) throw new Error(`could not open "${title}"`)
  await sleep(3000)

  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
    hit?.click();
  })()`)
  await sleep(3500)

  const shown = await cdp.evaluate(`(() => {
    const marked = [...document.querySelectorAll('.dt-node[data-focused="true"]')];
    const titleEl = marked[0]?.querySelector('.dt-node-title');
    return {
      count: marked.length,
      // The title span also carries the relation and evidence count, so take
      // its first text node rather than the whole element.
      title: (titleEl?.childNodes?.[0]?.textContent ?? '').trim() || null,
      panel: !!document.querySelector('.dt-root'),
    };
  })()`)

  return { session: cdp.lastAsk(), shown }
}

/** The map is shared, so the API can name a node the panel only titled. */
let titleToId = new Map()
async function loadNodeTitles() {
  const r = await fetch(`${base}/diagnostic-tutor/api/overview?sessionId=unused`)
  const d = await r.json()
  titleToId = new Map((d.nodes ?? []).map((n) => [n.title, n.id]))
}
const idOf = (title) => (title === null ? null : titleToId.get(title) ?? null)

const checks = []
const check = (name, ok, detail) => {
  checks.push([name, ok])
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const profile = mkdtempSync(join(tmpdir(), 'dt-uiscope-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })

const record = {}
let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(10000)

  await loadNodeTitles()
  const rows = await cdp.evaluate(ROWS)
  log(`session rows: ${JSON.stringify(rows.slice(0, 4))}`)
  if (rows.length < 2) throw new Error('need at least two conversations to test switching')

  const first = rows[0]
  // The second row is whichever other conversation exists; any will do, since
  // the session id is read from the panel's own request rather than guessed.
  const second = rows[1]
  record.rows = { first, second }

  /* ---- conversation 1 ------------------------------------------------ */
  log(`--- conversation 1: ${first} ---`)
  cdp.clearAsks()
  const one = await inspect(cdp, first)
  await cdp.shot('1-first')
  record.one = one
  log(`  panel asked as ${one.session}  |  marked "${one.shown.title}"  (${one.shown.count} marked)`)
  check('at most one node is marked as the focus', one.shown.count <= 1, `${one.shown.count}`)
  check('the panel named a conversation', one.session !== null, `${one.session}`)
  if (one.session !== null) {
    // The rule is agreement, not presence: a conversation with no focus marks
    // nothing, and that is the correct rendering of "nowhere in particular".
    const expected = storeFocus(one.session)
    check('what is marked is exactly what the store holds for that conversation',
      idOf(one.shown.title) === expected,
      `store=${String(expected).split(':').pop() ?? 'none'} shown=${one.shown.title ?? 'none'}`)
  }

  /* ---- conversation 2 ------------------------------------------------ */
  log(`--- conversation 2: ${second} ---`)
  cdp.clearAsks()
  const two = await inspect(cdp, second)
  await cdp.shot('2-second')
  record.two = two
  log(`  panel asked as ${two.session}  |  marked "${two.shown.title}"  (${two.shown.count} marked)`)
  check('the second conversation is a DIFFERENT conversation', two.session !== one.session,
    `${one.session} vs ${two.session}`)
  check('it shows a different focus from the first',
    two.shown.title !== one.shown.title, `${one.shown.title ?? 'none'} vs ${two.shown.title ?? 'none'}`)
  if (two.session !== null) {
    const expected = storeFocus(two.session)
    check('its marked node is the one the store holds for it',
      expected !== null && idOf(two.shown.title) === expected,
      `store=${String(expected).split(':').pop()} shown=${two.shown.title}`)
  }

  /* ---- back to the first --------------------------------------------- */
  log(`--- back to conversation 1 ---`)
  cdp.clearAsks()
  const back = await inspect(cdp, first)
  await cdp.shot('3-back')
  record.back = back
  log(`  panel asked as ${back.session}  |  marked "${back.shown.title}"`)
  check('returning restores the FIRST focus', back.shown.title === one.shown.title,
    `${one.shown.title} -> ${back.shown.title}`)
  check('and the same conversation', back.session === one.session, `${back.session}`)

  /* ---- reload --------------------------------------------------------- */
  log('--- reload ---')
  cdp.clearAsks()
  await cdp.send('Page.reload')
  await sleep(12000)
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')].find((el) => (el.textContent || '').trim() === 'Learn');
    hit?.click();
  })()`)
  await sleep(3500)
  const afterReload = await cdp.evaluate(`(() => {
    const marked = [...document.querySelectorAll('.dt-node[data-focused="true"]')];
    const titleEl = marked[0]?.querySelector('.dt-node-title');
    return {
      count: marked.length,
      title: (titleEl?.childNodes?.[0]?.textContent ?? '').trim() || null,
      session: null,
    };
  })()`)
  afterReload.session = cdp.lastAsk()
  await cdp.shot('4-after-reload')
  record.afterReload = afterReload
  log(`  after reload the panel asked as ${afterReload.session}  |  marked "${afterReload.title}"`)
  check('after reload the focus is still the one the store holds',
    afterReload.session !== null && storeFocus(afterReload.session) === idOf(afterReload.title),
    `${afterReload.title}`)

  /* ---- health --------------------------------------------------------- */
  const problems = cdp.takeProblems()
  record.problems = problems
  check('no console errors and no 4xx/5xx', problems.length === 0, problems.slice(0, 3).join(' | ') || 'clean')

  console.log('\n=== UI ACCEPTANCE ===')
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
  console.log('\n--- evidence ---')
  console.log(JSON.stringify(record, null, 1))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length} checks, ${failed.length} failed`)
  if (failed.length > 0) console.log(`FIRST FAILURE: ${failed[0][0]}`)
  writeFileSync(join(outDir, 'result.json'), JSON.stringify({ checks, record }, null, 1))
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

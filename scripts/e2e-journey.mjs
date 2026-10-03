/**
 * The continuous journey, driven over CDP, judged only on server-side evidence.
 *
 * The earlier attempts failed on DSH's own navigation, never on this plugin's
 * controls. So this drives only what is reliable — Learn, a map row, Start
 * learning, the decision card, Continue, session switching by exact title, and
 * the composer after a settle — and it refuses to draw any conclusion from the
 * DOM:
 *
 *   no row indices           the session list shifts under a collapsing header
 *   no body.innerText        it spans the sidebar, so it cannot name the open
 *                            conversation
 *   no busy-selector         it matches nothing in this build
 *
 * Identity comes from `handoffs[node].sessionId`, which the server writes from
 * the POST /focus body — the same value the client sent. If two conversations
 * are opened in turn and the plugin names a different session each time, the
 * plugin is following the learner's selection. That is the release gate.
 *
 * Usage:
 *   node scripts/e2e-journey.mjs <url-with-token> [storePath]
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9421
const url = process.argv[2]
const storePath = process.argv[3] ?? join(homedir(), '.dsh', 'storages', 'udt.json')
const outDir = '/tmp/e2e-journey'
if (!url) {
  console.error('usage: node scripts/e2e-journey.mjs <url-with-token> [storePath]')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)
const base = new URL(url).origin
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const api = async (path) => {
  const r = await fetch(`${base}/diagnostic-tutor/api${path}`, { signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}
const overview = () => api('/overview')
const lessonFor = (id) => api(`/lesson?nodeId=${encodeURIComponent(id)}`)
const store = () => JSON.parse(readFileSync(storePath, 'utf8'))
const handoffs = () => store().tables.handoffs ?? {}

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #problems = []
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
  takeProblems() { const p = [...this.#problems]; this.#problems = []; return p }
  async shot(name) {
    const s = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(s.data, 'base64'))
  }
  close() { this.#socket?.close() }
}

/** Session rows carry a relative timestamp; workspace headers do not. */
const ROWS = `(() => {
  const t = (el) => (el?.textContent || '').trim();
  const seen = new Set();
  return [...document.querySelectorAll('li, [role=treeitem]')]
    .map((el) => t(el))
    .filter((x) => x.length > 2 && x.length < 90
      && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(x)
      && !seen.has(x) && seen.add(x));
})()`

const clickText = (cdp, text, exact = true) => cdp.evaluate(`(() => {
  const t = (el) => (el?.textContent || '').trim();
  const hit = [...document.querySelectorAll('button, [role=button]')]
    .find((el) => ${exact ? `t(el) === ${JSON.stringify(text)}` : `t(el).includes(${JSON.stringify(text)})`});
  if (!hit || hit.disabled) return false;
  hit.click();
  return true;
})()`)

/** Type into the Lexical composer, after it has actually settled. */
async function say(cdp, text) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ok = await cdp.evaluate(`(() => {
      const el = document.querySelector('[contenteditable="true"]');
      if (!el) return false;
      el.focus();
      return document.activeElement === el;
    })()`)
    if (!ok) throw new Error('no focused composer')
    await sleep(600)
    await cdp.send('Input.insertText', { text })
    await sleep(600)
    const len = await cdp.evaluate(`document.querySelector('[contenteditable="true"]')?.textContent?.length ?? 0`)
    if (len > 0) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      return
    }
    log(`  composer empty on attempt ${attempt}`)
  }
  throw new Error('composer would not accept text')
}

/** Wait for the tutor to write a lesson, by polling the API — never the DOM. */
async function waitLesson(nodeId, ms = 600_000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const body = await lessonFor(nodeId)
    if (body.lesson !== null) return body.lesson
    await sleep(3000)
  }
  return null
}

const checks = []
const check = (name, ok, detail) => {
  checks.push([name, ok])
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const rec = { posts: [], problems: [] }
const profile = mkdtempSync(join(tmpdir(), 'dt-journey-'))
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' })

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(10000)

  // ---- two conversations, created the way the sidebar itself offers ------
  const titles = {}
  for (const letter of ['A', 'B']) {
    const made = await cdp.evaluate(`(() => {
      const el = [...document.querySelectorAll('[aria-label]')]
        .find((e) => (e.getAttribute('aria-label') || '').startsWith('New session in '));
      if (!el) return null;
      el.click();
      return el.getAttribute('aria-label');
    })()`)
    if (made === null) throw new Error('no workspace-scoped new-session control')
    await sleep(3000)
    for (let a = 0; a < 40; a += 1) {
      if (await cdp.evaluate(`!!document.querySelector('[contenteditable="true"]')`)) break
      await sleep(500)
    }
    await say(cdp, `请只回复两个字：收到。这是 ${letter} 号会话。`)
    await sleep(12000)
    titles[letter] = (await cdp.evaluate(ROWS))[0]
    log(`session ${letter}: row "${titles[letter]}"`)
  }
  await cdp.shot('1-two-sessions')

  /** Open a conversation by its exact title. */
  const openTitled = async (title) => {
    const hit = await cdp.evaluate(`(() => {
      const t = (el) => (el?.textContent || '').trim();
      const seen = new Set();
      const rows = [...document.querySelectorAll('li, [role=treeitem]')].filter((el) => {
        const x = t(el);
        return x.length > 2 && x.length < 90 && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(x) && !seen.has(x) && seen.add(x);
      });
      const target = rows.find((el) => t(el).startsWith(${JSON.stringify(title)}));
      if (!target) return false;
      target.click();
      return true;
    })()`)
    await sleep(3500)
    return hit
  }

  /** Press the panel's main action. Returns which label it used. */
  const pressStart = async () => {
    for (let a = 0; a < 24; a += 1) {
      const label = await cdp.evaluate(`(() => {
        const wanted = ['Start learning', 'Learning in progress'];
        const hit = [...document.querySelectorAll('button')].find((el) => wanted.includes((el.textContent || '').trim()));
        if (!hit) return null;
        if (hit.disabled) return 'disabled';
        const text = (hit.textContent || '').trim();
        hit.click();
        return text;
      })()`)
      if (label !== null && label !== 'disabled') return label
      await sleep(700)
    }
    return null
  }

  /* ================= A =================================================== */
  log('--- Session A ---')
  await openTitled(titles.A)
  await clickText(cdp, 'Learn')
  await sleep(3000)

  const view = await overview()
  let target = null
  for (const n of (view.nodes ?? []).filter((x) => x.relation !== 'goal')) {
    const body = await lessonFor(n.id)
    if (body.lesson === null) { target = n; break }
  }
  if (target === null) target = (view.nodes ?? []).find((x) => x.relation !== 'goal')
  const selected = await cdp.evaluate(`(() => {
    const want = ${JSON.stringify(target.title)};
    const hit = [...document.querySelectorAll('.dt-node')]
      .find((el) => (el.querySelector('.dt-node-title')?.textContent ?? '').trim() === want);
    if (!hit) return false;
    hit.click();
    return true;
  })()`)
  check('a node could be selected in the map', selected, target.title)
  await sleep(1500)

  const beforeA = Object.keys(await handoffs()).length
  check('Start learning was pressed', (await pressStart()) !== null)
  await sleep(6000)
  const afterA = await handoffs()
  const nodeA = target.id
  const sessA = afterA[nodeA]?.sessionId ?? null
  rec.sessA = sessA
  rec.nodeA = nodeA
  check('a handoff was persisted for A', afterA[nodeA] !== undefined, `attempts=${afterA[nodeA]?.attempts}`)
  check('the handoff names a session', typeof sessA === 'string' && sessA.length > 0, sessA)
  void beforeA

  const lessonA = await waitLesson(nodeA)
  check('a lesson arrived for A', lessonA !== null, lessonA?.title)
  await cdp.shot('2-A-lesson')

  /* ================= B =================================================== */
  log('--- Session B ---')
  await openTitled(titles.B)
  await clickText(cdp, 'Learn')
  await sleep(3000)
  await cdp.evaluate(`document.querySelectorAll('.dt-node')[1]?.click()`)
  await sleep(1500)

  check('Start learning was pressed in B', (await pressStart()) !== null)
  await sleep(6000)
  const afterB = await handoffs()
  const bNode = (await overview()).focus?.nodeId ?? null
  const sessB = bNode === null ? null : (afterB[bNode]?.sessionId ?? null)
  rec.sessB = sessB
  check('B produced its own handoff', sessB !== null, `node=${bNode?.slice(-24)}`)
  check('B used a DIFFERENT session from A', sessB !== null && sessB !== sessA, `A=${sessA} B=${sessB}`)
  await cdp.shot('3-B-start')

  /* ================= back to A =========================================== */
  log('--- back to A ---')
  await openTitled(titles.A)
  await clickText(cdp, 'Learn')
  await sleep(3000)
  const viewBack = await overview()
  rec.focusOnReturn = viewBack.focus?.nodeId ?? null
  const lessonBack = viewBack.focus === null ? null : await lessonFor(viewBack.focus.nodeId)
  check('A\'s focus is still A\'s node', viewBack.focus?.nodeId === nodeA, `${viewBack.focus?.nodeId?.slice(-24)}`)
  check('A\'s lesson is still there', lessonBack?.lesson != null, lessonBack?.lesson?.title ?? '(none)')
  await cdp.shot('4-back-to-A')

  /* ================= reload ============================================== */
  log('--- reload ---')
  const focusBeforeReload = JSON.stringify((await store()).tables.focus)
  await cdp.send('Page.reload')
  await sleep(12000)

  const afterReload = await cdp.evaluate(`(() => ({
    composer: !!document.querySelector('[contenteditable="true"]'),
    learn: [...document.querySelectorAll('button, [role=button]')].some((el) => (el.textContent || '').trim() === 'Learn'),
    panelAutoOpen: !!document.querySelector('.dt-root'),
    rightTabAutoOpen: !!document.querySelector('.dt-tab'),
  }))()`)
  check('Learn is still available after reload', afterReload.learn)
  check('the plugin did NOT auto-open its panel', afterReload.panelAutoOpen === false)
  check('the plugin did NOT auto-open the right sidebar', afterReload.rightTabAutoOpen === false)

  await clickText(cdp, 'Learn')
  await sleep(3000)
  const viewR = await overview()
  const mapR = await cdp.evaluate(`document.querySelectorAll('.dt-node').length`)
  const lessonR = viewR.focus === null ? null : await lessonFor(viewR.focus.nodeId)
  check('course survived the reload', viewR.course !== null, viewR.course?.title)
  check('map survived the reload', mapR > 0, `${mapR} nodes`)
  check('focus survived the reload', viewR.focus?.nodeId === nodeA, `${viewR.focus?.nodeId?.slice(-24)}`)
  check('lesson survived the reload', lessonR?.lesson != null, lessonR?.lesson?.title ?? '(none)')
  check('the store was not rewritten by the reload',
    JSON.stringify((await store()).tables.focus) === focusBeforeReload)
  await cdp.shot('5-after-reload')

  /* ================= verdict inputs ====================================== */
  const problems = cdp.takeProblems()
  rec.problems = problems
  check('no console errors and no 4xx/5xx', problems.length === 0, problems.slice(0, 3).join(' | '))

  console.log('\n=== CONTINUOUS JOURNEY ===')
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS ' : 'FAIL '} ${name}`)
  console.log('\n--- evidence ---')
  console.log(JSON.stringify(rec, null, 1))
  const failed = checks.filter(([, ok]) => !ok)
  console.log(`\n${checks.length} checks, ${failed.length} failed`)
  if (failed.length > 0) console.log(`FIRST FAILURE: ${failed[0][0]}`)
  writeFileSync(join(outDir, 'journey.json'), JSON.stringify({ checks, rec }, null, 1))
  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

/**
 * Does pressing Learn leave the conversation alone?
 *
 * The regression this checks for is a navigation one, so it is checked the way
 * a learner would notice it: is the composer still on screen afterwards, and is
 * the thing that opened beside it rather than on top of it.
 *
 * Evidence is the DOM the learner sees plus the network the panel actually
 * sends — the tab's own `/overview?sessionId=` call says which conversation the
 * docked surface is following.
 *
 * Usage:
 *   node scripts/e2e-nav.mjs <url-with-token>
 */

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9441
const url = process.argv[2]
const outDir = '/tmp/e2e-nav'
if (!url) {
  console.error('usage: node scripts/e2e-nav.mjs <url-with-token>')
  process.exit(2)
}

mkdirSync(outDir, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${m}`)

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #problems = []
  #asks = []

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
          if (u.includes('/overview')) this.#asks.push(new URL(u).searchParams.get('sessionId'))
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

  lastAsk() { return this.#asks.filter(Boolean).at(-1) ?? null }
  clearAsks() { this.#asks = [] }
  takeProblems() { const p = [...this.#problems]; this.#problems = []; return p }

  async shot(name) {
    const s = await this.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(s.data, 'base64'))
  }
  close() { this.#socket?.close() }
}

/** What is on screen, in the terms the learner would use. */
const SHAPE = `(() => {
  const t = (el) => (el?.textContent || '').trim();
  const learnBtn = [...document.querySelectorAll('button, [role=button]')]
    .find((el) => t(el) === 'Learn' || el.getAttribute('aria-label') === 'Learn');
  return {
    composer: !!document.querySelector('[contenteditable="true"]'),
    mainIsPanel: !!document.querySelector('.dt-root'),
    tabOpen: !!document.querySelector('.dt-tab'),
    learnPresent: !!learnBtn,
    learnLocation: learnBtn ? (learnBtn.closest('[class*=foot], [class*=Foot]') ? 'sidebar foot' : 'sidebar top') : null,
  };
})()`

/** Find and close the docked tab, the way its own close control does. */
async function closeTab(cdp) {
  return cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const candidates = [...document.querySelectorAll('button, [role=button]')]
      .filter((el) => /close/i.test(el.getAttribute('aria-label') || '') || t(el) === '×' || t(el) === '✕');
    const hit = candidates[candidates.length - 1];
    if (!hit) return false;
    hit.click();
    return true;
  })()`)
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

const checks = []
const check = (name, ok, detail) => {
  checks.push([name, ok])
  log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const profile = mkdtempSync(join(tmpdir(), 'dt-nav-'))
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

  const before = await cdp.evaluate(SHAPE)
  record.before = before
  log(`before Learn: ${JSON.stringify(before)}`)
  check('Learn is in the sidebar', before.learnPresent, before.learnLocation ?? '')
  check('a conversation is open to begin with', before.composer)

  /* ---- press Learn ---------------------------------------------------- */
  cdp.clearAsks()
  await cdp.evaluate(`(() => {
    const t = (el) => (el?.textContent || '').trim();
    const hit = [...document.querySelectorAll('button, [role=button]')]
      .find((el) => t(el) === 'Learn' || el.getAttribute('aria-label') === 'Learn');
    hit?.click();
  })()`)
  await sleep(4000)
  const after = await cdp.evaluate(SHAPE)
  record.afterLearn = after
  log(`after Learn:  ${JSON.stringify(after)}`)
  await cdp.shot('1-after-learn')

  check('the conversation is still there', after.composer, `composer=${after.composer}`)
  check('the main column was NOT replaced by the panel', after.mainIsPanel === false,
    `mainIsPanel=${after.mainIsPanel}`)
  check('the Learning tab opened beside it', after.tabOpen, `tabOpen=${after.tabOpen}`)
  check('the docked tab named a conversation', cdp.lastAsk() !== null, `${cdp.lastAsk()}`)
  record.tabSession = cdp.lastAsk()

  /* ---- the full view is offered, not taken ---------------------------- */
  const offered = await cdp.evaluate(`[...document.querySelectorAll('button')]
    .some((b) => (b.textContent || '').includes('Open full view'))`)
  check('the tab offers the full view', offered)

  /* ---- close it ------------------------------------------------------- */
  const closed = await closeTab(cdp)
  await sleep(2500)
  const afterClose = await cdp.evaluate(SHAPE)
  record.afterClose = afterClose
  log(`after close:  ${JSON.stringify(afterClose)}`)
  await cdp.shot('2-after-close')
  check('closing the tab left the conversation alone', afterClose.composer && !afterClose.mainIsPanel,
    closed ? 'closed' : 'no close control found')

  /* ---- a session switch carries the tab ------------------------------- */
  const rows = await cdp.evaluate(ROWS)
  record.rows = rows.slice(0, 3)
  log(`session rows: ${JSON.stringify(record.rows)}`)
  if (rows.length >= 2) {
    await cdp.evaluate(`(() => {
      const t = (el) => (el?.textContent || '').trim();
      const seen = new Set();
      const list = [...document.querySelectorAll('li, [role=treeitem]')].filter((el) => {
        const x = t(el);
        return x.length > 2 && x.length < 90 && /\\b(now|\\d+\\s?(s|min|m|h|d))\\b/.test(x) && !seen.has(x) && seen.add(x);
      });
      list[1]?.click();
    })()`)
    await sleep(3000)
    cdp.clearAsks()
    await cdp.evaluate(`(() => {
      const t = (el) => (el?.textContent || '').trim();
      const hit = [...document.querySelectorAll('button, [role=button]')]
        .find((el) => t(el) === 'Learn' || el.getAttribute('aria-label') === 'Learn');
      hit?.click();
    })()`)
    await sleep(4000)
    const other = cdp.lastAsk()
    record.otherSession = other
    log(`after switching, the tab asks as ${other}`)
    check('the tab follows the conversation it is docked beside', other !== null && other !== record.tabSession,
      `${record.tabSession} -> ${other}`)
  }

  const problems = cdp.takeProblems()
  record.problems = problems
  check('no console errors and no 4xx/5xx', problems.length === 0, problems.slice(0, 3).join(' | ') || 'clean')

  console.log('\n=== NAVIGATION ===')
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

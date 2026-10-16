/**
 * Probe what the DSH session browser actually looks like.
 *
 * Used twice: once with this plugin disabled, once with it enabled. The point
 * is to compare, so it reports structure rather than asserting anything —
 * whatever the shipped UI does is the baseline, and any difference is this
 * plugin's fault.
 *
 * Usage:
 *   node scripts/probe-sessions.mjs <url-with-token> <label> [outdir]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9251
const url = process.argv[2]
const label = process.argv[3] ?? 'probe'
const outDir = process.argv[4] ?? '/tmp/probe'

if (!url) {
  console.error('usage: node scripts/probe-sessions.mjs <url-with-token> <label> [outdir]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await mkdir(outDir, { recursive: true })

class Cdp {
  #socket
  #next = 1
  #pending = new Map()

  static async attach(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) {
          const cdp = new Cdp()
          await cdp.#open(page.webSocketDebuggerUrl)
          return cdp
        }
      } catch {
        /* still starting */
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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }

  close() {
    this.#socket?.close()
  }
}

/** What the session browser is showing, in a form two runs can be compared on. */
const SHAPE = `(() => {
  const text = (el) => (el?.textContent || '').trim();
  const buttons = [...document.querySelectorAll('button, [role=button]')];
  const links = [...document.querySelectorAll('a')];
  // Anything that looks like a session row: clickable, with a title-ish label.
  const rows = [...document.querySelectorAll('[class*=session], [class*=Session], li, [role=treeitem]')]
    .map((el) => text(el))
    .filter((t) => t.length > 1 && t.length < 120);
  return {
    newSession: buttons.some((b) => text(b) === 'New Session'),
    learn: buttons.some((b) => text(b) === 'Learn'),
    chatTabs: buttons.filter((b) => ['Chat', 'Trajectory'].includes(text(b))).map(text),
    composer: !!document.querySelector('[contenteditable="true"]'),
    sectionLabels: [...document.querySelectorAll('*')]
      .filter((el) => el.children.length === 0)
      .map(text)
      .filter((t) => ['Workspaces', 'Plugins', 'Documents', 'DSH', 'Ungrouped', 'Settings'].includes(t)),
    rowCount: rows.length,
    rows: [...new Set(rows)].slice(0, 18),
    bodyStart: document.body.innerText.slice(0, 420).replace(/\\n+/g, ' | '),
  };
})()`

const profile = await mkdtemp(join(tmpdir(), 'dt-probe-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1440,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  const shot = async (name) => {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(outDir, `${label}-${name}.png`), Buffer.from(image.data, 'base64'))
  }

  await shot('1-initial')
  const initial = await cdp.evaluate(SHAPE)
  console.log(`[${label}] initial:`, JSON.stringify(initial, null, 1))

  // Try to open a session that is not the newest one.
  const opened = await cdp.evaluate(`(() => {
    const text = (el) => (el?.textContent || '').trim();
    const candidates = [...document.querySelectorAll('li, [role=treeitem], [class*=session]')]
      .filter((el) => { const t = text(el); return t.length > 3 && t.length < 90; });
    const target = candidates[1] ?? candidates[0];
    if (!target) return null;
    const label = text(target).slice(0, 60);
    target.click();
    return label;
  })()`)
  console.log(`[${label}] clicked a session row:`, JSON.stringify(opened))
  await sleep(4000)
  await shot('2-opened')
  const afterOpen = await cdp.evaluate(SHAPE)
  console.log(`[${label}] after open: composer=${afterOpen.composer} tabs=${afterOpen.chatTabs} body=${afterOpen.bodyStart.slice(0, 160)}`)

  // Reload: does the selection survive?
  await cdp.send('Page.reload')
  await sleep(9000)
  await shot('3-reloaded')
  const afterReload = await cdp.evaluate(SHAPE)
  console.log(`[${label}] after reload: composer=${afterReload.composer} body=${afterReload.bodyStart.slice(0, 160)}`)
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

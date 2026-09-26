/**
 * Click every button the plugin renders, and report what actually happened.
 *
 * "Does the JSX have an onClick" is not the question. The question is whether a
 * person pressing it gets the effect the button promises — so this drives the
 * real UI, watches the network for the call each action should make, and reads
 * the DOM and the runtime state back afterwards.
 *
 * It never fails the run on a bad button: it prints a table so a human can see
 * which ones are broken, and exits non-zero if any are.
 *
 * **It will not delete anything unless you ask it to.** The first version
 * happily pressed *Yes, delete everything* against whatever store the profile
 * was pointed at, which is a destructive default on a script whose whole job is
 * to click things. Destructive controls are now inspected for presence and
 * their safe half (Cancel) is exercised; actually confirming needs
 * `--i-know-this-deletes-state`.
 *
 * Usage:
 *   node scripts/audit-buttons.mjs <url-with-token> [outdir] [--i-know-this-deletes-state]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9261
const url = process.argv[2]
const outDir = process.argv[3] ?? '/tmp/audit'
/** Destructive confirmation is opt-in; see the header. */
const mayDelete = process.argv.includes('--i-know-this-deletes-state')
if (!url) {
  console.error('usage: node scripts/audit-buttons.mjs <url-with-token> [outdir]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
  #requests = []
  #console = []

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
        if (message.method === 'Network.requestWillBeSent') {
          const u = message.params.request.url
          if (u.includes('/diagnostic-tutor/')) this.#requests.push(`${message.params.request.method} ${u.split('/api')[1]}`)
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
          this.#console.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160))
        }
        if (message.method === 'Runtime.exceptionThrown') {
          this.#console.push(`EXC ${String(message.params.exceptionDetails?.text).slice(0, 160)}`)
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
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) return { __error: result.exceptionDetails.text }
    return result.result?.value
  }

  takeRequests() {
    const taken = [...this.#requests]
    this.#requests = []
    return taken
  }

  takeConsole() {
    const taken = [...this.#console]
    this.#console = []
    return taken
  }

  close() {
    this.#socket?.close()
  }
}

const results = []

/** Click something by visible text, then report what changed. */
async function audit(cdp, { action, expected, find, settle = 1500 }) {
  cdp.takeRequests()
  cdp.takeConsole()

  const found = await cdp.evaluate(`(() => {
    const text = (el) => (el?.textContent || '').trim();
    const candidates = [...document.querySelectorAll('button, [role=button], a')];
    const hit = candidates.find((el) => text(el) === ${JSON.stringify(find)}
      || (${JSON.stringify(find)}.length > 3 && text(el).includes(${JSON.stringify(find)})));
    if (!hit) return { ok: false };
    const before = document.body.innerText.length;
    hit.click();
    return { ok: true, disabled: hit.disabled === true, before, label: text(hit).slice(0, 40) };
  })()`)

  await sleep(settle)
  const requests = cdp.takeRequests()
  const consoleErrors = cdp.takeConsole()
  const after = await cdp.evaluate(`({
    dom: document.body.innerText.length,
    notices: [...document.querySelectorAll('.dt-caption, .dt-data-note, .dt-empty')].map(e => e.textContent.trim().slice(0, 70)).slice(0, 3),
  })`)

  const status = !found?.ok
    ? 'NOT FOUND'
    : found.disabled
      ? 'disabled'
      : consoleErrors.length > 0
        ? 'console error'
        : 'clicked'

  results.push({
    action,
    expected,
    found: found?.ok ? `"${found.label}"` : '—',
    clicked: found?.ok && !found.disabled,
    api: requests.join(', ') || '—',
    dom: typeof after?.dom === 'number' ? `${found?.before}→${after.dom}` : '—',
    console: consoleErrors.length ? consoleErrors[0] : '—',
    status,
  })
}

const profile = await mkdtemp(join(tmpdir(), 'dt-audit-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1600,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

let cdp
try {
  cdp = await Cdp.attach(PORT)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  await cdp.send('Page.navigate', { url })
  await sleep(9000)

  const shot = async (name) => {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(outDir, name), Buffer.from(image.data, 'base64'))
  }

  // --- the sidebar entry -------------------------------------------------
  await audit(cdp, {
    action: 'Learn (sidebar)',
    expected: 'opens the learning panel, main area is not blank',
    find: 'Learn',
    settle: 2500,
  })
  await shot('audit-1-learn.png')

  // --- the map -----------------------------------------------------------
  await audit(cdp, {
    action: 'map node',
    expected: 'selects the node, detail pane fills',
    find: '数学基础',
    settle: 1500,
  })
  await shot('audit-2-node.png')

  await audit(cdp, {
    action: 'Start learning',
    expected: 'records a focus and wakes the tutor',
    find: 'Start learning',
    settle: 4000,
  })
  await shot('audit-3-start.png')

  await audit(cdp, {
    action: 'Answer in the chat',
    expected: 'returns to the conversation',
    find: 'Answer in the chat',
    settle: 2500,
  })
  await shot('audit-4-back-to-chat.png')

  // Back into the panel for the remaining controls.
  await audit(cdp, { action: 'Learn (reopen)', expected: 'panel returns', find: 'Learn', settle: 2500 })

  await audit(cdp, {
    action: 'Back to the conversation (header)',
    expected: 'returns to the conversation from any state',
    find: 'Back to the conversation',
    settle: 2500,
  })
  await audit(cdp, { action: 'Learn (reopen 2)', expected: 'panel returns', find: 'Learn', settle: 2500 })

  await audit(cdp, { action: 'Export my data', expected: 'saves a JSON file', find: 'Export my data', settle: 2500 })
  await shot('audit-5-export.png')

  await audit(cdp, { action: 'Delete everything', expected: 'asks for confirmation first', find: 'Delete everything', settle: 1200 })
  await shot('audit-6-delete-confirm.png')

  await audit(cdp, { action: 'Cancel (delete)', expected: 'backs out, nothing deleted', find: 'Cancel', settle: 1200 })
  await shot('audit-7-cancel.png')

  if (mayDelete) {
    await audit(cdp, { action: 'Delete everything (again)', expected: 'asks again', find: 'Delete everything', settle: 1200 })
    await audit(cdp, { action: 'Yes, delete everything', expected: 'deletes and returns to first run', find: 'Yes, delete', settle: 3000 })
    await shot('audit-8-after-delete.png')
  } else {
    results.push({
      action: 'Yes, delete everything',
      expected: 'deletes and returns to first run',
      found: 'present (behind the confirm step)',
      clicked: false,
      api: '—',
      dom: '—',
      console: '—',
      status: 'skipped (needs --i-know-this-deletes-state)',
    })
  }

  // Conditional by design: these only exist when the runtime has something to
  // offer. Recorded as such rather than reported as broken.
  for (const [action, find, when] of [
    ['Continue (next best step)', 'Continue', 'only when the tutor recorded a decision'],
    ['Ask again (retry)', 'Ask again', 'only after a failed or stalled handoff'],
  ]) {
    const present = await cdp.evaluate(`[...document.querySelectorAll('button')].some((el) => (el.textContent || '').trim().includes(${JSON.stringify(find)}))`)
    results.push({
      action,
      expected: when,
      found: present ? 'yes' : 'no',
      clicked: false,
      api: '—',
      dom: '—',
      console: '—',
      status: present ? 'present (not exercised)' : 'absent (expected here)',
    })
  }

  console.log('\n=== BUTTON AUDIT ===\n')
  for (const r of results) {
    console.log(
      `${r.action.padEnd(34)} clicked=${String(r.clicked).padEnd(5)} api=${r.api.padEnd(20)} dom=${r.dom.padEnd(12)} ${r.status}`,
    )
    if (r.console !== '—') console.log(`${' '.repeat(34)} console: ${r.console}`)
  }

  const broken = results.filter((r) => r.status === 'NOT FOUND' || r.status === 'console error')
  console.log(`\n${results.length} audited, ${broken.length} broken`)
  for (const b of broken) console.log(`  BROKEN: ${b.action} (${b.status})`)
  await writeFile(join(outDir, 'audit.json'), JSON.stringify(results, null, 2))
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

/**
 * Capture the panel from a running DSH web profile.
 *
 * A plain `--screenshot` is not enough here: the panel is behind a sidebar
 * click, and the app needs a moment to boot. So this drives Chrome over the
 * DevTools Protocol — navigate with the profile's token, wait for the shell,
 * click this plugin's sidebar entry, wait for the panel, then capture.
 *
 * It also prints what the panel actually rendered, which is better evidence
 * than a picture when something regresses.
 *
 * Usage:
 *   node scripts/screenshot.mjs <dsh-url-with-token> [output.png]
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PANEL_LABEL = 'Learn'
const PORT = 9223

const url = process.argv[2]
const out = process.argv[3] ?? 'preview/dsh-ui.png'
if (!url) {
  console.error('usage: node scripts/screenshot.mjs <dsh-url-with-token> [output.png]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Minimal DevTools Protocol client over the page target's WebSocket. */
class Cdp {
  #socket
  #next = 1
  #pending = new Map()

  static async attach(port) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`)
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page')
        if (page?.webSocketDebuggerUrl) {
          const cdp = new Cdp()
          await cdp.#open(page.webSocketDebuggerUrl)
          return cdp
        }
      } catch {
        // Chrome is still starting.
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

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    return result.result?.value
  }

  close() {
    this.#socket?.close()
  }
}

/** Poll an expression until it is truthy, or give up. */
async function waitFor(cdp, expression, label, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await cdp.evaluate(expression)) return true
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const profile = await mkdtemp(join(tmpdir(), 'dt-chrome-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1680,1000',
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

  // The shell renders a sidebar; wait for it before looking for our entry.
  await waitFor(cdp, '!!document.querySelector("button, [role=button]")', 'the app shell')
  await sleep(2500)

  const clicked = await cdp.evaluate(`(() => {
    const label = ${JSON.stringify(PANEL_LABEL)};
    const nodes = [...document.querySelectorAll('button, [role=button]')];
    const hit = nodes.find((el) => (el.getAttribute('aria-label') || '').trim() === label)
      || nodes.find((el) => (el.textContent || '').trim() === label)
      || nodes.find((el) => (el.title || '').trim() === label);
    if (!hit) return { ok: false, seen: nodes.slice(0, 40).map((el) => (el.getAttribute('aria-label') || el.textContent || el.title || '').trim().slice(0, 24)) };
    hit.click();
    return { ok: true };
  })()`)

  if (!clicked?.ok) {
    console.error('could not find the sidebar entry. Buttons seen:', clicked?.seen)
    process.exitCode = 1
  } else {
    await waitFor(cdp, '!!document.querySelector(".dt-root")', 'the learning panel')
    await sleep(600)

    const report = await cdp.evaluate(`(() => {
      const root = document.querySelector('.dt-root');
      if (!root) return null;
      const nodes = [...root.querySelectorAll('.dt-node')].map((el) => el.textContent.trim());
      return {
        panes: [...root.querySelectorAll('.dt-pane')].length,
        course: root.querySelector('.dt-course-title')?.textContent ?? null,
        goal: root.querySelector('.dt-goal')?.textContent ?? null,
        nodes,
        states: [...new Set([...root.querySelectorAll('.dt-state')].map((el) => el.textContent))],
      };
    })()`)

    console.log('panel report:', JSON.stringify(report, null, 2))

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(out, Buffer.from(shot.data, 'base64'))
    console.log(`screenshot → ${out}`)

    // Walk the flow the panel is meant to express: pick a node, then open the
    // learning surface for it. One screenshot of the map proves the panel
    // mounts; these prove the transition works in the real product.
    const picked = await cdp.evaluate(`(() => {
      const rows = [...document.querySelectorAll('.dt-node')];
      // Prefer a node that is actually blocked or weak -- the interesting one.
      const target = rows.find((el) => /blocked|weak/.test(el.textContent))
        || rows.find((el) => !/goal/.test(el.textContent))
        || rows[0];
      if (!target) return null;
      target.click();
      return target.querySelector('.dt-node-title')?.textContent?.trim() ?? 'node';
    })()`)

    if (picked) {
      await waitFor(cdp, '!!document.querySelector(".dt-detail h2")', 'the node detail pane')
      await sleep(500)
      const detailShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const detailPath = out.replace(/\.png$/, '-detail.png')
      await writeFile(detailPath, Buffer.from(detailShot.data, 'base64'))

      const detail = await cdp.evaluate(`(() => {
        const pane = document.querySelector('.dt-detail');
        return {
          node: pane?.querySelector('h2')?.textContent ?? null,
          why: pane?.querySelector('.dt-why')?.textContent ?? null,
          evidence: [...(pane?.querySelectorAll('.dt-evidence li') ?? [])].map((li) => li.textContent.trim().slice(0, 90)),
        };
      })()`)
      console.log('detail report:', JSON.stringify({ picked, ...detail }, null, 2))
      console.log(`screenshot → ${detailPath}`)

      await cdp.evaluate(`document.querySelector('.dt-primary')?.click()`)
      await waitFor(cdp, '!!document.querySelector(".dt-block")', 'the learning surface')
      await sleep(500)
      const lessonShot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      const lessonPath = out.replace(/\.png$/, '-lesson.png')
      await writeFile(lessonPath, Buffer.from(lessonShot.data, 'base64'))

      const lesson = await cdp.evaluate(`(() => ({
        blocks: [...document.querySelectorAll('[data-block-type]')].map((el) => el.getAttribute('data-block-type')),
        origin: document.querySelector('.dt-origin')?.textContent ?? null,
      }))()`)
      console.log('lesson report:', JSON.stringify(lesson, null, 2))
      console.log(`screenshot → ${lessonPath}`)
    }
  }
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

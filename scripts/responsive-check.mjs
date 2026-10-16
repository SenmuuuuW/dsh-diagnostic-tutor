/**
 * Capture the panel at the widths and themes that actually break layouts.
 *
 * Not a screenshot tool: it checks a short list of properties at each size and
 * reports pass/fail, then saves an image so a human can disagree with it.
 *
 * Usage:
 *   node scripts/responsive-check.mjs <url-with-token> [outdir]
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9271
const url = process.argv[2]
const outDir = process.argv[3] ?? '/tmp/responsive'
if (!url) {
  console.error('usage: node scripts/responsive-check.mjs <url-with-token> [outdir]')
  process.exit(2)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await mkdir(outDir, { recursive: true })

const SIZES = [
  { name: '1264', width: 1264, height: 860 },
  { name: '1440', width: 1440, height: 900 },
  { name: 'narrow', width: 900, height: 800 },
]

class Cdp {
  #socket
  #next = 1
  #pending = new Map()
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
    throw new Error('could not attach')
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
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return r.result?.value
  }
  close() {
    this.#socket?.close()
  }
}

/** Properties that decide whether a layout is usable at this size. */
const CHECK = `(() => {
  const doc = document.documentElement;
  const panel = document.querySelector('.dt-root') || document.querySelector('.dt-tab');
  if (!panel) return { mounted: false };
  const overflowX = doc.scrollWidth > doc.clientWidth + 1;
  // Anything sticking out of the viewport horizontally.
  const spill = [...document.querySelectorAll('.dt-root *, .dt-tab *')]
    .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 2)
    .slice(0, 4)
    .map((el) => (el.className || el.tagName).toString().slice(0, 40));
  const bar = document.querySelector('.dt-bar');
  const foot = document.querySelector('.dt-foot');
  const nowTitle = document.querySelector('.dt-now-title, .dt-detail h2');
  const cs = getComputedStyle(document.body);
  return {
    mounted: true,
    overflowX,
    spill,
    hasBar: !!bar,
    hasFooter: !!foot,
    barBackVisible: !!(bar && bar.querySelector('.dt-bar-back')),
    nowTitleVisible: !!(nowTitle && nowTitle.getBoundingClientRect().width > 0),
    columns: getComputedStyle(panel).gridTemplateColumns.split(' ').length,
    minTouchHeight: Math.min(
      ...[...document.querySelectorAll('.dt-primary, .dt-bar-back, .dt-quiet')]
        .map((el) => Math.round(el.getBoundingClientRect().height))
        .filter((h) => h > 0),
      99,
    ),
    bg: cs.backgroundColor,
  };
})()`

const profile = await mkdtemp(join(tmpdir(), 'dt-resp-'))
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

  // Open the panel once; the sizes below only resize the viewport.
  await cdp.evaluate(`(() => {
    const hit = [...document.querySelectorAll('button, [role=button]')]
      .find((el) => (el.textContent || '').trim() === 'Learn');
    hit?.click();
  })()`)
  await sleep(3000)

  const shot = async (name) => {
    const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(outDir, `${name}.png`), Buffer.from(image.data, 'base64'))
  }

  // DSH switches themes with an attribute on <body>, not with
  // prefers-color-scheme: its design tokens are defined under
  // `body[data-ds-dark-theme]`. Emulating the media query proved nothing —
  // DSH's own sidebar moved and the design tokens did not, which is why the
  // first run of this script reported a light panel in "dark" mode.
  for (const theme of ['light', 'dark']) {
    await cdp.evaluate(`(() => {
      if (${JSON.stringify(theme)} === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
      else document.body.removeAttribute('data-ds-dark-theme');
    })()`)
    await sleep(700)
    const tokens = await cdp.evaluate(`JSON.stringify({
      bg: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      fg: getComputedStyle(document.body).getPropertyValue('--dsw-alias-label-primary').trim(),
    })`)
    console.log(`\n[${theme}] tokens ${tokens}`)
    for (const size of SIZES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: size.width,
        height: size.height,
        deviceScaleFactor: 1,
        mobile: false,
      })
      await sleep(900)
      const result = await cdp.evaluate(CHECK)
      if (!result.mounted) throw new Error(`panel not mounted at ${theme}/${size.name}`)
      console.log(
        `${theme.padEnd(5)} ${size.name.padEnd(7)} cols=${String(result.columns ?? '?').padEnd(2)} bar=${result.hasBar} back=${result.barBackVisible} foot=${result.hasFooter} overflowX=${result.overflowX} spill=${result.spill?.length ?? 0} btnMinH=${result.minTouchHeight}`,
      )
      if (result.spill?.length) console.log(`         spill: ${result.spill.join(' | ')}`)
      await shot(`${theme}-${size.name}`)
    }
  }
} finally {
  cdp?.close()
  chrome.kill('SIGTERM')
}

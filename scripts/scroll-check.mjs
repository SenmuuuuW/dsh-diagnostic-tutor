/**
 * Real browser scroll regression, against the built plugin and preview fixtures.
 * The preview deliberately clips its slot, just like DSH: document scrolling
 * must not disguise a plugin that has no working scroll container.
 *
 * Usage: node scripts/scroll-check.mjs [preview-url] [outdir]
 * Requires Chrome; does not start a server or touch a live learner's data.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8391/')
const outDir = process.argv[3] ?? '/tmp/udt-scroll-check'
const port = 9283
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'dt-scroll-'))
await mkdir(outDir, { recursive: true })

class Cdp {
  socket
  next = 1
  pending = new Map()
  static async attach() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        const target = pages.find((entry) => entry.type === 'page')
        if (target?.webSocketDebuggerUrl) {
          const cdp = new Cdp()
          await cdp.open(target.webSocketDebuggerUrl)
          return cdp
        }
      } catch { /* Chrome is still starting. */ }
      await sleep(100)
    }
    throw new Error('could not attach to Chrome')
  }
  open(url) {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(url)
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
      this.socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data)
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      })
    })
  }
  send(method, params = {}) {
    const id = this.next++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
], { stdio: 'ignore' })

const cases = [
  { name: 'tab-narrow', surface: 'tab', width: 320, height: 640 },
  { name: 'tab-wide', surface: 'tab', width: 565, height: 809 },
  { name: 'tab-expanded', surface: 'tab', width: 1100, height: 800 },
  { name: 'panel-stacked', surface: 'panel', width: 900, height: 650 },
  { name: 'panel-mobile', surface: 'panel', width: 400, height: 640 },
  { name: 'panel-columns', surface: 'panel', width: 1440, height: 700 },
  { name: 'panel-first-use', surface: 'panel', scenario: 'first-use', width: 1200, height: 260 },
  { name: 'tab-library', surface: 'tab', scenario: 'library', width: 400, height: 640 },
  { name: 'panel-library', surface: 'panel', scenario: 'library', width: 1440, height: 640 },
  { name: 'panel-new', surface: 'panel', scenario: 'new', width: 1440, height: 640 },
]

let cdp
const results = []
try {
  cdp = await Cdp.attach()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  for (const theme of ['light', 'dark']) {
    for (const test of cases) {
      const url = new URL(base)
      url.searchParams.set('surface', test.surface)
      url.searchParams.set('scenario', test.scenario ?? 'scroll')
      url.searchParams.set('theme', theme)
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: test.width, height: test.height, deviceScaleFactor: 1, mobile: false,
      })
      await cdp.send('Page.navigate', { url: url.href })
      const root = test.surface === 'tab' ? '.dt-tab' : '.dt-root-wrap'
      let ready = false
      for (let attempt = 0; attempt < 50; attempt += 1) {
        ready = await cdp.evaluate(`!!document.querySelector(${JSON.stringify(root)}) && !!document.querySelector('.dt-data, .dt-project')`)
        if (ready) break
        await sleep(100)
      }
      assert.ok(ready, `${test.name}: fixture never mounted`)
      assert.ok(await cdp.evaluate(`document.documentElement.hasAttribute('data-diagnostic-tutor-preview')`), 'Use the fixture preview URL')
      // Await the lesson fetch as well, not just the initial overview.
      if (!test.scenario) {
        let lessonReady = false
        for (let attempt = 0; attempt < 50; attempt += 1) {
          lessonReady = await cdp.evaluate(`document.querySelectorAll('.dt-block').length >= 20`)
          if (lessonReady) break
          await sleep(100)
        }
        assert.ok(lessonReady, `${test.name}: long lesson never arrived`)
      }
      const selectors = test.name === 'panel-columns'
        ? ['.dt-pane:nth-child(1)', '.dt-pane:nth-child(2)', '.dt-pane:nth-child(3)']
        : [root]
      const panes = []
      for (const selector of selectors) {
        const getMetrics = `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { height: el.clientHeight, scrollHeight: el.scrollHeight,
            scrollTop: el.scrollTop, overflow: getComputedStyle(el).overflowY,
            x: Math.max(1, r.left + Math.min(r.width / 2, 140)),
            y: Math.max(1, Math.min(innerHeight - 25, r.top + 100)) };
        })()`
        const before = await cdp.evaluate(getMetrics)
        assert.ok(before, `${test.name}: missing ${selector}`)
        assert.ok(before.scrollHeight > before.height + 20, `${test.name}/${selector}: fixture must overflow`)
        assert.ok(['auto', 'scroll'].includes(before.overflow), `${test.name}/${selector}: no scroll container (${before.overflow})`)
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: 500,
        })
        await sleep(180)
        const after = await cdp.evaluate(getMetrics)
        assert.ok(after.scrollTop > 0, `${test.name}/${selector}: wheel did not scroll`)
        // A wheel event also has to reach the bottom, not just move a few pixels.
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: before.x, y: before.y, deltaX: 0, deltaY: before.scrollHeight * 2,
        })
        await sleep(180)
        const bottom = await cdp.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          return { scrollTop: el.scrollTop, remaining: el.scrollHeight - el.clientHeight - el.scrollTop };
        })()`)
        assert.ok(bottom.remaining <= 2, `${test.name}/${selector}: bottom is unreachable`)
        // A tall last element (e.g. the final pane) may not fit, but its bottom must.
        const endVisible = await cdp.evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          return el.lastElementChild.getBoundingClientRect().bottom <= Math.min(el.getBoundingClientRect().bottom, innerHeight) + 2;
        })()`)
        assert.ok(endVisible, `${test.name}/${selector}: last content is clipped`)
        panes.push({ selector, wheelMoved: after.scrollTop, bottom: bottom.scrollTop })
      }
      const layout = await cdp.evaluate(`(() => {
        const root = document.querySelector(${JSON.stringify(root)});
        const host = document.querySelector('#host');
        return { rootHeight: root.getBoundingClientRect().height, hostHeight: host.clientHeight,
          pageScroll: document.scrollingElement.scrollTop,
          pageOverflow: document.documentElement.scrollHeight > innerHeight + 1,
          overflowX: root.scrollWidth > root.clientWidth + 1 };
      })()`)
      assert.ok(layout.rootHeight <= layout.hostHeight + 1, `${test.name}: plugin escaped its slot`)
      assert.equal(layout.pageScroll, 0, `${test.name}: scrolled the document instead of the plugin`)
      assert.equal(layout.pageOverflow, false, `${test.name}: document overflow masks a broken plugin`)
      assert.equal(layout.overflowX, false, `${test.name}: horizontal overflow`)
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(outDir, `${test.name}-${theme}.png`), Buffer.from(image.data, 'base64'))
      results.push({ name: test.name, theme, panes, layout })
      console.log(`PASS ${test.name}/${theme}: ${panes.map((pane) => `${pane.selector} wheel=${pane.wheelMoved} bottom=${pane.bottom}`).join('; ')}`)
    }
  }
  console.log(`\n${results.length} browser scroll cases passed; screenshots: ${outDir}`)
} finally {
  await writeFile(join(outDir, 'results.json'), JSON.stringify(results, null, 2))
  cdp?.socket?.close()
  chrome.kill('SIGTERM')
}

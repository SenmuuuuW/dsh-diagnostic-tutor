/**
 * Real Chrome/CDP regression for the redesigned Learning map.
 *
 * Usage: node scripts/path-check.mjs [http://localhost:8391/] [outdir]
 * Start `pnpm preview` separately. This script never starts a server and never
 * lets the preview reach a learner-data API: the preview's fixture clients are
 * the only data source.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = new URL(process.argv[2] ?? 'http://localhost:8391/')
const outDir = process.argv[3] ?? '/tmp/udt-path-browser'
const port = 9373
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'udt-path-'))
await mkdir(outDir, { recursive: true })
const results = []
const runtimeErrors = []
let chrome
let cdp
let failure
let currentCase = 'startup'

class Cdp {
  socket
  next = 1
  pending = new Map()
  async open(url) {
    this.socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push({ case: currentCase, ...message.params.exceptionDetails })
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
      else pending.resolve(message.result)
    })
  }
  send(method, params = {}) {
    const id = this.next++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 15000)
      this.pending.set(id, { resolve, reject, timer })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
}

async function waitFor(expression, description, timeout = 8000) {
  const until = Date.now() + timeout
  do {
    if (await cdp.evaluate(expression)) return
    await delay(70)
  } while (Date.now() < until)
  const text = await cdp.evaluate(`document.body?.innerText?.slice(0, 1600)`)
  throw new Error(`${currentCase}: ${description}\n${text}`)
}
async function click(label) {
  const clicked = await cdp.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === ${JSON.stringify(label)} || entry.getAttribute('aria-label') === ${JSON.stringify(label)})
    if (!button) return false
    button.click()
    return true
  })()`)
  assert.ok(clicked, `${currentCase}: missing button ${label}`)
  await delay(180)
}
async function fill(selector, value) {
  const filled = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return false
    const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
  assert.ok(filled, `${currentCase}: missing field ${selector}`)
  await delay(60)
}
async function screenshot(name) {
  await cdp.evaluate(`(() => { const bar = document.querySelector('.preview-bar'); if (bar) bar.style.display = 'none' })()`)
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(join(outDir, `${name}.png`), Buffer.from(image.data, 'base64'))
}
async function layoutCheck(rootSelector) {
  const layout = await cdp.evaluate(`(() => {
    const root = document.querySelector(${JSON.stringify(rootSelector)})
    return { documentOverflowX: document.documentElement.scrollWidth > innerWidth + 1,
      rootOverflowX: root ? root.scrollWidth > root.clientWidth + 1 : true,
      rootVisible: !!root && root.getBoundingClientRect().height > 100 }
  })()`)
  assert.equal(layout.rootVisible, true, `${currentCase}: root ${rootSelector} did not render`)
  assert.equal(layout.documentOverflowX, false, `${currentCase}: horizontal document overflow`)
  assert.equal(layout.rootOverflowX, false, `${currentCase}: horizontal root overflow`)
}
async function open({ surface = 'map', scenario, width = 1440, theme = 'light' }) {
  currentCase = `${scenario}-${width}-${theme}`
  const url = new URL(base)
  url.searchParams.set('surface', surface)
  url.searchParams.set('scenario', scenario)
  url.searchParams.set('theme', theme)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp.send('Page.navigate', { url: url.href })
  await waitFor(`document.documentElement.hasAttribute('data-diagnostic-tutor-preview')`, 'preview never mounted')
  await waitFor(`!!document.querySelector('.dtx-map, .dtx-tab')`, 'plugin root never mounted; build the client bundle first')
  await waitFor(`!!document.querySelector('.dtx-topbar, .dtx-tab')`, 'topbar never mounted')
  await layoutCheck(surface === 'tab' ? '.dtx-tab' : '.dtx-map')
  await delay(200)
}

async function libraryCase() {
  await waitFor(`!!document.querySelector('.dtx-hero')`, 'library welcome did not render')
  assert.match(await cdp.evaluate(`document.querySelector('.dtx-hero').textContent`), /Welcome back|欢迎回来/)
  assert.ok((await cdp.evaluate(`document.querySelectorAll('.dtx-project-row').length`)) >= 1)
  await screenshot(`${currentCase}-library`)
  return { projects: await cdp.evaluate(`document.querySelectorAll('.dtx-project-row').length`) }
}
async function goalCase() {
  await waitFor(`!!document.querySelector('#dtx-purpose')`, 'goal form did not render')
  await fill('#dtx-purpose', 'Understand regression models')
  await fill('#dtx-outcomes', 'Explain a baseline\nCompare two models')
  await fill('#dtx-weekly', '480')
  await fill('#dtx-session', '45')
  await click('Save goal')
  await waitFor(`[...document.querySelectorAll('.dtx-stage')].findIndex((entry) => entry.getAttribute('data-state') === 'current') === 1`, 'stage bar did not move to diagnosis after saving')
  await screenshot(`${currentCase}-goal`)
  return { saved: true }
}
async function diagnosisCase() {
  await waitFor(`!!document.querySelector('.dtx-next')`, 'next-step card did not render')
  await click('Request diagnosis')
  await waitFor(`!!document.querySelector('.dtx-next[data-kind=waiting]')`, 'waiting card did not appear after requesting diagnosis')
  assert.match(await cdp.evaluate(`document.querySelector('.dtx-next')?.textContent ?? ''`), /Waiting|等待/)
  assert.ok(await cdp.evaluate(`!!document.querySelector('.dtx-spinner')`), 'waiting spinner missing')
  await screenshot(`${currentCase}-waiting`)
  return { waiting: true }
}
async function proposalCase() {
  await waitFor(`!!document.querySelector('.dtx-proposal')`, 'proposal card did not render')
  await waitFor(`document.querySelectorAll('.dtx-lesson').length > 0`, 'route modules did not render')
  const lessons = await cdp.evaluate(`document.querySelectorAll('.dtx-lesson').length`)
  await click('Accept route')
  await waitFor(`!!document.querySelector('.dtx-next')`, 'learning next-step did not appear after acceptance')
  await screenshot(`${currentCase}-accepted`)
  return { lessons, accepted: true }
}
async function learningCase() {
  await waitFor(`!!document.querySelector('.dtx-next')`, 'learning next-step did not render')
  await waitFor(`document.querySelectorAll('.dtx-lesson').length > 0`, 'route modules did not render')
  const collapsed = await cdp.evaluate(`document.querySelectorAll('.dtx-lesson').length`)
  const expanded = await cdp.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').trim() === 'Expand all' || (entry.textContent || '').trim() === '展开全部'); if (!button) return false; button.click(); return true })()`)
  assert.equal(expanded, true, `${currentCase}: route modules have no expand-all control`)
  await waitFor(`document.querySelectorAll('.dtx-lesson').length > ${collapsed}`, 'expanding modules did not reveal lessons')
  const first = await cdp.evaluate(`(() => { const el = document.querySelector('.dtx-lesson'); return el ? el.textContent.trim().slice(0, 40) : '' })()`)
  const rail = await cdp.evaluate(`document.querySelector('.dtx-rail')?.textContent?.slice(0, 200) ?? ''`)
  assert.ok(rail.length > 20, `${currentCase}: lesson rail is empty`)
  await screenshot(`${currentCase}-learning`)
  return { lessons: await cdp.evaluate(`document.querySelectorAll('.dtx-lesson').length`), collapsed, first, rail: rail.slice(0, 40) }
}
async function knowledgeCase() {
  await click('Knowledge & evidence')
  await waitFor(`!!document.querySelector('.dtx-knowledge-list')`, 'knowledge list did not render')
  await waitFor(`document.querySelectorAll('.dtx-node-row').length > 0`, 'knowledge rows did not render')
  const row = await cdp.evaluate(`(() => { const el = document.querySelector('.dtx-node-row'); el?.click(); return el?.textContent?.slice(0, 30) ?? '' })()`)
  await waitFor(`!!document.querySelector('.dtx-knowledge-detail')`, 'knowledge detail did not render')
  await screenshot(`${currentCase}-knowledge`)
  return { nodes: await cdp.evaluate(`document.querySelectorAll('.dtx-node-row').length`), row }
}
async function tabCase() {
  await waitFor(`!!document.querySelector('.dtx-tab')`, 'lesson tab did not render')
  await waitFor(`!!document.querySelector('.dtx-tab h2')`, 'lesson title did not render')
  const text = await cdp.evaluate(`document.querySelector('.dtx-tab').textContent`)
  assert.match(text, /In this lesson|本课内容/)
  const scroll = await cdp.evaluate(`(() => { const el = document.querySelector('.dtx-tab'); const css = getComputedStyle(el); return { overflowY: css.overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight } })()`)
  assert.equal(scroll.overflowY, 'auto', `${currentCase}: lesson tab must scroll its own content`)
  await screenshot(`${currentCase}-tab`)
  return { title: await cdp.evaluate(`document.querySelector('.dtx-tab h2')?.textContent ?? ''`), scroll }
}
async function studyCase() {
  await waitFor(`!!document.querySelector('.dtx-study-entry')`, 'focused-study entry did not render')
  await click('Start focused study')
  await waitFor(`!!document.querySelector('.dtx-study')`, 'focused study did not mount')
  await waitFor(`/Step 1 of \\d+/.test(document.querySelector('.dtx-study')?.textContent ?? '')`, 'focused-study step count did not render')
  const entries = await cdp.evaluate(`document.querySelectorAll('.dtx-study-card [data-block-type]').length`)
  assert.equal(entries, 1, `${currentCase}: focused study must render exactly one block`)
  await screenshot(`${currentCase}-study`)
  return { steps: '1 / 8', blocks: entries }
}

async function languageCase() {
  await waitFor(`!!document.querySelector('.dt-lang-toggle')`, 'language toggle missing')
  await cdp.evaluate(`document.querySelector('.dt-lang-toggle').click()`)
  await waitFor(`document.querySelector('.dt-lang-toggle')?.textContent === 'EN'`, 'did not switch to Chinese')
  assert.match(await cdp.evaluate(`document.querySelector('.dtx-map')?.textContent ?? ''`), /[\u4e00-\u9fff]/)
  await screenshot(`${currentCase}-zh`)
  await cdp.evaluate(`document.querySelector('.dt-lang-toggle').click()`)
  await waitFor(`document.querySelector('.dt-lang-toggle')?.textContent === '中文'`, 'did not switch back to English')
  return { language: true }
}

async function reviewCase() {
  await click('Review')
  await waitFor(`document.body.innerText.includes('Due now')`, 'review page')
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('.dtx-review-front')].length`), 1)
  await screenshot(`${currentCase}-review`)
  await click('Show the back')
  await waitFor(`document.body.innerText.includes('Good')`, 'review back')
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('.dtx-grade')].length`), 4)
  await screenshot(`${currentCase}-review-back`)
}

async function insightsCase() {
  await click('Insights')
  await waitFor(`document.body.innerText.includes('Learning insights')`, 'insights page')
  assert.equal(await cdp.evaluate(`[...document.querySelectorAll('.dtx-insight-card')].length`), 5)
  const text = await cdp.evaluate(`document.body.innerText`)
  assert.doesNotMatch(text, /\d+\s*%/)
  await screenshot(`${currentCase}-insights`)
}

const plans = [
  { scenario: 'library', case: libraryCase, widths: [1440, 400], themes: ['light', 'dark'] },
  { scenario: 'path-setup', case: goalCase, widths: [1440, 900], themes: ['light'] },
  { scenario: 'path-assessment', case: diagnosisCase, widths: [1440, 400], themes: ['light'] },
  { scenario: 'path-draft', case: proposalCase, widths: [1440, 900], themes: ['light'] },
  { scenario: 'curriculum', case: learningCase, widths: [1440, 900, 400], themes: ['light', 'dark'] },
  { scenario: 'curriculum', case: knowledgeCase, widths: [1440, 400], themes: ['light'], after: 'learningCase' },
  { scenario: 'curriculum', surface: 'tab', case: tabCase, widths: [1440, 400], themes: ['light'] },
  { scenario: 'curriculum', surface: 'tab', case: studyCase, widths: [1440, 400], themes: ['light'] },
  { scenario: 'curriculum', case: languageCase, widths: [1440], themes: ['light'] },
  { scenario: 'curriculum', case: reviewCase, widths: [1440, 400], themes: ['light'] },
  { scenario: 'curriculum', case: insightsCase, widths: [1440, 400], themes: ['light'] },
]

try {
  chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
  let target
  for (let index = 0; index < 100; index += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl)
      if (target) break
    } catch { /* Chrome is still starting. */ }
    await delay(100)
  }
  assert.ok(target, 'Chrome CDP never became available')
  cdp = new Cdp()
  await cdp.open(target.webSocketDebuggerUrl)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')

  for (const plan of plans) {
    for (const width of plan.widths) {
      for (const theme of plan.themes) {
        currentCase = `${plan.surface ?? 'map'}-${plan.scenario}-${width}-${theme}`
        await open({ surface: plan.surface ?? 'map', scenario: plan.scenario, width, theme })
        if (plan.after !== undefined) await plans.find((entry) => entry.case.name === plan.after).case({})
        const checks = await plan.case({})
        results.push({ case: currentCase, checks })
        assert.equal(runtimeErrors.length, 0, `${currentCase}: runtime exception ${JSON.stringify(runtimeErrors.slice(0, 2))}`)
        console.log(`PASS ${currentCase}: ${JSON.stringify(checks)}`)
      }
    }
  }
  console.log(`\n${results.length} browser cases passed; screenshots: ${outDir}`)
} catch (error) {
  failure = error
  console.error(`FAIL ${currentCase}: ${error.message}`)
  console.error(`screenshots: ${outDir}`)
  process.exitCode = 1
} finally {
  try { await cdp?.send('Browser.close') } catch { /* already gone */ }
  chrome?.kill('SIGTERM')
  if (failure !== undefined) process.exitCode = 1
}

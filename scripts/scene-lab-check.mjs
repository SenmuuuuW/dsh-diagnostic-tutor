/**
 * Research-only browser check for Scene Lab. Serves the repository preview
 * server and drives headless Chrome via CDP. Writes metrics and screenshots;
 * this script is not part of the plugin runtime.
 *
 *   node preview/serve.mjs
 *   node scripts/scene-lab-check.mjs http://127.0.0.1:8391
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8391'
const ROOT = process.cwd()
const MANIFEST = join(ROOT, 'research/dynamic-lesson-engine/benchmark/final-manifest.json')
const OUT = join(ROOT, 'research/dynamic-lesson-engine/benchmark/renderings')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await mkdir(OUT, { recursive: true })
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'))
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9570', `--user-data-dir=${join(OUT, '.chrome-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 120; i += 1) {
  try {
    const list = await (await fetch('http://127.0.0.1:9570/json/list')).json()
    target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl)
    if (target) break
  } catch {}
  await sleep(100)
}
if (!target) throw new Error('Chrome CDP target not found')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
const exceptions = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text)
  const resolver = pending.get(message.id)
  if (resolver) { pending.delete(message.id); resolver(message.result) }
})
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${BASE}/preview/scene-lab/index.html` })
await sleep(2000)

const results = []
for (const row of manifest) {
  if (!row.final) {
    results.push({ id: row.id, status: 'not-rendered', reason: 'final SceneSpec invalid' })
    continue
  }
  const spec = JSON.parse(await readFile(join(ROOT, 'research/dynamic-lesson-engine/benchmark', row.final), 'utf8'))
  const input = JSON.stringify(spec)
  await evaluate(`(() => { const t = document.querySelector('#spec-input'); t.value = ${JSON.stringify(input)}; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#render').click() })()`)
  let state = null
  for (let i = 0; i < 80; i += 1) {
    await sleep(100)
    state = await evaluate(`(() => {
      const validation = document.querySelector('#validation');
      const svg = document.querySelector('#stage svg');
      return {
        validation: validation?.textContent ?? '',
        validationBad: validation?.classList.contains('bad') ?? false,
        svg: !!svg, primitives: document.querySelectorAll('#stage [data-primitive]').length,
        textNodes: document.querySelectorAll('#stage text').length,
        metrics: document.querySelector('#metrics')?.textContent ?? '',
        title: document.querySelector('#scene-title')?.textContent ?? '',
        status: document.querySelector('#status')?.textContent ?? '',
        controls: document.querySelectorAll('#controls input[type=range]').length,
        checkpoints: document.querySelectorAll('#checkpoints button').length,
        timelineMax: Number(document.querySelector('#timeline')?.max ?? 0),
        fallbackHidden: document.querySelector('#fallback')?.hidden ?? true,
        ariaLabel: svg?.getAttribute('aria-label') ?? '',
      }
    })()`)
    if (state.validationBad || state.svg || state.status === 'invalid') break
  }
  const before = state
  let interaction = null
  if (before?.svg) {
    await evaluate(`document.querySelector('#play').click()`)
    await sleep(650)
    const playing = await evaluate(`(() => ({ time: document.querySelector('#time-label')?.textContent, label: document.querySelector('#play')?.textContent }))()`)
    await evaluate(`document.querySelector('#play').click()`)
    const paused = await evaluate(`document.querySelector('#time-label')?.textContent`)
    await evaluate(`document.querySelector('#forward').click()`)
    await sleep(120)
    const stepped = await evaluate(`document.querySelector('#time-label')?.textContent`)
    await evaluate(`(() => { const i = document.querySelector('#controls input[type=range]'); if (i) { i.value = i.max; i.dispatchEvent(new Event('input', { bubbles: true })) } })()`)
    const controlValue = await evaluate(`document.querySelector('#controls output')?.textContent ?? null`)
    interaction = { playing, paused, stepped, controlValue }
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  if (shot?.data) await writeFile(join(OUT, `${row.id}.png`), Buffer.from(shot.data, 'base64'))
  results.push({ id: row.id, file: row.final, ...before, interaction })
  console.log(row.id, before?.svg ? 'rendered' : 'failed', before?.primitives, before?.metrics)
}
await writeFile(join(OUT, 'render-results.json'), JSON.stringify({ base: BASE, chromeExceptions: exceptions, results }, null, 2) + '\n')
console.log('wrote', join(OUT, 'render-results.json'))
ws.close(); chrome.kill('SIGTERM')

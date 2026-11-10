/** Render every v2 final scene in the real Scene Lab and record browser results. */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASE = process.argv[2] ?? 'http://127.0.0.1:8391'
const OUT = join(ROOT, 'research/dynamic-lesson-engine/v2/results')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
await mkdir(OUT, { recursive: true })
const files = []
for (const folder of ['regression', 'holdout']) {
  for (const name of await readdir(join(ROOT, 'research/dynamic-lesson-engine/v2/generated', folder))) {
    if (name.endsWith('.scene.json')) files.push({ folder, name, path: join(ROOT, 'research/dynamic-lesson-engine/v2/generated', folder, name) })
  }
}
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9592', `--user-data-dir=${join(OUT, '.chrome-profile')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9592/json/list')).json(); target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0; const pending = new Map(); const exceptions = []
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${BASE}/preview/scene-lab/index.html` }); await sleep(1800)
const results = []
for (const file of files) {
  const spec = JSON.parse(await readFile(file.path, 'utf8'))
  await evaluate(`(() => { const t = document.querySelector('#spec-input'); t.value = ${JSON.stringify(JSON.stringify(spec))}; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#render').click() })()`)
  await sleep(250)
  const state = await evaluate(`(() => ({ validation: document.querySelector('#validation')?.textContent ?? '', bad: document.querySelector('#validation')?.classList.contains('bad') ?? false, svg: !!document.querySelector('#stage svg'), primitives: document.querySelectorAll('#stage [data-primitive]').length, stateLabel: document.querySelector('#scene-state')?.textContent ?? '', metrics: document.querySelector('#metrics')?.textContent ?? '', status: document.querySelector('#status')?.textContent ?? '' }))()`)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  if (shot?.data) await writeFile(join(OUT, `${file.folder}-${file.name.replace('.scene.json','')}.png`), Buffer.from(shot.data, 'base64'))
  results.push({ folder: file.folder, name: file.name, screenshot: `${file.folder}-${file.name.replace('.scene.json','')}.png`, ...state })
  console.log(file.folder, file.name, state.svg ? 'rendered' : 'FAILED', state.primitives, state.stateLabel)
}
await writeFile(join(OUT, 'render-results.json'), JSON.stringify({ base: BASE, exceptions, results }, null, 2) + '\n')
console.log('wrote', join(OUT, 'render-results.json'))
ws.close(); chrome.kill('SIGTERM')

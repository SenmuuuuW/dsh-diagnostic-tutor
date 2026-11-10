/** Real-browser frame/parameter visual inspection for a SceneSpec candidate. */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { visualLintScene } from '../src/scene/visual-lint.js'

const specPath = process.argv[2]
const outDir = process.argv[3] ?? 'research/dynamic-lesson-engine/v0.9-visual'
const base = process.argv[4] ?? 'http://127.0.0.1:8391'
if (!specPath) throw new Error('usage: node scripts/scene-visual-inspect.mjs <spec.json> <out-dir> [base]')
await mkdir(outDir, { recursive: true })
const spec = JSON.parse(await readFile(specPath, 'utf8'))
const staticReport = visualLintScene(spec)
const id = basename(specPath, '.json')
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9596', `--user-data-dir=/tmp/udt-v09-visual-${id}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9596/json/list')).json(); target = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0; const pending = new Map(); const exceptions = []
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${base}/preview/scene-lab/index.html` }); await sleep(1800)
await evaluate(`(() => { const t = document.querySelector('#spec-input'); t.value = ${JSON.stringify(JSON.stringify(spec))}; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#render').click() })()`)
await sleep(500)
const times = [...new Set([0, spec.timeline.duration / 2, spec.timeline.duration, ...(spec.checkpoints ?? []).map((c) => c.at)])]
const contexts = []
for (const time of times) contexts.push({ label: `t=${time.toFixed(2)}`, time, params: {} })
for (const property of spec.properties ?? []) for (const [label, value] of [['min', property.min], ['mid', (property.min + property.max) / 2], ['max', property.max]]) contexts.push({ label: `${property.id}=${label}`, time: 0, params: { [property.id]: value } })
const results = []
for (const context of contexts) {
  await evaluate(`(() => {
    const timeline = document.querySelector('#timeline'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(timeline, ${JSON.stringify(String(context.time))}); timeline.dispatchEvent(new Event('input', { bubbles: true }));
    for (const [id, value] of Object.entries(${JSON.stringify(context.params)})) {
      const input = document.querySelector('#controls input[aria-label="' + id + '"]') ?? [...document.querySelectorAll('#controls input')].find((i) => i.getAttribute('aria-label') === id);
      if (input) { set.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  })()`)
  await sleep(200)
  const dom = await evaluate(`(() => {
    const svg = document.querySelector('#stage svg'); if (!svg) return { svg:false };
    const stage = svg.getBoundingClientRect();
    const nodes = [...svg.querySelectorAll('[data-primitive],[data-scene-primitive]')].map((el) => { const r=el.getBoundingClientRect(); return { id: el.getAttribute('data-primitive') ?? el.getAttribute('data-scene-primitive'), width:r.width, height:r.height, visible:r.width>0 && r.height>0 && getComputedStyle(el).visibility!=='hidden' && getComputedStyle(el).display!=='none', x:r.x, y:r.y } });
    return { svg:true, stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height}, nodes, visible:nodes.filter((n)=>n.visible).length, total:nodes.length };
  })()`)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = `${id}-${context.label.replace(/[^a-zA-Z0-9._=-]+/g,'_')}.png`
  if (shot?.data) await writeFile(join(outDir, file), Buffer.from(shot.data, 'base64'))
  results.push({ ...context, file, dom })
}
await writeFile(join(outDir, `${id}.json`), JSON.stringify({ id, specPath, static: staticReport, exceptions, contexts: results }, null, 2) + '\n')
console.log(JSON.stringify({ id, staticOk: staticReport.ok, errors: staticReport.stats.errors, warnings: staticReport.stats.warnings, contexts: results.length, exceptions }, null, 2))
ws.close(); chrome.kill('SIGTERM')

/**
 * Browser safety/accessibility/performance checks for the Scene Lab research
 * prototype. Requires `node preview/serve.mjs` on the URL passed as argv[2].
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8391'
const ROOT = process.cwd()
const OUT = join(ROOT, 'research/dynamic-lesson-engine/safety')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await mkdir(OUT, { recursive: true })

const baseSpec = JSON.parse(await readFile(join(ROOT, 'research/dynamic-lesson-engine/examples/gradient-descent.json'), 'utf8'))
const malicious = {
  ...structuredClone(baseSpec),
  primitives: [
    { ...structuredClone(baseSpec.primitives[0]), onclick: 'alert(1)' },
    { ...structuredClone(baseSpec.primitives[1]), fill: 'url(https://evil.example/x)' },
    { ...structuredClone(baseSpec.primitives[2]), d: 'M 0 0 <script>alert(1)</script>' },
  ],
}
const oversized = {
  ...structuredClone(baseSpec),
  primitives: Array.from({ length: 121 }, (_, index) => ({ id: `p${index}`, type: 'circle', cx: 10, cy: 10, r: 2, fill: '#000' })),
}
const stress = {
  ...structuredClone(baseSpec),
  viewport: { width: 1200, height: 800, background: '#ffffff' },
  properties: [{ id: 'phase', label: 'phase', min: 0, max: 6.28, step: 0.01, default: 1 }],
  primitives: Array.from({ length: 120 }, (_, index) => ({
    id: `p${index}`, type: 'circle', cx: 60 + (index % 20) * 56, cy: 60 + Math.floor(index / 20) * 56,
    r: 8, fill: '#2563eb', opacity: { expr: '0.4 + 0.6*abs(sin(phase))' },
  })),
  timeline: { duration: 10, tracks: [{ target: { primitive: 'p0', property: 'cy' }, keyframes: Array.from({ length: 100 }, (_, index) => ({ at: index / 10, value: 60 + index, easing: 'linear' })) }] },
  controls: [{ id: 'phase-control', kind: 'slider', propertyId: 'phase', label: 'phase' }],
}

const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9571', `--user-data-dir=${join(OUT, '.chrome-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 120; i += 1) {
  try { const list = await (await fetch('http://127.0.0.1:9571/json/list')).json(); target = list.find((item) => item.type === 'page' && item.webSocketDebuggerUrl); if (target) break } catch {}
  await sleep(100)
}
if (!target) throw new Error('no CDP target')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let seq = 0
const pending = new Map()
const exceptions = []
const requests = []
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data)
  if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text)
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url)
  const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) }
})
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `${BASE}/preview/scene-lab/index.html` })
await sleep(1800)
const setSpec = async (spec) => {
  const text = JSON.stringify(spec)
  return evaluate(`(() => { const t = document.querySelector('#spec-input'); t.value = ${JSON.stringify(text)}; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#render').click() })()`)
}
const readState = () => evaluate(`(() => ({
  validation: document.querySelector('#validation')?.textContent,
  bad: document.querySelector('#validation')?.classList.contains('bad'),
  svg: document.querySelectorAll('#stage svg').length,
  scripts: document.querySelectorAll('#stage script').length,
  foreign: document.querySelectorAll('#stage foreignObject').length,
  handlers: [...document.querySelectorAll('#stage *')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name))).length,
  externalHrefs: [...document.querySelectorAll('#stage *')].filter(e => /^https?:/i.test(e.getAttribute('href') ?? '') || /^https?:/i.test(e.getAttribute('xlink:href') ?? '')).length,
  status: document.querySelector('#status')?.textContent,
  playDisabled: document.querySelector('#play')?.disabled ?? false,
  alt: document.querySelector('#stage svg')?.getAttribute('aria-label') ?? '',
  metrics: document.querySelector('#metrics')?.textContent,
}))()`)

const results = { malicious: null, oversized: null, stress: null, reducedMotion: null, keyboard: null, checkpoint: null, determinism: null, exceptions, externalRequests: [] }
await setSpec(malicious); await sleep(500); results.malicious = await readState()
await setSpec(oversized); await sleep(500); results.oversized = await readState()
await setSpec(stress); await sleep(500); results.stress = await readState()
await evaluate(`document.querySelector('#example-select').value='gradient-descent'; document.querySelector('#example-select').dispatchEvent(new Event('change',{bubbles:true}))`)
await sleep(700)
await evaluate(`document.body.focus()`)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
await sleep(300)
const keyboardPlay = await evaluate(`document.querySelector('#time-label')?.textContent`)
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 })
await evaluate(`document.querySelector('#play').click()`)
await sleep(200)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
await sleep(200)
const keyboardStep = await evaluate(`document.querySelector('#time-label')?.textContent`)
results.keyboard = { afterSpace: keyboardPlay, afterArrow: keyboardStep }
await evaluate(`document.querySelector('#replay').click()`)
await sleep(100)
await evaluate(`document.querySelector('#checkpoints button')?.click()`)
await sleep(200)
results.checkpoint = { time: await evaluate(`document.querySelector('#time-label')?.textContent`), status: await evaluate(`document.querySelector('#status')?.textContent`) }
const attr = async () => evaluate(`document.querySelector('#stage svg')?.outerHTML ?? ''`)
await evaluate(`document.querySelector('#replay').click()`); await sleep(100)
await evaluate(`document.querySelector('#timeline').value='2'; document.querySelector('#timeline').dispatchEvent(new Event('input',{bubbles:true}))`); await sleep(150)
const first = await attr()
await evaluate(`document.querySelector('#timeline').value='0'; document.querySelector('#timeline').dispatchEvent(new Event('input',{bubbles:true}))`); await sleep(100)
await evaluate(`document.querySelector('#timeline').value='2'; document.querySelector('#timeline').dispatchEvent(new Event('input',{bubbles:true}))`); await sleep(150)
const second = await attr()
results.determinism = { equalAfterSeek: first === second, chars: first.length }
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
await evaluate(`document.querySelector('#example-select').value='gradient-descent'; document.querySelector('#example-select').dispatchEvent(new Event('change',{bubbles:true}))`)
await sleep(700)
results.reducedMotion = await readState()
results.externalRequests = requests.filter((url) => !url.startsWith(BASE))
await writeFile(join(OUT, 'results.json'), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify({ malicious: results.malicious, oversized: results.oversized, stress: results.stress?.metrics, reduced: results.reducedMotion?.status, keyboard: results.keyboard, checkpoint: results.checkpoint, determinism: results.determinism, exceptions, externalRequests: results.externalRequests }, null, 2))
ws.close(); chrome.kill('SIGTERM')

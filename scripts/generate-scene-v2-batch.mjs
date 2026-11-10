/** Run one real-model v2 batch in the isolated DSH page, then copy raw files. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { batchPrompt } from '../research/dynamic-lesson-engine/v2/batch-prompt.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
  if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]])
  return all
}, []))
const token = args.token
const ids = args.ids.split(',')
const folder = args.folder
if (!token || ids.length === 0 || !folder) throw new Error('usage: --token ... --ids a,b --folder regression')
const cases = JSON.parse(readFileSync(args.cases ?? 'research/dynamic-lesson-engine/v2/cases-holdout.json', 'utf8')).filter((entry) => ids.includes(entry.id))
if (cases.length !== ids.length) throw new Error('case ids not found')
const outRoot = join(process.cwd(), 'research/dynamic-lesson-engine/v2/generated', folder)
mkdirSync(outRoot, { recursive: true })
const rawDir = `/tmp/udt-scene-v2/${folder}`
mkdirSync(rawDir, { recursive: true })
for (const id of ids) for (const suffix of ['scene', 'plan']) { const stale = join(rawDir, `${id}.${suffix}.json`); if (existsSync(stale)) rmSync(stale) }
const prompt = batchPrompt(cases, folder)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9590', `--user-data-dir=/tmp/udt-v08-gen-${folder}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9590/json/list')).json(); target = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text)
  const p = pending.get(message.id); if (p) { pending.delete(message.id); p(message.result) }
})
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:8510/?${token}` })
await sleep(2500)
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Continue'); b && b.click() })()`)
await sleep(500)
// Open a fresh conversation so benchmark prompts do not inherit learning context.
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('New Session')); b && b.click(); return !!b })()`)
await sleep(1800)
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Continue'); b && b.click() })()`)
await sleep(400)
const focused = await evaluate(`(() => { const e = document.querySelector('[contenteditable=true]'); if (!e) return false; e.focus(); return true })()`)
if (!focused) throw new Error('no composer')
await send('Input.insertText', { text: prompt })
await sleep(600)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
const expected = ids.flatMap((id) => [`${id}.scene.json`, `${id}.plan.json`])
for (let i = 0; i < 360; i += 1) {
  await sleep(1000)
  const found = expected.filter((name) => existsSync(join(rawDir, name)))
  if (i % 20 === 0) console.log('wait', i, found.length, '/', expected.length, String(await evaluate('document.body.innerText')).slice(-220))
  if (found.length === expected.length) break
}
const copied = []
for (const id of ids) for (const suffix of ['scene', 'plan']) {
  const source = join(rawDir, `${id}.${suffix}.json`)
  if (existsSync(source)) { copyFileSync(source, join(outRoot, `${id}.${suffix}.json`)); copied.push(`${id}.${suffix}.json`) }
}
console.log(JSON.stringify({ folder, requested: ids, copied, errors, body: String(await evaluate('document.body.innerText')).slice(-1200) }, null, 2))
ws.close(); chrome.kill('SIGTERM')

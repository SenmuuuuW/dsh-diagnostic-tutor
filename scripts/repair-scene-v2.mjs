/** Send validated repair errors for existing v2 scene files to the real model. */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateSceneSpec, formatValidationErrors } from '../research/dynamic-lesson-engine/scene-spec.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
  if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]])
  return all
}, []))
const token = args.token
const folder = args.folder
const ids = args.ids.split(',')
const root = `/tmp/udt-scene-v2/${folder}`
const outRoot = join(process.cwd(), 'research/dynamic-lesson-engine/v2/generated', folder)
if (!existsSync(root)) mkdirSync(root, { recursive: true })
const cases = args.cases ? JSON.parse(readFileSync(args.cases, 'utf8')) : []
let errorsByFile = ''
for (const id of ids) {
  const path = join(root, `${id}.scene.json`)
  const spec = JSON.parse(readFileSync(path, 'utf8'))
  const result = validateSceneSpec(spec)
  if (!result.ok) errorsByFile += `\n### ${id}.scene.json\n${formatValidationErrors(result.errors)}\n`
}
const prompt = `Six existing SceneSpec files in ${root}/ failed strict validation. Repair ONLY those files in place with the write tool, preserving the teaching idea. Do not add arbitrary code, URLs, event handlers or new top-level keys. For easing, use exactly one of: linear, ease-in, ease-out, ease-in-out, step. For algorithm scenes, keep at most 12 named states; merge snapshots if necessary. Errors:\n${errorsByFile}\nWrite complete corrected JSON files directly. Reply "repaired" when done.`
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9591', `--user-data-dir=/tmp/udt-v08-repair`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9591/json/list')).json(); target = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:8510/?${token}` }); await sleep(2500)
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Continue'); b && b.click() })()`); await sleep(500)
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('New Session')); b && b.click() })()`); await sleep(1800)
await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Continue'); b && b.click() })()`); await sleep(400)
await evaluate(`(() => { const e = document.querySelector('[contenteditable=true]'); e && e.focus(); return !!e })()`)
await send('Input.insertText', { text: prompt }); await sleep(600)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
// Poll for changed mtimes rather than existence (files already exist).
const before = Object.fromEntries(ids.map((id) => [id, existsSync(join(root, `${id}.scene.json`)) ? statSync(join(root, `${id}.scene.json`)).mtimeMs : 0]))
for (let i = 0; i < 300; i += 1) {
  await sleep(1000)
  const changed = ids.filter((id) => existsSync(join(root, `${id}.scene.json`)) && statSync(join(root, `${id}.scene.json`)).mtimeMs > before[id])
  if (i % 20 === 0) console.log('wait', i, changed.length, '/', ids.length)
  if (changed.length === ids.length) break
}
for (const id of ids) if (existsSync(join(root, `${id}.scene.json`))) { copyFileSync(join(root, `${id}.scene.json`), join(root, `${id}.scene.repaired.json`)); copyFileSync(join(root, `${id}.scene.json`), join(outRoot, `${id}.scene.json`)) }
console.log(JSON.stringify({ errors, body: String(await evaluate('document.body.innerText')).slice(-1200) }, null, 2))
ws.close(); chrome.kill('SIGTERM')

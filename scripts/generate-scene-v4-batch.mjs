/** Generate a v4 batch and preserve raw artifacts before any repair. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readFileSync, rmSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { v4BatchPrompt } from '../research/dynamic-lesson-engine/v4/batch-prompt.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]); return all }, []))
const token = args.token; const ids = args.ids.split(','); const folder = args.folder ?? 'sealed'
const cases = JSON.parse(readFileSync('research/dynamic-lesson-engine/v4/sealed-cases.json', 'utf8')).filter((entry) => ids.includes(entry.id))
if (cases.length !== ids.length) throw new Error('unknown case id')
const outRoot = join(process.cwd(), 'research/dynamic-lesson-engine/v4/generated', folder)
const rawRoot = join(process.cwd(), 'research/dynamic-lesson-engine/v4/raw', folder)
mkdirSync(outRoot, { recursive: true }); mkdirSync(rawRoot, { recursive: true })
const rawDir = `/tmp/udt-scene-v4/${folder}`; mkdirSync(rawDir, { recursive: true })
for (const id of ids) for (const suffix of ['decision', 'plan', 'scene']) { const file = join(rawDir, `${id}.${suffix}.json`); if (existsSync(file)) rmSync(file) }
const prompt = v4BatchPrompt(cases, folder)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9601', '--user-data-dir=/tmp/udt-v10-gen-browser', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)); let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9601/json/list')).json(); target = list.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let nextId = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:8515/?${token}` }); await sleep(2500)
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(500)
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('New Session'));b&&b.click()})()`); await sleep(1800)
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(400)
await evaluate(`(()=>{const e=document.querySelector('[contenteditable=true]');e&&e.focus();return !!e})()`)
await send('Input.insertText', { text: prompt }); await sleep(600)
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
for (let i = 0; i < 600; i += 1) {
  await sleep(1000)
  const done = ids.every((id) => existsSync(join(rawDir, `${id}.decision.json`)) || (existsSync(join(rawDir, `${id}.plan.json`)) && existsSync(join(rawDir, `${id}.scene.json`))))
  if (i % 30 === 0) console.log('wait', i, ids.filter((id) => existsSync(join(rawDir, `${id}.decision.json`)) || existsSync(join(rawDir, `${id}.scene.json`))).length, '/', ids.length)
  if (done) break
}
for (const id of ids) for (const suffix of ['decision', 'plan', 'scene']) { const source = join(rawDir, `${id}.${suffix}.json`); if (existsSync(source)) { copyFileSync(source, join(outRoot, `${id}.${suffix}.json`)); copyFileSync(source, join(rawRoot, `${id}.${suffix}.json`)) } }
writeFileSync(join(rawRoot, 'generation-errors.json'), JSON.stringify({ errors, body: String(await evaluate('document.body.innerText')).slice(-2000) }, null, 2))
console.log(JSON.stringify({ folder, ids, copied: readdirSync(outRoot).filter((name) => ids.some((id) => name.startsWith(id + '.'))), errors }, null, 2))
ws.close(); chrome.kill('SIGTERM')

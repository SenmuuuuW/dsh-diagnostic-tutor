/** Strategy C: three-stage generation with deterministic assembly. */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeScene } from '../research/dynamic-lesson-engine/v4/pipeline.mjs'
import { stage1Prompt, stage2Prompt, stage3Prompt, stageRepairPrompt } from '../research/dynamic-lesson-engine/v11/stage-prompt.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]); return all }, []))
const token = args.token; const ids = args.ids.split(','); const folder = args.folder ?? 'staged'
const cases = JSON.parse(readFileSync('research/dynamic-lesson-engine/v4/sealed-cases.json', 'utf8')).filter((entry) => ids.includes(entry.id))
const out = join(process.cwd(), 'research/dynamic-lesson-engine/v11/generated', folder); mkdirSync(out, { recursive: true })
const raw = `/tmp/udt-scene-v11/${folder}`; mkdirSync(raw, { recursive: true })
for (const id of ids) for (const f of [`${id}.stage1.json`, `${id}.stage2.json`, `${id}.stage3.json`, `${id}.decision.json`]) rmSync(join(raw, f), { force: true })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9607', `--user-data-dir=/tmp/udt-v11-browser`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
let target
for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9607/json/list')).json(); target = list.find((e) => e.type === 'page' && e.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
let seq = 0; const pending = new Map(); const exceptions = []
ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } })
const send = (method, params = {}) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: `http://127.0.0.1:8517/?token=${token}` }); await sleep(2500)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(500)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('New Session'));b&&b.click()})()`); await sleep(1800)
await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(400)
await ev(`(()=>{const e=document.querySelector('[contenteditable=true]');e&&e.focus();return !!e})()`)
async function message(text) { await send('Input.insertText', { text }); await sleep(500); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }) }
async function waitFor(check, label, seconds = 600) { for (let i = 0; i < seconds; i += 1) { await sleep(1000); if (check()) return true; if (i % 30 === 0) console.log('wait', label, i) } throw new Error(`timeout ${label}`) }
const hasStage1 = (id) => existsSync(join(raw, `${id}.stage1.json`)) || existsSync(join(raw, `${id}.decision.json`))
await message(stage1Prompt(cases, folder)); await waitFor(() => ids.every(hasStage1), 'stage1')
const sceneIds = ids.filter((id) => existsSync(join(raw, `${id}.stage1.json`)))
if (sceneIds.length) { await message(stage2Prompt(sceneIds, folder)); await waitFor(() => sceneIds.every((id) => existsSync(join(raw, `${id}.stage2.json`))), 'stage2'); await message(stage3Prompt(sceneIds, folder)); await waitFor(() => sceneIds.every((id) => existsSync(join(raw, `${id}.stage3.json`))), 'stage3') }
function assemble(id) {
  if (!hasStage1(id)) return null
  if (existsSync(join(raw, `${id}.decision.json`))) return { decision: JSON.parse(readFileSync(join(raw, `${id}.decision.json`), 'utf8')) }
  const s1 = JSON.parse(readFileSync(join(raw, `${id}.stage1.json`), 'utf8'))
  const s2 = JSON.parse(readFileSync(join(raw, `${id}.stage2.json`), 'utf8'))
  const s3 = JSON.parse(readFileSync(join(raw, `${id}.stage3.json`), 'utf8'))
  return { spec: { version: '0.1', viewport: s1.viewport, metadata: s1.metadata, properties: s1.properties, primitives: s2.primitives, timeline: s3.timeline, controls: s3.controls ?? [], checkpoints: s3.checkpoints ?? [], narration: s3.narration ?? [], fallback: s1.fallback, accessibility: s1.accessibility } }
}
const rows = []
for (const id of ids) {
  const assembled = assemble(id); const caseEntry = cases.find((entry) => entry.id === id)
  if (!assembled) { rows.push({ id, error: 'missing artifacts' }); continue }
  if (assembled.decision) { rows.push({ id, decision: assembled.decision }); continue }
  const analysis = analyzeScene(assembled.spec, { reference: caseEntry.semantic })
  writeFileSync(join(out, `${id}.scene.json`), JSON.stringify(assembled.spec, null, 2) + '\n')
  rows.push({ id, strict: analysis.strict.ok, normalized: analysis.normalized.ok, visual: analysis.visual?.ok ?? false, semantic: analysis.semantic?.status ?? 'not-applicable', errors: analysis.errors.filter((e) => e.severity === 'error'), status: analysis.status })
}
writeFileSync(join(out, 'staged-results.json'), JSON.stringify({ ids, rows, exceptions }, null, 2) + '\n')
console.log(JSON.stringify({ ids, sceneIds, rows: rows.map((row) => ({ id: row.id, strict: row.strict, visual: row.visual, semantic: row.semantic, errors: row.errors?.length, decision: row.decision?.needsScene })), exceptions }, null, 2))
ws.close(); chrome.kill('SIGTERM')

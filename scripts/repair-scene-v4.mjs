/** Analyse v4 artifacts, apply safe deterministic fixes, then up to 2 model repairs. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeScene, attemptRecord, deterministicRepair, hashFileText, repairContractDrift, stableStringify } from '../research/dynamic-lesson-engine/v4/pipeline.mjs'
import { v4RepairPrompt } from '../research/dynamic-lesson-engine/v4/batch-prompt.mjs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => { if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]]); return all }, []))
const token = args.token; const folder = args.folder ?? 'sealed'; const maxRounds = Number(args.rounds ?? 2)
const cases = JSON.parse(readFileSync('research/dynamic-lesson-engine/v4/sealed-cases.json', 'utf8'))
const generated = join(process.cwd(), 'research/dynamic-lesson-engine/v4/generated', folder)
const repairedRoot = join(process.cwd(), 'research/dynamic-lesson-engine/v4/repaired', folder)
const statePath = join(process.cwd(), 'research/dynamic-lesson-engine/v4/attempts', `${folder}.json`)
mkdirSync(repairedRoot, { recursive: true }); mkdirSync(join(repairedRoot, 'rounds'), { recursive: true }); mkdirSync(join(process.cwd(), 'research/dynamic-lesson-engine/v4/attempts'), { recursive: true })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const only = args.ids ? new Set(args.ids.split(',')) : null
const sceneFiles = readdirSync(generated).filter((name) => name.endsWith('.scene.json') && (!only || only.has(name.replace('.scene.json', ''))))
const records = []
function read(file) { return JSON.parse(readFileSync(file, 'utf8')) }
function write(file, value) { writeFileSync(file, stableStringify(value) + '\n') }
function analyzeFile(file, caseEntry) { const text = readFileSync(file, 'utf8'); const raw = JSON.parse(text); return { raw, text, analysis: analyzeScene(raw, { reference: caseEntry.semantic }) } }
function saveRound(id, round, text) { const file = join(repairedRoot, 'rounds', `${id}.round${round}.json`); writeFileSync(file, text); return file }
// ---- minimal DSH browser driver shared by repair prompts ----
let ws; let nextId = 0; const pending = new Map(); const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9602', '--user-data-dir=/tmp/udt-v10-repair-browser', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
async function connect() { let target; for (let i = 0; i < 120; i += 1) { try { const list = await (await fetch('http://127.0.0.1:9602/json/list')).json(); target = list.find((e) => e.type === 'page' && e.webSocketDebuggerUrl); if (target) break } catch {} await sleep(100) } ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) }); ws.addEventListener('message', ({ data }) => { const m = JSON.parse(data); const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m.result) } }); await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); await send('Page.navigate', { url: `http://127.0.0.1:8515/?${token}` }); await sleep(2500); await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(500); await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('New Session'));b&&b.click()})()`); await sleep(1800); await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`); await sleep(400); await ev(`(()=>{const e=document.querySelector('[contenteditable=true]');e&&e.focus();return !!e})()`) }
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })) }); const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value
async function sendMessage(text) { await send('Input.insertText', { text }); await sleep(400); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }) }
async function waitForWrite(id, folderName, beforeMtime) { const file = join('/tmp/udt-scene-v4', folderName, `${id}.scene.json`); for (let i = 0; i < 240; i += 1) { await sleep(1000); try { if (statSync(file).mtimeMs > beforeMtime) return } catch {} } throw new Error(`repair did not write ${id}`) }
if (maxRounds > 0) await connect()

const initial = new Map()
for (const name of sceneFiles) {
  const id = name.replace('.scene.json', ''); const caseEntry = cases.find((item) => item.id === id)
  const file = join(generated, name); const result = analyzeFile(file, caseEntry); initial.set(id, result)
  const beforeHash = hashFileText(result.text)
  let finalRaw = result.raw; let finalAnalysis = result.analysis; const repairHistory = []
  // Safe deterministic fixes only, explicitly recorded.
  const drift = repairContractDrift(result.raw)
  if (drift.changes.length > 0) {
    const text = JSON.stringify(drift.spec, null, 2) + '\n'
    saveRound(id, 0, text); finalRaw = drift.spec; finalAnalysis = analyzeScene(finalRaw, { reference: caseEntry.semantic })
    repairHistory.push({ round: 0, kind: 'contract-drift', changes: drift.changes, beforeHash, afterHash: hashFileText(text), status: finalAnalysis.status, errors: finalAnalysis.errors })
  }
  if (finalAnalysis.visual?.ok === false) {
    const deterministic = deterministicRepair(result.analysis.normalized.spec)
    if (deterministic.changes.length > 0) {
      const text = JSON.stringify(deterministic.spec, null, 2) + '\n'
      saveRound(id, 0, text); finalRaw = deterministic.spec; finalAnalysis = analyzeScene(finalRaw, { reference: caseEntry.semantic })
      repairHistory.push({ round: 0, kind: 'deterministic', changes: deterministic.changes, beforeHash, afterHash: hashFileText(text), status: finalAnalysis.status, errors: finalAnalysis.errors })
    }
  }
  // Model repairs, only if something remains broken for strict schema, visual, or semantics.
  for (let round = 1; round <= maxRounds; round += 1) {
    const blocking = finalAnalysis.errors.filter((entry) => entry.category !== 'strict-schema' ? entry.severity === 'error' : true)
    const needs = !finalAnalysis.strict.ok || finalAnalysis.visual?.ok === false || finalAnalysis.semantic?.status === 'fail'
    if (!needs) break
    const beforeHash = hashFileText(JSON.stringify(finalRaw))
    const errorList = blocking.length > 0 ? blocking : finalAnalysis.errors
    const prompt = v4RepairPrompt(id, errorList, folder)
    const beforeMtime = statSync(join('/tmp/udt-scene-v4', folder, `${id}.scene.json`)).mtimeMs
    await sendMessage(prompt); await waitForWrite(id, folder, beforeMtime)
    const rawPath = join('/tmp/udt-scene-v4', folder, `${id}.scene.json`)
    const text = readFileSync(rawPath, 'utf8'); const raw = JSON.parse(text); finalRaw = raw; finalAnalysis = analyzeScene(raw, { reference: caseEntry.semantic })
    const afterHash = hashFileText(text); saveRound(id, round, text)
    repairHistory.push({ round, kind: 'model', promptErrors: errorList, promptHash: hashFileText(prompt), beforeHash, afterHash, status: finalAnalysis.status, errors: finalAnalysis.errors, newErrors: finalAnalysis.errors.filter((entry) => !errorList.some((old) => old.code === entry.code && old.path === entry.path)) })
    if (afterHash === beforeHash) break
  }
  writeFileSync(join(repairedRoot, `${id}.scene.json`), JSON.stringify(finalRaw, null, 2) + '\n')
  const record = attemptRecord({ caseId: id, candidateId: `${folder}:${id}`, inputHash: hashFileText(result.text), outputHash: hashFileText(JSON.stringify(finalRaw)), analysis: finalAnalysis, repairHistory, finalStatus: finalAnalysis.status })
  record.initial = { strictValid: result.analysis.strict.ok, normalizedValid: result.analysis.normalized.ok, visualOk: result.analysis.visual?.ok ?? false, semanticStatus: result.analysis.semantic?.status ?? 'not-applicable', errors: result.analysis.errors }
  records.push(record)
}
write(statePath, records)
console.log(JSON.stringify({ folder, scenes: records.length, strictValid: records.filter((r) => r.initial.strictValid).length, normalizedValid: records.filter((r) => r.initial.normalizedValid).length, initialVisual: records.filter((r) => r.initial.visualOk).length, finalValid: records.filter((r) => r.finalStatus !== 'invalid').length, modelRepairs: records.reduce((n, r) => n + r.repairHistory.filter((h) => h.kind === 'model').length, 0), deterministicRepairs: records.reduce((n, r) => n + r.repairHistory.filter((h) => h.kind === 'deterministic').length, 0) }, null, 2))


chrome.kill('SIGTERM')

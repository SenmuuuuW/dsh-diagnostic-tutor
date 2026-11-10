import { validateSceneSpec, formatValidationErrors } from '/src/scene/spec.js'
import { visualLintScene } from '/src/scene/visual-lint.js'

const $ = (id) => document.getElementById(id)
let candidates = []
function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
}
async function digest(spec, fallback) {
  const bytes = new TextEncoder().encode(stable({ fallback, spec }))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function extract(raw) {
  if (raw?.type === 'scene') return { content: raw.content, label: raw.id ?? 'scene block' }
  if (raw?.spec !== undefined && raw?.fallback !== undefined) return { content: raw, label: raw.id ?? raw.title ?? 'candidate' }
  if (raw?.version !== undefined && raw?.primitives !== undefined) return { spec: raw, fallback: raw.fallback?.text ?? '', label: raw.metadata?.title ?? 'raw SceneSpec' }
  return null
}
async function select(index) {
  candidates.forEach((item, i) => item.button.classList.toggle('active', i === index))
  const active = candidates[index]
  const raw = active.raw
  const content = raw?.type === 'scene' ? raw.content : raw?.spec !== undefined ? raw : { spec: raw, fallback: raw?.fallback?.text ?? '' }
  const spec = content.spec
  const fallback = content.fallback ?? ''
  const validation = validateSceneSpec(spec)
  const visual = validation.ok ? visualLintScene(spec) : { ok: false, diagnostics: [], stats: {} }
  $('detail-panel').hidden = false
  $('detail-title').textContent = active.label
  $('detail-digest').textContent = validation.ok ? `SHA-256 ${await digest(validation.spec, fallback)}` : 'no digest (schema invalid)'
  $('validation').className = `result ${validation.ok ? 'ok' : 'bad'}`
  $('validation').innerHTML = validation.ok ? 'Schema valid.' : `<strong>Schema invalid</strong><pre>${escapeHtml(formatValidationErrors(validation.errors))}</pre>`
  $('visual').className = `result ${visual.ok ? (visual.stats.warnings > 0 ? 'warning' : 'ok') : 'bad'}`
  $('visual').innerHTML = visual.ok && visual.diagnostics.length === 0 ? 'No visual diagnostics.' : visual.diagnostics.map((entry) => `<div class="diag"><code class="${entry.severity}">${escapeHtml(entry.code)}</code> <span class="${entry.severity}">[${entry.severity}]</span><p>${escapeHtml(entry.message)}</p>${entry.suggestedFix ? `<p>Fix: ${escapeHtml(entry.suggestedFix)}</p>` : ''}</div>`).join('') || 'No visual diagnostics.'
  $('fallback').textContent = fallback || '— missing fallback —'
  $('spec').textContent = JSON.stringify(spec, null, 2)
  $('command').textContent = `node scripts/scene-review.mjs lint ${JSON.stringify(active.name)}\nnode scripts/scene-review.mjs approve ${JSON.stringify(active.name)} --reviewer "your name" --note "what you checked"${visual.stats.warnings > 0 ? ' --ack-warnings' : ''}\n# approval prompts for a human TTY confirmation; there is no approve button or HTTP route`
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) }
$('files').addEventListener('change', async (event) => {
  candidates = []
  for (const file of event.target.files) {
    try {
      const raw = JSON.parse(await file.text())
      const extracted = extract(raw)
      if (!extracted) continue
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${extracted.label} · ${file.name}`
      button.addEventListener('click', () => void select(candidates.findIndex((item) => item.button === button)))
      candidates.push({ raw, name: file.name, label: extracted.label, button })
    } catch (error) { console.warn(String(error)) }
  }
  $('candidates').replaceChildren(...candidates.map((item) => { const li = document.createElement('li'); li.appendChild(item.button); return li }))
  if (candidates.length > 0) await select(0)
})

import { SceneRenderer, formatValidationErrors, validateSceneSpec } from '../../research/dynamic-lesson-engine/renderer.mjs'

const $ = (id) => document.getElementById(id)
let renderer = null
let spec = null
let dragging = false

function status(text) { $('status').textContent = text }
function showValidation(errors) {
  const box = $('validation')
  if (errors.length === 0) { box.className = 'validation'; box.textContent = 'Valid SceneSpec.'; return true }
  box.className = 'validation bad'
  box.textContent = formatValidationErrors(errors)
  return false
}
function showFallback(text) { $('fallback').hidden = false; $('fallback').textContent = text }
function hideFallback() { $('fallback').hidden = true; $('fallback').textContent = '' }

async function loadExample(name) {
  status('loading ' + name)
  const response = await fetch(`/research/dynamic-lesson-engine/examples/${name}.json`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`could not load ${name}.json`)
  spec = await response.json()
  $('spec-input').value = JSON.stringify(spec, null, 2)
  $('example-select').value = name
  render()
}
function parseSpec() {
  try { return JSON.parse($('spec-input').value) } catch (error) { showValidation([{ path: '$', code: 'json', message: error.message }]); return null }
}
function destroy() { if (renderer) { renderer.destroy(); renderer = null } }
function render() {
  destroy(); hideFallback()
  const parsed = parseSpec()
  if (parsed === null) return
  const checked = validateSceneSpec(parsed)
  if (!checked.ok) { showValidation(checked.errors); status('invalid'); return }
  showValidation([])
  spec = parsed
  $('scene-title').textContent = parsed.metadata?.title ?? 'Scene'
  $('scene-meta').textContent = [parsed.metadata?.subject, parsed.metadata?.learner].filter(Boolean).join(' · ')
  $('timeline').max = String(parsed.timeline.duration)
  $('timeline').step = String(Math.max(0.01, parsed.timeline.duration / 200))
  $('checkpoints').replaceChildren()
  for (const checkpoint of parsed.checkpoints ?? []) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    button.textContent = `${checkpoint.at.toFixed(2)}s · ${checkpoint.title}`
    button.addEventListener('click', () => { renderer?.seek(checkpoint.at) })
    item.appendChild(button); $('checkpoints').appendChild(item)
  }
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  const forceStatic = reduced && parsed.accessibility.reducedMotion === 'static'
  renderer = new SceneRenderer($('stage'), parsed, {
    onFrame(frame) {
      if (!dragging) $('timeline').value = String(frame.time)
      $('time-label').textContent = `${frame.time.toFixed(2)}s`
      $('metrics').textContent = `time ${frame.time.toFixed(2)} / ${frame.duration.toFixed(2)}s · nodes ${frame.nodes} · render ${frame.renderMs.toFixed(2)}ms · ${frame.playing ? 'playing' : 'paused'}`
    },
    onNarration(text) { $('narration').textContent = text ?? '—' },
    onCheckpoint(checkpoint) { status(`checkpoint: ${checkpoint.title}`); $('narration').textContent = checkpoint.body },
    onError(error) { showFallback(`Renderer fallback: ${error}`); status('renderer error') },
    onEnd() { status('ended'); updatePlayButton(false) },
  })
  if (!renderer.ok) { showValidation(renderer.errors); showFallback(parsed.fallback.text); status('invalid'); return }
  renderControls(parsed)
  updatePlayButton(false)
  if (forceStatic) {
    showFallback(parsed.fallback.text)
    $('play').disabled = true
    status('reduced motion: static fallback (no autoplay)')
  } else {
    $('play').disabled = false
    status('rendered')
  }
}
function renderControls(parsed) {
  const box = $('controls'); box.replaceChildren()
  for (const control of parsed.controls ?? []) {
    const property = parsed.properties.find((entry) => entry.id === control.propertyId)
    if (!property) continue
    const label = document.createElement('label')
    label.className = 'control'
    const caption = document.createElement('span'); caption.textContent = control.label ?? property.label
    const input = document.createElement('input')
    input.type = 'range'; input.min = String(property.min); input.max = String(property.max); input.step = String(property.step); input.value = String(property.default)
    const output = document.createElement('output'); output.textContent = `${property.default}${property.unit ?? ''}`
    input.addEventListener('input', () => { output.textContent = `${Number(input.value).toFixed(2)}${property.unit ?? ''}`; renderer?.setProperty(property.id, Number(input.value)) })
    label.append(caption, input, output); box.appendChild(label)
  }
}
function updatePlayButton(playing) { $('play').textContent = playing ? 'Pause' : 'Play'; $('play').setAttribute('aria-pressed', String(playing)) }
function togglePlay() {
  if (!renderer) return
  if (renderer.playing) { renderer.pause(); updatePlayButton(false) } else { renderer.play(); updatePlayButton(true) }
}
$('validate').addEventListener('click', () => {
  const parsed = parseSpec(); if (parsed === null) return
  showValidation(validateSceneSpec(parsed).errors); status('validated')
})
$('render').addEventListener('click', render)
$('reset').addEventListener('click', () => { void loadExample($('example-select').value) })
$('example-select').addEventListener('change', (event) => { void loadExample(event.target.value) })
$('play').addEventListener('click', togglePlay)
$('replay').addEventListener('click', () => { renderer?.replay(); updatePlayButton(false); status('replayed') })
$('back').addEventListener('click', () => renderer?.step(-0.5))
$('forward').addEventListener('click', () => renderer?.step(0.5))
$('timeline').addEventListener('input', () => { dragging = true; renderer?.seek(Number($('timeline').value)); dragging = false })
document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.code === 'Space') { event.preventDefault(); togglePlay() }
  else if (event.code === 'ArrowLeft') { event.preventDefault(); renderer?.step(-0.5) }
  else if (event.code === 'ArrowRight') { event.preventDefault(); renderer?.step(0.5) }
  else if (event.code === 'Home') { event.preventDefault(); renderer?.replay(); updatePlayButton(false) }
})
const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
$('status').textContent = reduced ? 'reduced motion detected: autoplay stays under learner control' : 'ready'
void loadExample('gradient-descent').catch((error) => { showFallback(String(error)); status('load failed') })

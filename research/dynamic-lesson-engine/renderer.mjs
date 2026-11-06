/**
 * SceneSpec v0 SVG renderer — research prototype only.
 *
 * The renderer never evaluates JavaScript supplied by the model. It interprets
 * validated numeric/expression fields with the bounded evaluator in
 * scene-spec.mjs, and constructs SVG through DOM APIs plus textContent.
 * Time is explicit and deterministic; there is no unbounded animation loop.
 */

import {
  evaluateNumeric, formatValidationErrors, NUMERIC_PROPS, validateSceneSpec,
} from './scene-spec.mjs'

const NS = 'http://www.w3.org/2000/svg'

function ease(name, x) {
  switch (name) {
    case 'ease-in': return x * x
    case 'ease-out': return 1 - (1 - x) * (1 - x)
    case 'ease-in-out': return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2
    case 'step': return 0
    default: return x
  }
}

function interpolateKeyframes(keyframes, time, vars) {
  if (keyframes.length === 0) return undefined
  if (time <= keyframes[0].at) return evaluateNumeric(keyframes[0].value, vars)
  const last = keyframes[keyframes.length - 1]
  if (time >= last.at) return evaluateNumeric(last.value, vars)
  let left = keyframes[0]
  let right = last
  for (let index = 1; index < keyframes.length; index += 1) {
    if (keyframes[index].at >= time) { left = keyframes[index - 1]; right = keyframes[index]; break }
  }
  const span = right.at - left.at
  const progress = span <= 0 ? 1 : (time - left.at) / span
  const eased = ease(right.easing ?? left.easing ?? 'linear', progress)
  const from = evaluateNumeric(left.value, vars)
  const to = evaluateNumeric(right.value, vars)
  return from + (to - from) * eased
}

function create(tag) { return document.createElementNS(NS, tag) }
function setText(element, text) { element.textContent = String(text) }
function addAttrs(element, attrs) {
  for (const [key, value] of Object.entries(attrs)) if (value !== undefined) element.setAttribute(key, String(value))
}

function arrowHead(x1, y1, x2, y2, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(5, Math.min(18, width * 4))
  const left = angle + Math.PI * 0.85
  const right = angle - Math.PI * 0.85
  return `${x2},${y2} ${x2 + Math.cos(left) * size},${y2 + Math.sin(left) * size} ${x2 + Math.cos(right) * size},${y2 + Math.sin(right) * size}`
}

export class SceneRenderer {
  constructor(container, rawSpec, options = {}) {
    this.container = container
    this.options = options
    this.validated = validateSceneSpec(rawSpec)
    this.spec = rawSpec
    this.values = {}
    this.playing = false
    this.time = 0
    this.startedAt = 0
    this.raf = 0
    this.triggered = new Set()
    this.currentNarration = null
    this.nodes = 0
    this.lastFrameMs = 0
    this.destroyed = false
    if (!this.validated.ok) return
    for (const property of this.spec.properties) this.values[property.id] = property.default
    try {
      this.mount()
      this.renderAt(0)
    } catch (error) {
      this.fail(error)
    }
  }

  get ok() { return this.validated.ok && this.svg !== undefined }
  get errors() { return this.validated.errors }

  mount() {
    this.container.replaceChildren()
    const svg = document.createElementNS(NS, 'svg')
    this.svg = svg
    const viewport = this.spec.viewport
    addAttrs(svg, {
      viewBox: `0 0 ${viewport.width} ${viewport.height}`,
      role: 'img',
      'aria-label': this.spec.accessibility.alt,
      'data-scene-version': this.spec.version,
    })
    svg.style.width = '100%'
    svg.style.height = 'auto'
    svg.style.background = viewport.background ?? '#ffffff'
    const background = document.createElementNS(NS, 'rect')
    addAttrs(background, { x: 0, y: 0, width: viewport.width, height: viewport.height, fill: viewport.background ?? '#ffffff' })
    svg.appendChild(background)
    this.background = background
    this.elements = new Map()
    for (const primitive of this.spec.primitives) this.mountPrimitive(primitive)
    this.container.appendChild(svg)
    this.nodes = svg.querySelectorAll('*').length
  }

  mountPrimitive(primitive) {
    let element
    if (primitive.type === 'rect') element = create('rect')
    else if (primitive.type === 'circle') element = create('circle')
    else if (primitive.type === 'line') element = create('line')
    else if (primitive.type === 'path') element = create('path')
    else if (primitive.type === 'text') element = create('text')
    else if (primitive.type === 'arrow') {
      element = create('g')
      const line = create('line')
      const head = create('polygon')
      line.setAttribute('fill', 'none')
      head.setAttribute('data-arrow-head', 'true')
      element.appendChild(line)
      element.appendChild(head)
      this.svg.appendChild(element)
      this.elements.set(primitive.id, { element, line, head })
      return
    }
    addAttrs(element, { 'data-primitive': primitive.id, 'data-type': primitive.type })
    if (primitive.fill !== undefined) element.setAttribute('fill', primitive.fill)
    if (primitive.stroke !== undefined) element.setAttribute('stroke', primitive.stroke)
    if (primitive.strokeWidth !== undefined) element.setAttribute('stroke-width', String(primitive.strokeWidth))
    if (primitive.opacity !== undefined) element.setAttribute('opacity', String(primitive.opacity))
    if (primitive.dash !== undefined) element.setAttribute('stroke-dasharray', primitive.dash)
    this.svg.appendChild(element)
    this.elements.set(primitive.id, element)
  }

  vars(time) {
    const base = { ...this.values, t: time, duration: this.spec.timeline.duration }
    // Expression identifiers are case-insensitive; property ids remain stable in metadata.
    for (const [key, value] of Object.entries(base)) {
      const lower = key.toLowerCase()
      if (!(lower in base)) base[lower] = value
    }
    return base
  }

  valueFor(primitive, key, time) {
    const track = this.spec.timeline.tracks.find((entry) => entry.target.primitive === primitive.id && entry.target.property === key)
    if (track !== undefined) return interpolateKeyframes(track.keyframes, time, this.vars(time))
    return evaluateNumeric(primitive[key], this.vars(time))
  }

  renderAt(rawTime) {
    if (this.destroyed || !this.ok) return
    const t0 = performance.now()
    const time = Math.max(0, Math.min(this.spec.timeline.duration, rawTime))
    this.time = time
    const previous = this.lastRenderedTime ?? -1
    for (const primitive of this.spec.primitives) {
      try { this.updatePrimitive(primitive, time) } catch (error) { this.fail(error); return }
    }
    this.updateNarration(time)
    this.updateCheckpoints(previous, time)
    this.lastRenderedTime = time
    this.lastFrameMs = performance.now() - t0
    this.options.onFrame?.({ time, duration: this.spec.timeline.duration, playing: this.playing, nodes: this.nodes, renderMs: this.lastFrameMs })
  }

  updatePrimitive(primitive, time) {
    const entry = this.elements.get(primitive.id)
    if (!entry) return
    if (primitive.type === 'arrow') {
      const x1 = this.valueFor(primitive, 'x1', time)
      const y1 = this.valueFor(primitive, 'y1', time)
      const x2 = this.valueFor(primitive, 'x2', time)
      const y2 = this.valueFor(primitive, 'y2', time)
      const width = this.valueFor(primitive, 'strokeWidth', time)
      addAttrs(entry.line, { x1, y1, x2, y2, stroke: primitive.stroke ?? '#2563eb', 'stroke-width': width, opacity: this.valueFor(primitive, 'opacity', time) })
      addAttrs(entry.head, { points: arrowHead(x1, y1, x2, y2, width), fill: primitive.stroke ?? '#2563eb', opacity: this.valueFor(primitive, 'opacity', time) })
      return
    }
    if (primitive.type === 'text') {
      addAttrs(entry, {
        x: this.valueFor(primitive, 'x', time), y: this.valueFor(primitive, 'y', time),
        'font-size': this.valueFor(primitive, 'fontSize', time), fill: primitive.fill ?? '#111827',
        'text-anchor': primitive.anchor ?? 'start', opacity: this.valueFor(primitive, 'opacity', time),
        'font-weight': primitive.fontWeight ?? 400,
      })
      setText(entry, primitive.text)
      return
    }
    const attrs = {}
    for (const key of NUMERIC_PROPS[primitive.type]) attrs[key === 'strokeWidth' ? 'stroke-width' : key] = this.valueFor(primitive, key, time)
    addAttrs(entry, attrs)
    if (primitive.type === 'path') entry.setAttribute('d', primitive.d)
  }

  updateNarration(time) {
    const cues = this.spec.narration ?? []
    let active = null
    for (const cue of cues) if (cue.at <= time + 1e-6) active = cue
    if (active?.text !== this.currentNarration) {
      this.currentNarration = active?.text ?? null
      this.options.onNarration?.(this.currentNarration)
    }
  }

  updateCheckpoints(previous, time) {
    for (const checkpoint of this.spec.checkpoints ?? []) {
      if (this.triggered.has(checkpoint.id)) continue
      if (previous < checkpoint.at && time >= checkpoint.at) {
        this.triggered.add(checkpoint.id)
        if (checkpoint.pause) this.pause()
        this.options.onCheckpoint?.(checkpoint)
      }
    }
  }

  setProperty(id, value) {
    const property = this.spec.properties.find((entry) => entry.id === id)
    if (!property || !Number.isFinite(value)) return
    this.values[id] = Math.max(property.min, Math.min(property.max, value))
    this.renderAt(this.time)
  }

  play() {
    if (this.destroyed || !this.ok || this.playing) return
    if (this.time >= this.spec.timeline.duration) this.time = 0
    this.playing = true
    this.startedAt = performance.now() - this.time * 1000
    const tick = () => {
      if (!this.playing || this.destroyed) return
      const next = (performance.now() - this.startedAt) / 1000
      this.renderAt(next)
      if (next >= this.spec.timeline.duration) { this.playing = false; this.options.onEnd?.(); this.emitFrame(); return }
      this.raf = requestAnimationFrame(tick)
    }
    this.emitFrame()
    this.raf = requestAnimationFrame(tick)
  }

  pause() {
    this.playing = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.emitFrame()
  }

  replay() {
    this.pause()
    this.time = 0
    this.triggered.clear()
    this.lastRenderedTime = -1
    this.renderAt(0)
  }

  seek(time) {
    this.pause()
    this.renderAt(time)
  }

  step(delta) {
    this.seek(Math.max(0, Math.min(this.spec.timeline.duration, this.time + delta)))
  }

  emitFrame() {
    this.options.onFrame?.({ time: this.time, duration: this.spec.timeline.duration, playing: this.playing, nodes: this.nodes, renderMs: this.lastFrameMs })
  }

  fail(error) {
    this.failure = error instanceof Error ? error.message : String(error)
    this.container.replaceChildren()
    const fallback = document.createElement('div')
    fallback.className = 'scene-fallback'
    fallback.setAttribute('role', 'alert')
    fallback.textContent = this.spec?.fallback?.text ?? 'This scene could not be rendered safely.'
    this.container.appendChild(fallback)
    this.options.onError?.(this.failure)
  }

  destroy() {
    this.pause()
    this.destroyed = true
    this.container.replaceChildren()
  }
}

export { formatValidationErrors, validateSceneSpec }

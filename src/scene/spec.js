/**
 * SceneSpec v0 — a bounded, declarative teaching-scene format for the v0.7
 * research spike. This file is deliberately plain ESM and dependency-free so
 * the same validator runs in Node tests and in the browser Scene Lab.
 *
 * It is NOT a production lesson block. Production still uses StoredBlock and
 * the existing Study renderer; nothing here is imported by the plugin bundle.
 */

export const SCENE_SPEC_VERSION = '0.1'

export const LIMITS = Object.freeze({
  primitives: 120,
  properties: 8,
  tracks: 80,
  keyframes: 800,
  checkpoints: 12,
  narration: 20,
  sourceRefs: 6,
  expressionChars: 240,
  pathChars: 4000,
  textChars: 200,
  metadataChars: 800,
  fallbackChars: 2000,
  altChars: 300,
  durationSeconds: 120,
  width: [240, 1600],
  height: [180, 1000],
})

const ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/
const EASINGS = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'step'])
const PRIMITIVE_TYPES = new Set(['rect', 'circle', 'line', 'path', 'text', 'arrow'])
const FILLS = new Set(['none', 'transparent', 'black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'yellow', 'purple', 'currentColor'])
const ANCHORS = new Set(['start', 'middle', 'end'])
const REDUCED_MOTION = new Set(['static', 'no-autoplay'])

const NUMERIC_PROPS = {
  rect: ['x', 'y', 'width', 'height', 'strokeWidth', 'opacity', 'rx'],
  circle: ['cx', 'cy', 'r', 'strokeWidth', 'opacity'],
  line: ['x1', 'y1', 'x2', 'y2', 'strokeWidth', 'opacity'],
  path: ['strokeWidth', 'opacity'],
  text: ['x', 'y', 'fontSize', 'opacity'],
  arrow: ['x1', 'y1', 'x2', 'y2', 'strokeWidth', 'opacity'],
}
const COLOR_PROPS = ['fill', 'stroke']

const FUNCTIONS = Object.freeze({
  sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan],
  sqrt: [1, Math.sqrt], abs: [1, Math.abs], exp: [1, Math.exp],
  log: [1, Math.log], ln: [1, Math.log], floor: [1, Math.floor],
  ceil: [1, Math.ceil], round: [1, Math.round],
  pow: [2, Math.pow], min: [2, Math.min], max: [2, Math.max],
})
const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E })

/** Return an Error with a stable path; validation catches it per field. */
function fail(path, code, message) {
  return { path, code, message }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function inRange(value, min, max) {
  return finite(value) && value >= min && value <= max
}

function stringField(value, max = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function color(value) {
  if (typeof value !== 'string' || value.length > 64) return false
  if (FILLS.has(value)) return true
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return true
  if (/^rgba?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(value)) return true
  if (/^hsla?\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/.test(value)) return true
  return false
}

function pathData(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= LIMITS.pathChars &&
    /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(value) && !/url\s*\(/i.test(value)
}

class ExpressionError extends Error {
  constructor(message, offset) { super(message); this.offset = offset }
}

function tokenize(source) {
  const tokens = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) { index += 1; continue }
    if (/[0-9.]/.test(char)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index))
      if (!match) throw new ExpressionError('bad number', index)
      tokens.push({ kind: 'number', value: Number(match[0]) })
      index += match[0].length
      continue
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))
      tokens.push({ kind: 'name', value: match[0].toLowerCase() })
      index += match[0].length
      continue
    }
    if ('+-*/^(),'.includes(char)) { tokens.push({ kind: 'op', value: char }); index += 1; continue }
    throw new ExpressionError(`unsupported character ${JSON.stringify(char)}`, index)
  }
  return tokens
}

class Parser {
  constructor(tokens) { this.tokens = tokens; this.index = 0; this.depth = 0 }
  peek() { return this.tokens[this.index] }
  takeOp(value) {
    const token = this.peek()
    if (token?.kind === 'op' && token.value === value) { this.index += 1; return true }
    return false
  }
  expectOp(value) {
    if (!this.takeOp(value)) throw new ExpressionError(`expected ${value}`, this.index)
  }
  enter() { this.depth += 1; if (this.depth > 64) throw new ExpressionError('expression too deep', this.index) }
  leave() { this.depth -= 1 }
  parse() {
    const node = this.additive()
    if (this.index !== this.tokens.length) throw new ExpressionError('unexpected token', this.index)
    return node
  }
  additive() {
    let left = this.multiplicative()
    for (;;) {
      if (this.takeOp('+')) left = { kind: 'binary', op: '+', left, right: this.multiplicative() }
      else if (this.takeOp('-')) left = { kind: 'binary', op: '-', left, right: this.multiplicative() }
      else return left
    }
  }
  multiplicative() {
    let left = this.unary()
    for (;;) {
      if (this.takeOp('*')) left = { kind: 'binary', op: '*', left, right: this.unary() }
      else if (this.takeOp('/')) left = { kind: 'binary', op: '/', left, right: this.unary() }
      else return left
    }
  }
  unary() {
    if (this.takeOp('+')) return { kind: 'unary', op: '+', value: this.unary() }
    if (this.takeOp('-')) return { kind: 'unary', op: '-', value: this.unary() }
    return this.power()
  }
  power() {
    const base = this.primary()
    if (!this.takeOp('^')) return base
    this.enter(); const exponent = this.unary(); this.leave()
    return { kind: 'binary', op: '^', left: base, right: exponent }
  }
  primary() {
    const token = this.peek()
    if (!token) throw new ExpressionError('expected value', this.index)
    if (token.kind === 'number') { this.index += 1; return { kind: 'number', value: token.value } }
    if (token.kind === 'name') {
      this.index += 1
      if (token.value === 't') return { kind: 'variable', name: 't' }
      if (token.value === 'duration') return { kind: 'variable', name: 'duration' }
      if (token.value in CONSTANTS) return { kind: 'number', value: CONSTANTS[token.value] }
      const fn = FUNCTIONS[token.value]
      if (fn) {
        this.expectOp('('); this.enter(); const args = []
        if (!this.takeOp(')')) {
          for (;;) { args.push(this.additive()); if (this.takeOp(',')) continue; this.expectOp(')'); break }
        }
        this.leave()
        if (args.length !== fn[0]) throw new ExpressionError('wrong function arity', this.index)
        return { kind: 'call', name: token.value, args }
      }
      return { kind: 'variable', name: token.value }
    }
    if (token.kind === 'op' && token.value === '(') {
      this.index += 1; this.enter(); const node = this.additive(); this.leave(); this.expectOp(')'); return node
    }
    throw new ExpressionError('expected value', this.index)
  }
}

function variableNames(node, names = new Set()) {
  if (!node || typeof node !== 'object') return names
  if (node.kind === 'variable') names.add(node.name)
  if (node.kind === 'unary') variableNames(node.value, names)
  if (node.kind === 'binary') { variableNames(node.left, names); variableNames(node.right, names) }
  if (node.kind === 'call') for (const arg of node.args) variableNames(arg, names)
  return names
}

function evaluate(node, vars) {
  switch (node.kind) {
    case 'number': return node.value
    case 'variable': {
      const value = vars[node.name]
      if (!finite(value)) throw new ExpressionError(`unknown or non-finite variable ${node.name}`)
      return value
    }
    case 'unary': return node.op === '-' ? -evaluate(node.value, vars) : evaluate(node.value, vars)
    case 'binary': {
      const left = evaluate(node.left, vars)
      const right = evaluate(node.right, vars)
      const value = node.op === '+' ? left + right : node.op === '-' ? left - right : node.op === '*' ? left * right : node.op === '/' ? left / right : left ** right
      if (!finite(value)) throw new ExpressionError('non-finite expression result')
      return value
    }
    case 'call': {
      const fn = FUNCTIONS[node.name]
      const value = fn[1](...node.args.map((arg) => evaluate(arg, vars)))
      if (!finite(value)) throw new ExpressionError('non-finite function result')
      return value
    }
  }
  throw new ExpressionError('unsupported expression')
}

/** Parse and evaluate a bounded arithmetic expression with named scalars. */
export function compileExpression(source, allowedVariables = []) {
  if (typeof source !== 'string' || source.length === 0 || source.length > LIMITS.expressionChars) {
    return { ok: false, error: `expression must be 1-${LIMITS.expressionChars} characters` }
  }
  try {
    const ast = new Parser(tokenize(source)).parse()
    const variables = [...variableNames(ast)]
    const allowed = new Set(allowedVariables.map((name) => name.toLowerCase()))
    const unknown = variables.find((name) => !allowed.has(name.toLowerCase()))
    if (unknown !== undefined) return { ok: false, error: `unknown variable ${unknown}` }
    return {
      ok: true,
      variables,
      evaluate(vars) {
        try { return evaluate(ast, vars) } catch (error) { throw error instanceof Error ? error : new Error(String(error)) }
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'invalid expression' }
  }
}

function numericSpec(value) {
  if (finite(value)) return { ok: true }
  if (isRecord(value) && Object.keys(value).length === 1 && typeof value.expr === 'string') return { ok: true, expr: value.expr }
  return { ok: false }
}

function validateNumeric(value, path, allowedVariables, errors) {
  const spec = numericSpec(value)
  if (!spec.ok) { errors.push(fail(path, 'number', 'must be a finite number or { expr: string }')); return }
  if (spec.expr !== undefined) {
    const compiled = compileExpression(spec.expr, allowedVariables)
    if (!compiled.ok) errors.push(fail(path, 'expression', compiled.error))
  }
}

function checkKeys(value, allowed, path, errors) {
  if (!isRecord(value)) { errors.push(fail(path, 'object', 'must be an object')); return }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(fail(`${path}.${key}`, 'unknown-key', 'unsupported field'))
}

function validatePrimitive(raw, index, propertyIds, errors) {
  const path = `primitives[${index}]`
  if (!isRecord(raw)) { errors.push(fail(path, 'object', 'must be an object')); return }
  if (!stringField(raw.id, 64) || !ID_RE.test(raw.id)) errors.push(fail(`${path}.id`, 'id', 'must match [A-Za-z][A-Za-z0-9_-]{0,63}'))
  if (!PRIMITIVE_TYPES.has(raw.type)) { errors.push(fail(`${path}.type`, 'type', 'rect|circle|line|path|text|arrow')); return }
  const allowedVars = [...propertyIds, 't', 'duration']
  const numeric = NUMERIC_PROPS[raw.type]
  const allowedKeys = ['id', 'type', ...numeric, ...COLOR_PROPS, 'd', 'dash', 'text', 'fontSize', 'anchor', 'fontWeight']
  checkKeys(raw, allowedKeys, path, errors)
  for (const key of numeric) {
    if (key === 'strokeWidth' || key === 'opacity') {
      if (raw[key] !== undefined) {
        if (typeof raw[key] === 'number') {
          if (!finite(raw[key])) errors.push(fail(`${path}.${key}`, 'number', 'must be finite'))
          else if (key === 'opacity' && !inRange(raw[key], 0, 1)) errors.push(fail(`${path}.${key}`, 'range', 'opacity must be 0..1'))
          else if (key === 'strokeWidth' && !inRange(raw[key], 0, 20)) errors.push(fail(`${path}.${key}`, 'range', 'strokeWidth must be 0..20'))
        } else validateNumeric(raw[key], `${path}.${key}`, allowedVars, errors)
        continue
      }
      const defaults = { strokeWidth: 2, opacity: 1 }
      raw[key] = defaults[key]
    } else if (raw[key] === undefined) {
      if (key === 'rx') { raw.rx = 0; continue }
      if (key === 'fontSize') { raw.fontSize = 16; continue }
      errors.push(fail(`${path}.${key}`, 'required', 'required'))
    } else {
      validateNumeric(raw[key], `${path}.${key}`, allowedVars, errors)
    }
  }
  for (const key of COLOR_PROPS) if (raw[key] !== undefined && !color(raw[key])) errors.push(fail(`${path}.${key}`, 'color', 'use a bounded CSS color'))
  if (raw.type === 'path') {
    if (!pathData(raw.d)) errors.push(fail(`${path}.d`, 'path', 'bounded SVG path data only'))
  }
  if (raw.type === 'text') {
    if (!stringField(raw.text, LIMITS.textChars)) errors.push(fail(`${path}.text`, 'text', 'text must be 1-200 characters'))
    if (raw.anchor !== undefined && !ANCHORS.has(raw.anchor)) errors.push(fail(`${path}.anchor`, 'anchor', 'start|middle|end'))
    if (raw.fontSize === undefined) raw.fontSize = 16
  }
  if (raw.dash !== undefined && (typeof raw.dash !== 'string' || !/^[0-9.,\s]{1,40}$/.test(raw.dash))) errors.push(fail(`${path}.dash`, 'dash', 'numeric dash pattern only'))
}

function validateTrackTarget(target, primitiveById, errors, path) {
  if (!isRecord(target)) { errors.push(fail(path, 'target', 'must be { primitive, property }')); return undefined }
  checkKeys(target, ['primitive', 'property'], path, errors)
  if (typeof target.primitive !== 'string' || !primitiveById.has(target.primitive)) { errors.push(fail(`${path}.primitive`, 'target', 'unknown primitive')); return undefined }
  const primitive = primitiveById.get(target.primitive)
  if (typeof target.property !== 'string' || !NUMERIC_PROPS[primitive.type].includes(target.property)) {
    errors.push(fail(`${path}.property`, 'target', 'unknown numeric property for this primitive'))
    return undefined
  }
  return target
}

/** Validate a raw value and return a structured result. No execution occurs. */
export function validateSceneSpec(raw) {
  const errors = []
  if (!isRecord(raw)) return { ok: false, errors: [fail('$', 'object', 'SceneSpec must be an object')] }
  checkKeys(raw, ['version', 'viewport', 'metadata', 'properties', 'primitives', 'timeline', 'controls', 'checkpoints', 'narration', 'fallback', 'accessibility', 'sourceRefs'], '$', errors)
  if (raw.version !== SCENE_SPEC_VERSION) errors.push(fail('version', 'version', `must be ${SCENE_SPEC_VERSION}`))

  // Viewport
  if (!isRecord(raw.viewport)) errors.push(fail('viewport', 'object', 'required'))
  else {
    checkKeys(raw.viewport, ['width', 'height', 'background'], 'viewport', errors)
    if (!inRange(raw.viewport.width, ...LIMITS.width)) errors.push(fail('viewport.width', 'range', `must be ${LIMITS.width[0]}..${LIMITS.width[1]}`))
    if (!inRange(raw.viewport.height, ...LIMITS.height)) errors.push(fail('viewport.height', 'range', `must be ${LIMITS.height[0]}..${LIMITS.height[1]}`))
    if (raw.viewport.background !== undefined && !color(raw.viewport.background)) errors.push(fail('viewport.background', 'color', 'bounded color'))
  }

  // Metadata
  if (!isRecord(raw.metadata)) errors.push(fail('metadata', 'object', 'required'))
  else {
    checkKeys(raw.metadata, ['title', 'subject', 'topic', 'objective', 'learner', 'misconceptions', 'expectedUnderstanding'], 'metadata', errors)
    for (const key of ['title', 'subject', 'objective', 'learner']) if (!stringField(raw.metadata[key], LIMITS.metadataChars)) errors.push(fail(`metadata.${key}`, 'string', 'required short string'))
    if (raw.metadata.topic !== undefined && !stringField(raw.metadata.topic, LIMITS.metadataChars)) errors.push(fail('metadata.topic', 'string', 'short string'))
    for (const key of ['misconceptions', 'expectedUnderstanding']) {
      if (raw.metadata[key] !== undefined) {
        if (!Array.isArray(raw.metadata[key]) || raw.metadata[key].length > 8 || !raw.metadata[key].every((entry) => stringField(entry, 400))) errors.push(fail(`metadata.${key}`, 'array', 'array of up to 8 short strings'))
      }
    }
  }

  // Properties
  const propertyIds = new Set()
  const properties = []
  // properties is optional: no controls is a valid static diagram.
  if (raw.properties === undefined) raw.properties = []
  if (!Array.isArray(raw.properties) || raw.properties.length > LIMITS.properties) errors.push(fail('properties', 'array', `up to ${LIMITS.properties} numeric properties`))
  else {
    raw.properties.forEach((property, index) => {
      const path = `properties[${index}]`
      if (!isRecord(property)) { errors.push(fail(path, 'object', 'must be an object')); return }
      checkKeys(property, ['id', 'label', 'min', 'max', 'step', 'default', 'unit'], path, errors)
      if (!stringField(property.id, 64) || !ID_RE.test(property.id)) errors.push(fail(`${path}.id`, 'id', 'invalid id'))
      else if (['t', 'duration'].includes(property.id)) errors.push(fail(`${path}.id`, 'reserved', 'property id is reserved'))
      else if (propertyIds.has(property.id)) errors.push(fail(`${path}.id`, 'duplicate', 'duplicate property id'))
      else propertyIds.add(property.id)
      if (!stringField(property.label, 80)) errors.push(fail(`${path}.label`, 'string', 'required label'))
      if (!finite(property.min) || !finite(property.max) || !finite(property.step) || property.max <= property.min || property.step <= 0 || property.step > property.max - property.min) errors.push(fail(`${path}.range`, 'range', 'min < max and 0 < step <= span'))
      if (!finite(property.default) || !inRange(property.default, property.min, property.max)) errors.push(fail(`${path}.default`, 'range', 'default must be in range'))
      if (property.unit !== undefined && !stringField(property.unit, 24)) errors.push(fail(`${path}.unit`, 'string', 'optional short unit'))
      properties.push(property)
    })
  }

  // Primitives
  const primitiveById = new Map()
  if (!Array.isArray(raw.primitives) || raw.primitives.length === 0 || raw.primitives.length > LIMITS.primitives) errors.push(fail('primitives', 'array', `1-${LIMITS.primitives} primitives required`))
  else {
    raw.primitives.forEach((primitive, index) => {
      validatePrimitive(primitive, index, propertyIds, errors)
      if (isRecord(primitive) && typeof primitive.id === 'string') {
        if (primitiveById.has(primitive.id)) errors.push(fail(`primitives[${index}].id`, 'duplicate', 'duplicate primitive id'))
        else primitiveById.set(primitive.id, primitive)
      }
    })
  }

  // Timeline
  const timeline = raw.timeline
  if (!isRecord(timeline)) errors.push(fail('timeline', 'object', 'required'))
  else {
    checkKeys(timeline, ['duration', 'tracks'], 'timeline', errors)
    if (!inRange(timeline.duration, 0.5, LIMITS.durationSeconds)) errors.push(fail('timeline.duration', 'range', `0.5..${LIMITS.durationSeconds}`))
    if (!Array.isArray(timeline.tracks) || timeline.tracks.length > LIMITS.tracks) errors.push(fail('timeline.tracks', 'array', `up to ${LIMITS.tracks} tracks`))
    else {
      let keyframeCount = 0
      timeline.tracks.forEach((track, index) => {
        const path = `timeline.tracks[${index}]`
        if (!isRecord(track)) { errors.push(fail(path, 'object', 'must be an object')); return }
        checkKeys(track, ['target', 'keyframes'], path, errors)
        const target = validateTrackTarget(track.target, primitiveById, errors, `${path}.target`)
        if (!Array.isArray(track.keyframes) || track.keyframes.length < 2 || track.keyframes.length > 100) { errors.push(fail(`${path}.keyframes`, 'array', '2-100 keyframes required')); return }
        keyframeCount += track.keyframes.length
        let lastAt = -1
        track.keyframes.forEach((keyframe, frameIndex) => {
          const framePath = `${path}.keyframes[${frameIndex}]`
          if (!isRecord(keyframe)) { errors.push(fail(framePath, 'object', 'must be an object')); return }
          checkKeys(keyframe, ['at', 'value', 'easing'], framePath, errors)
          if (!finite(keyframe.at) || keyframe.at < 0 || keyframe.at > (timeline.duration ?? 0)) errors.push(fail(`${framePath}.at`, 'range', 'at must be within timeline'))
          else if (keyframe.at < lastAt) errors.push(fail(`${framePath}.at`, 'order', 'keyframes must be nondecreasing'))
          else lastAt = keyframe.at
          validateNumeric(keyframe.value, `${framePath}.value`, [...propertyIds, 't', 'duration'], errors)
          if (keyframe.easing !== undefined && !EASINGS.has(keyframe.easing)) errors.push(fail(`${framePath}.easing`, 'easing', 'linear|ease-in|ease-out|ease-in-out|step'))
        })
        if (target !== undefined && track.keyframes.length > 0) target // semantic target validated
      })
      if (keyframeCount > LIMITS.keyframes) errors.push(fail('timeline.tracks', 'budget', `at most ${LIMITS.keyframes} keyframes total`))
    }
  }

  // Controls. Accept the compact property-reference form and the observed
  // `{type,target,min,max,step}` form; both normalize to the same safe control.
  if (raw.controls !== undefined) {
    if (!Array.isArray(raw.controls) || raw.controls.length > LIMITS.properties) errors.push(fail('controls', 'array', 'array of sliders'))
    else raw.controls.forEach((control, index) => {
      const path = `controls[${index}]`
      if (!isRecord(control)) { errors.push(fail(path, 'object', 'must be an object')); return }
      if (control.type === 'slider' && control.kind === undefined) control.kind = 'slider'
      if (typeof control.propertyId !== 'string' && typeof control.target === 'string') control.propertyId = control.target
      if (control.id === undefined) control.id = `control-${index + 1}`
      checkKeys(control, ['id', 'kind', 'propertyId', 'label', 'type', 'target', 'min', 'max', 'step'], path, errors)
      if (!stringField(control.id, 64) || !ID_RE.test(control.id)) errors.push(fail(`${path}.id`, 'id', 'invalid id'))
      if (control.kind !== 'slider') errors.push(fail(`${path}.kind`, 'kind', 'only slider controls are supported'))
      if (typeof control.propertyId !== 'string' || !propertyIds.has(control.propertyId)) errors.push(fail(`${path}.propertyId`, 'reference', 'must reference a property'))
      if (control.label !== undefined && !stringField(control.label, 80)) errors.push(fail(`${path}.label`, 'string', 'short label'))
    })
  }

  // Checkpoints
  if (raw.checkpoints !== undefined) {
    if (!Array.isArray(raw.checkpoints) || raw.checkpoints.length > LIMITS.checkpoints) errors.push(fail('checkpoints', 'array', `up to ${LIMITS.checkpoints} checkpoints`))
    else {
      let lastAt = -1
      raw.checkpoints.forEach((checkpoint, index) => {
        const path = `checkpoints[${index}]`
        if (!isRecord(checkpoint)) { errors.push(fail(path, 'object', 'must be an object')); return }
        if (checkpoint.id === undefined) checkpoint.id = `checkpoint-${index + 1}`
        if (checkpoint.pause === undefined) checkpoint.pause = false
        checkKeys(checkpoint, ['id', 'at', 'title', 'body', 'pause', 'learnerAction'], path, errors)
        if (!stringField(checkpoint.id, 64) || !ID_RE.test(checkpoint.id)) errors.push(fail(`${path}.id`, 'id', 'invalid id'))
        if (!finite(checkpoint.at) || checkpoint.at < 0 || checkpoint.at > (timeline?.duration ?? 0)) errors.push(fail(`${path}.at`, 'range', 'within timeline'))
        else if (checkpoint.at < lastAt) errors.push(fail(`${path}.at`, 'order', 'checkpoints must be nondecreasing'))
        else lastAt = checkpoint.at
        if (!stringField(checkpoint.title, 120)) errors.push(fail(`${path}.title`, 'string', 'required title'))
        if (!stringField(checkpoint.body, 600)) errors.push(fail(`${path}.body`, 'string', 'required body'))
        if (typeof checkpoint.pause !== 'boolean') errors.push(fail(`${path}.pause`, 'boolean', 'pause is required'))
        if (checkpoint.learnerAction !== undefined && !['continue', 'answer'].includes(checkpoint.learnerAction)) errors.push(fail(`${path}.learnerAction`, 'enum', 'continue|answer'))
      })
    }
  }

  // Narration
  if (raw.narration !== undefined) {
    if (!Array.isArray(raw.narration) || raw.narration.length > LIMITS.narration) errors.push(fail('narration', 'array', `up to ${LIMITS.narration} cues`))
    else {
      let lastAt = -1
      raw.narration.forEach((cue, index) => {
        const path = `narration[${index}]`
        if (!isRecord(cue)) { errors.push(fail(path, 'object', 'must be an object')); return }
        checkKeys(cue, ['at', 'text'], path, errors)
        if (!finite(cue.at) || cue.at < 0 || cue.at > (timeline?.duration ?? 0)) errors.push(fail(`${path}.at`, 'range', 'within timeline'))
        else if (cue.at < lastAt) errors.push(fail(`${path}.at`, 'order', 'narration must be nondecreasing'))
        else lastAt = cue.at
        if (!stringField(cue.text, 600)) errors.push(fail(`${path}.text`, 'string', 'required narration'))
      })
    }
  }

  // Fallback / accessibility / sources
  if (!isRecord(raw.fallback) || !stringField(raw.fallback.text, LIMITS.fallbackChars)) errors.push(fail('fallback.text', 'string', `required 1-${LIMITS.fallbackChars} characters`))
  else checkKeys(raw.fallback, ['text'], 'fallback', errors)
  if (!isRecord(raw.accessibility)) errors.push(fail('accessibility', 'object', 'required'))
  else {
    checkKeys(raw.accessibility, ['alt', 'reducedMotion', 'keyboard'], 'accessibility', errors)
    if (!stringField(raw.accessibility.alt, LIMITS.altChars)) errors.push(fail('accessibility.alt', 'string', `alt must be 1-${LIMITS.altChars} characters`))
    if (raw.accessibility.reducedMotion === true) raw.accessibility.reducedMotion = 'static'
    else if (raw.accessibility.reducedMotion === false) raw.accessibility.reducedMotion = 'no-autoplay'
    if (!REDUCED_MOTION.has(raw.accessibility.reducedMotion)) errors.push(fail('accessibility.reducedMotion', 'enum', 'static|no-autoplay (or boolean compatibility)'))
    if (typeof raw.accessibility.keyboard !== 'boolean') errors.push(fail('accessibility.keyboard', 'boolean', 'required'))
  }
  if (raw.sourceRefs !== undefined) {
    if (!Array.isArray(raw.sourceRefs) || raw.sourceRefs.length > LIMITS.sourceRefs) errors.push(fail('sourceRefs', 'array', 'up to 6 refs'))
    else raw.sourceRefs.forEach((ref, index) => {
      const path = `sourceRefs[${index}]`
      if (!isRecord(ref)) { errors.push(fail(path, 'object', 'must be an object')); return }
      checkKeys(ref, ['sourceId', 'locator', 'page', 'pageEnd'], path, errors)
      if (!stringField(ref.sourceId, 120)) errors.push(fail(`${path}.sourceId`, 'string', 'required'))
      if (!stringField(ref.locator, 300)) errors.push(fail(`${path}.locator`, 'string', 'required'))
      if (ref.page !== undefined && (!Number.isInteger(ref.page) || ref.page < 1)) errors.push(fail(`${path}.page`, 'page', 'positive integer'))
      if (ref.pageEnd !== undefined && (!Number.isInteger(ref.pageEnd) || ref.pageEnd < 1 || (ref.page !== undefined && ref.pageEnd < ref.page))) errors.push(fail(`${path}.pageEnd`, 'page', 'inclusive end >= page'))
    })
  }

  return errors.length === 0 ? { ok: true, spec: raw, errors: [] } : { ok: false, errors }
}

export function formatValidationErrors(errors) {
  return errors.map((entry) => `${entry.path}: ${entry.message} [${entry.code}]`).join('\n')
}

export function evaluateNumeric(value, vars) {
  if (finite(value)) return value
  if (!isRecord(value) || typeof value.expr !== 'string') throw new Error('invalid numeric value')
  const compiled = compileExpression(value.expr, Object.keys(vars))
  if (!compiled.ok) throw new Error(compiled.error)
  return compiled.evaluate(vars)
}

export { EASINGS, FUNCTIONS, NUMERIC_PROPS, PRIMITIVE_TYPES }

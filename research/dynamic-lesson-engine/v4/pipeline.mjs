/**
 * v4 structured validation and bounded repair.
 *
 * Strict, normalized and repaired outcomes are separate. Deterministic repair
 * is limited to safe shape/style fixes; expression and semantic failures are not
 * guessed or silently corrected.
 */
import { createHash } from 'node:crypto'
import { contractSummary, normalizeSceneSpec } from '../../../src/scene/contract.js'
import { validateSceneSpec as validateResearch } from '../scene-spec.mjs'
import { visualLintScene } from '../../../src/scene/visual-lint.js'
import { verifySceneSemantics } from './semantic.mjs'

export function stableStringify(value) {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}
export function hashValue(value) { return createHash('sha256').update(stableStringify(value)).digest('hex') }
export function hashFileText(text) { return createHash('sha256').update(text).digest('hex') }

const SUGGESTED = {
  'unknown-key': 'Remove or rename the unsupported key using the canonical contract.',
  'object': 'Provide the required object/array shape.', 'required': 'Add the required field.',
  'enum': 'Use one of the allowed values.', 'expression': 'Use declared property ids, t and duration only.',
  'type': 'Use the contract type.', 'range': 'Use a value inside the documented range.',
  'budget': 'Reduce the number of items to the documented budget.',
  'reference': 'Point at an existing id.', 'version': 'Use version "0.1".',
}

export function structuredSchemaErrors(errors, phase = 'schema') {
  return errors.map((entry) => {
    const code = String(entry.code ?? 'schema')
    return { category: phase, code, severity: 'error', path: entry.path ?? '$', primitiveId: null, expected: null, actual: null, explanation: entry.message ?? code, suggestedRepair: SUGGESTED[code] ?? 'Fix this field according to the canonical contract.' }
  })
}
export function structuredVisualErrors(visual) {
  return (visual?.diagnostics ?? []).map((entry) => ({ category: 'visual', code: entry.code, severity: entry.severity, path: entry.propertyPath ?? '$', primitiveId: entry.primitiveId, expected: null, actual: null, explanation: entry.message, suggestedRepair: entry.suggestedFix ?? 'Adjust the primitive style/geometry.' }))
}
export function structuredSemanticResult(semantic) {
  if (!semantic || semantic.status !== 'fail') return []
  const seen = new Set()
  return (semantic.checks ?? []).filter((check) => !check.ok).filter((check) => { const id = check.primitiveId ?? check.pointId ?? 'unknown'; const key = `${id}`; if (seen.has(key)) return false; seen.add(key); return true }).slice(0, 8).map((check) => ({ category: 'semantic', code: 'SEMANTIC_CONSTRAINT_FAILED', severity: 'error', path: `primitives.${check.primitiveId ?? check.pointId}`, primitiveId: check.primitiveId ?? check.pointId ?? null, expected: check.expected, actual: check.actual, explanation: 'Point coordinates do not match the independently supplied semantic reference.', suggestedRepair: 'Recheck the formula/coordinate mapping; do not change the reference to fit the drawing.' }))
}

export function analyzeScene(raw, { reference } = {}) {
  const rawSnapshot = structuredClone(raw)
  const strictValidation = validateResearch(structuredClone(rawSnapshot), { normalizeAliases: false })
  const normalization = normalizeSceneSpec(rawSnapshot)
  const normalizedValidation = validateResearch(structuredClone(normalization.spec), { normalizeAliases: false })
  let visual = null; let semantic = null
  if (normalizedValidation.ok) {
    visual = visualLintScene(normalizedValidation.spec, { validate: (spec) => validateResearch(spec, { normalizeAliases: false }) })
    semantic = verifySceneSemantics(normalizedValidation.spec, reference)
  }
  const errors = [
    ...(strictValidation.ok ? [] : structuredSchemaErrors(strictValidation.errors, 'strict-schema')),
    ...(normalizedValidation.ok ? [] : structuredSchemaErrors(normalizedValidation.errors, 'normalized-schema')),
    ...(normalizedValidation.ok ? structuredVisualErrors(visual) : []),
    ...structuredSemanticResult(semantic),
  ]
  const normalizedBlocking = errors.filter((entry) => entry.category !== 'strict-schema' && entry.severity === 'error')
  return { raw: rawSnapshot, strict: { ok: strictValidation.ok, errors: strictValidation.errors }, normalization, normalized: { ok: normalizedValidation.ok, spec: normalizedValidation.spec, errors: normalizedValidation.errors }, visual, semantic, errors, status: strictValidation.ok ? 'strict-valid' : normalizedValidation.ok && normalizedBlocking.length === 0 ? 'normalized-valid' : 'invalid' }
}

/** Safe deterministic fixes only. Every change is explicit and revalidated. */

/**
 * Explicitly recorded compatibility repairs for common contract drift observed in
 * generated artifacts. These are NOT strict success: they are deterministic
 * repairs, and they never change a mathematical relationship.
 */
export function repairContractDrift(raw) {
  const spec = structuredClone(raw); const changes = []
  if (spec.metadata && typeof spec.metadata.expectedUnderstanding === 'string') { spec.metadata.expectedUnderstanding = [spec.metadata.expectedUnderstanding]; changes.push({ path: 'metadata.expectedUnderstanding', action: 'wrap-string-in-array' }) }
  if (spec.metadata && typeof spec.metadata.misconceptions === 'string') { spec.metadata.misconceptions = [spec.metadata.misconceptions]; changes.push({ path: 'metadata.misconceptions', action: 'wrap-string-in-array' }) }
  const rewriteExpressions = (value, path) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach((entry, index) => rewriteExpressions(entry, `${path}[${index}]`)); return }
    if (typeof value.expr === 'string' && (value.expr.includes('**') || value.expr.includes('Math.'))) {
      value.expr = value.expr.replace(/\*\*/g, '^').replace(/Math\.PI/g, 'pi').replace(/Math\.(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|log|ln|floor|ceil|round|pow|min|max)\b/g, '$1')
      changes.push({ path: `${path}.expr`, action: 'canonicalize-math-syntax' })
    }
    for (const [key, entry] of Object.entries(value)) if (key !== 'expr') rewriteExpressions(entry, `${path}.${key}`)
  }
  rewriteExpressions(spec, '$')
  const numericFields = ['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'strokeWidth', 'fontSize', 'opacity']
  for (const [index, primitive] of (spec.primitives ?? []).entries()) {
    if (!primitive || typeof primitive !== 'object') continue
    for (const field of numericFields) {
      if (typeof primitive[field] === 'string' && primitive[field].length > 0 && !/^-?\d+(?:\.\d+)?$/.test(primitive[field])) {
        primitive[field] = { expr: primitive[field] }; changes.push({ path: `primitives[${index}].${field}`, action: 'wrap-bare-expression' })
      }
    }
  }
  if (spec.accessibility && typeof spec.accessibility.alt === 'string' && spec.accessibility.alt.length > 300) {
    spec.accessibility.alt = spec.accessibility.alt.slice(0, 300); changes.push({ path: 'accessibility.alt', action: 'truncate-to-limit' })
  }
  if (spec.viewport && spec.viewport.background === undefined) { spec.viewport.background = '#ffffff'; changes.push({ path: 'viewport.background', action: 'default-white' }) }
  if (spec.accessibility && spec.accessibility.keyboard === undefined) { spec.accessibility.keyboard = true; changes.push({ path: 'accessibility.keyboard', action: 'default-true' }) }
  for (const [index, property] of (spec.properties ?? []).entries()) {
    if (property && property.value !== undefined && property.default === undefined) { property.default = property.value; delete property.value; changes.push({ path: `properties[${index}].value`, action: 'rename-to-default' }) }
  }
  for (const [index, track] of (spec.timeline?.tracks ?? []).entries()) {
    if (track?.target && track.target.field !== undefined && track.target.property === undefined) { track.target.property = track.target.field; delete track.target.field; changes.push({ path: `timeline.tracks[${index}].target.field`, action: 'rename-to-property' }) }
  }
  for (const [index, control] of (spec.controls ?? []).entries()) {
    if (control && control.property !== undefined && control.propertyId === undefined) { control.propertyId = control.property; delete control.property; changes.push({ path: `controls[${index}].property`, action: 'rename-to-propertyId' }) }
  }
  if (spec.accessibility && typeof spec.accessibility.reducedMotion === 'string' && !['static', 'no-autoplay', 'true', 'false'].includes(spec.accessibility.reducedMotion)) {
    spec.accessibility.reducedMotion = 'static'; changes.push({ path: 'accessibility.reducedMotion', action: 'canonicalize-static' })
  }
  if (Array.isArray(spec.sourceRefs) && spec.sourceRefs.some((entry) => typeof entry !== 'object' || entry === null)) {
    spec.sourceRefs = spec.sourceRefs.filter((entry) => entry !== null && typeof entry === 'object'); changes.push({ path: 'sourceRefs', action: 'remove-bare-strings' })
  }
  if (spec.timeline && Array.isArray(spec.timeline.tracks)) {
    const ids = new Set((spec.primitives ?? []).map((primitive) => primitive.id))
    const validTracks = spec.timeline.tracks.filter((track) => track?.target && ids.has(track.target.primitive))
    if (validTracks.length !== spec.timeline.tracks.length) { spec.timeline.tracks = validTracks; changes.push({ path: 'timeline.tracks', action: 'drop-tracks-without-primitive-target' }) }
  }
  for (const [index, checkpoint] of (spec.checkpoints ?? []).entries()) {
    if (!checkpoint || typeof checkpoint !== 'object') continue
    let changed = false
    if (checkpoint.prompt !== undefined && checkpoint.body === undefined) { checkpoint.body = checkpoint.prompt; delete checkpoint.prompt; changed = true }
    if (typeof checkpoint.id !== 'string') { checkpoint.id = `cp-${index + 1}`; changed = true }
    if (typeof checkpoint.title !== 'string') { checkpoint.title = 'Checkpoint'; changed = true }
    if (typeof checkpoint.pause !== 'boolean') { checkpoint.pause = true; changed = true }
    if (changed) changes.push({ path: `checkpoints[${index}]`, action: 'canonicalize-fields' })
  }
  return { spec, changes }
}

export function deterministicRepair(spec) {
  const repaired = structuredClone(spec); const changes = []
  for (const primitive of repaired.primitives ?? []) {
    if (primitive.type === 'line' || primitive.type === 'arrow') {
      if (primitive.stroke === undefined || primitive.stroke === 'none') {
        primitive.stroke = '#111827'; primitive.strokeWidth = primitive.strokeWidth ?? 2
        changes.push({ path: `primitives.${primitive.id}.stroke`, action: 'add-visible-stroke' })
      }
    }
  }
  if (repaired.properties === undefined) { repaired.properties = []; changes.push({ path: 'properties', action: 'default-empty-array' }) }
  return { spec: repaired, changes }
}

export function attemptRecord({ caseId, candidateId, contractVersion = 'v4', inputHash, outputHash, analysis, repairHistory = [], finalStatus }) {
  return {
    attemptId: hashValue({ caseId, candidateId, contractVersion, inputHash }).slice(0, 24), candidateId, contractVersion, caseId, inputHash, outputHash,
    strictValid: analysis?.strict?.ok === true, normalizedValid: analysis?.normalized?.ok === true,
    visualOk: analysis?.visual?.ok === true, semanticStatus: analysis?.semantic?.status ?? 'not-applicable',
    errors: analysis?.errors ?? [], repairHistory, finalStatus: finalStatus ?? analysis?.status, createdAt: new Date().toISOString(),
  }
}

export function repairPrompt(caseId, errors) {
  return `Repair only this SceneSpec artifact in place: /tmp/udt-scene-v4/<folder>/${caseId}.scene.json

Do NOT rewrite unrelated content. Fix the structured errors below. Preserve the teaching objective. If an error is expression or semantic, re-derive the formula/coordinates rather than guessing, and verify against the stated objective. Do not change any approved reference values. Never add JavaScript, HTML, CSS, URLs, images or event handlers.

${contractSummary()}

STRUCTURED ERRORS:
${JSON.stringify(errors, null, 2)}

After editing, reply "repaired ${caseId}".`
}

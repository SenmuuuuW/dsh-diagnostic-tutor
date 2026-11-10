/** Limited semantic verification for explicitly supported constraints. */
import { evaluateNumeric } from '../scene-spec.mjs'

function lowerVars(vars) {
  const out = { ...vars }
  for (const [key, value] of Object.entries(vars)) if (!(key.toLowerCase() in out)) out[key.toLowerCase()] = value
  return out
}
function numeric(value, vars) {
  try { return evaluateNumeric(value, lowerVars(vars)) } catch { return null }
}

/**
 * Verify a point primitive against independently supplied reference samples.
 * Reference: {kind:"sampled-point", samples:[{vars:{angle:0},x:290,y:180}], tolerance:2}
 * No point primitive -> UNVERIFIED, not PASS.
 */
export function verifySampledPoint(scene, reference) {
  if (!reference || reference.kind !== 'sampled-point') return { status: 'not-applicable', checks: [] }
  const tolerance = Number(reference.tolerance ?? 2)
  const hasTrack = (primitive, property) => (scene.timeline?.tracks ?? []).some((entry) => entry.target?.primitive === primitive.id && entry.target?.property === property)
  const points = (scene.primitives ?? []).filter((primitive) => primitive.type === 'circle' && (typeof primitive.cx === 'object' || hasTrack(primitive, 'cx')) && (typeof primitive.cy === 'object' || hasTrack(primitive, 'cy')) && !(Number(primitive.r) > 12))
  if (points.length === 0) return { status: 'unverified', reason: 'no point-like circle with expression coordinates', checks: [] }
  const defaults = Object.fromEntries((scene.properties ?? []).map((property) => [property.id, property.default]))
  const checks = []
  for (const point of points) {
    let matched = 0
    for (const sample of reference.samples ?? []) {
      const vars = { ...defaults, ...(sample.vars ?? {}), t: sample.t ?? 0, duration: scene.timeline.duration }
      const x = numeric(point.cx, vars); const y = numeric(point.cy, vars)
      const ok = x !== null && y !== null && Math.abs(x - sample.x) <= tolerance && Math.abs(y - sample.y) <= tolerance
      checks.push({ primitiveId: point.id, vars, expected: { x: sample.x, y: sample.y }, actual: { x, y }, ok })
      if (ok) matched += 1
    }
    if (matched === (reference.samples ?? []).length && checks.length > 0) return { status: 'pass', primitiveId: point.id, checks }
  }
  return { status: 'fail', checks, reason: 'no point primitive matched all reference samples' }
}


/**
 * Layout-independent point-on-circle check. Reference:
 * {kind:"point-on-circle", tolerance:2}. It discovers a constant circle and a
 * small circle whose center is expression-driven, then samples the scene
 * properties. It cannot verify that the circle *means* a unit circle.
 */

function resolveNumeric(primitive, key, scene, vars) {
  const track = (scene.timeline?.tracks ?? []).find((entry) => entry.target?.primitive === primitive.id && entry.target?.property === key)
  if (!track) return numeric(primitive[key], vars)
  const frames = track.keyframes ?? []
  if (frames.length === 0) return numeric(primitive[key], vars)
  const time = Number(vars.t ?? 0)
  const values = frames.map((frame) => ({ at: frame.at, value: numeric(frame.value, vars) })).filter((frame) => frame.value !== null)
  if (values.length === 0) return null
  if (time <= values[0].at) return values[0].value
  if (time >= values[values.length - 1].at) return values[values.length - 1].value
  for (let index = 0; index + 1 < values.length; index += 1) {
    if (time >= values[index].at && time <= values[index + 1].at) {
      const span = values[index + 1].at - values[index].at
      if (span <= 0) return values[index].value
      const ratio = (time - values[index].at) / span
      return values[index].value + (values[index + 1].value - values[index].value) * ratio
    }
  }
  return values[values.length - 1].value
}

export function verifyPointOnCircle(scene, reference) {
  const tolerance = Number(reference.tolerance ?? 2)
  const circles = (scene.primitives ?? []).filter((primitive) => primitive.type === 'circle' && typeof primitive.cx === 'number' && typeof primitive.cy === 'number' && typeof primitive.r === 'number' && Number(primitive.r) > 12)
  const hasCircleTrack = (primitive, property) => (scene.timeline?.tracks ?? []).some((entry) => entry.target?.primitive === primitive.id && entry.target?.property === property)
  const points = (scene.primitives ?? []).filter((primitive) => primitive.type === 'circle' && (typeof primitive.cx === 'object' || hasCircleTrack(primitive, 'cx')) && (typeof primitive.cy === 'object' || hasCircleTrack(primitive, 'cy')) && !(Number(primitive.r) > 12))
  if (circles.length === 0 || points.length === 0) return { status: 'unverified', reason: 'no constant circle + expression point pair', checks: [] }
  const defaults = Object.fromEntries((scene.properties ?? []).map((property) => [property.id, property.default]))
  const rows = [{ ...defaults, t: 0, duration: scene.timeline.duration }]
  rows.push({ ...defaults, t: scene.timeline.duration / 2, duration: scene.timeline.duration })
  rows.push({ ...defaults, t: scene.timeline.duration, duration: scene.timeline.duration })
  for (const property of scene.properties ?? []) {
    rows.push({ ...defaults, [property.id]: property.min, t: 0, duration: scene.timeline.duration })
    rows.push({ ...defaults, [property.id]: property.max, t: 0, duration: scene.timeline.duration })
  }
  const checks = []
  for (const circle of circles) for (const point of points) {
    let all = true
    for (const vars of rows) {
      const x = resolveNumeric(point, 'cx', scene, vars); const y = resolveNumeric(point, 'cy', scene, vars)
      const centerX = resolveNumeric(circle, 'cx', scene, vars); const centerY = resolveNumeric(circle, 'cy', scene, vars); const radius = resolveNumeric(circle, 'r', scene, vars)
      const distance = x === null || y === null || centerX === null || centerY === null ? null : Math.hypot(x - centerX, y - centerY)
      const ok = distance !== null && radius !== null && Math.abs(distance - radius) <= tolerance
      checks.push({ circleId: circle.id, pointId: point.id, vars, expected: { distance: radius }, actual: { distance }, ok })
      if (!ok) all = false
    }
    if (all && checks.length > 0) return { status: 'pass', circleId: circle.id, pointId: point.id, checks }
  }
  return { status: 'fail', checks, reason: 'no point primitive maintained the circle radius at sampled parameters' }
}

export function verifySceneSemantics(scene, reference) {
  if (!reference) return { status: 'not-applicable', checks: [] }
  if (reference.kind === 'point-on-circle') return verifyPointOnCircle(scene, reference)
  if (reference.kind === 'sampled-point') return verifySampledPoint(scene, reference)
  return { status: 'unverified', reason: `unsupported semantic reference kind: ${reference.kind}`, checks: [] }
}

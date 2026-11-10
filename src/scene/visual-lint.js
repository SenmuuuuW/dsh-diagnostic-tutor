/**
 * Static visual quality linter for SceneSpec.
 *
 * It is intentionally evidence-oriented: it flags concrete reasons a scene may
 * be unreadable, but it does not claim to judge teaching quality. Research and
 * production share this file; no DOM, Node or model calls are required.
 */
import { evaluateNumeric, validateSceneSpec } from './spec.js'

const BASIC = { black:'#000000', white:'#ffffff', red:'#ff0000', green:'#008000', blue:'#0000ff', gray:'#808080', grey:'#808080', orange:'#ffa500', yellow:'#ffff00', purple:'#800080', currentColor:'#000000', transparent:'#00000000' }

function fail(code, severity, message, extra = {}) { return { code, severity, primitiveId: extra.primitiveId ?? null, propertyPath: extra.propertyPath ?? null, message, suggestedFix: extra.suggestedFix ?? null, context: extra.context ?? null } }

function parseColor(input) {
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (BASIC[value] !== undefined) return parseColor(BASIC[value])
  let m = /^#([0-9a-f]{3,8})$/.exec(value)
  if (m) {
    const hex = m[1]
    if (hex.length === 3) return [parseInt(hex[0]+hex[0],16),parseInt(hex[1]+hex[1],16),parseInt(hex[2]+hex[2],16),1]
    if (hex.length === 4) return [parseInt(hex[0]+hex[0],16),parseInt(hex[1]+hex[1],16),parseInt(hex[2]+hex[2],16),parseInt(hex[3]+hex[3],16)/255]
    if (hex.length === 6) return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),1]
    if (hex.length === 8) return [parseInt(hex.slice(0,2),16),parseInt(hex.slice(2,4),16),parseInt(hex.slice(4,6),16),parseInt(hex.slice(6,8),16)/255]
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value)
  if (m) return [Number(m[1]),Number(m[2]),Number(m[3]),m[4] === undefined ? 1 : Number(m[4])]
  m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/.exec(value)
  if (m) {
    const h = Number(m[1])/360; const s = Number(m[2])/100; const l = Number(m[3])/100
    const hue = (p,q,t) => { let v=t; if(v<0)v+=1; if(v>1)v-=1; if(v<1/6)return p+(q-p)*6*v; if(v<1/2)return q; if(v<2/3)return p+(q-p)*(2/3-v)*6; return p }
    const q = l < .5 ? l*(1+s) : l+s-l*s; const p = 2*l-q
    return [Math.round(hue(p,q,h+1/3)*255),Math.round(hue(p,q,h)*255),Math.round(hue(p,q,h-1/3)*255),m[4] === undefined ? 1 : Number(m[4])]
  }
  return null
}
function blend(fg, bg) {
  if (!fg) return null
  const a = fg[3] ?? 1
  return [fg[0]*a+bg[0]*(1-a), fg[1]*a+bg[1]*(1-a), fg[2]*a+bg[2]*(1-a), 1]
}
function luminance([r,g,b]) {
  const channel = (v) => { const c=v/255; return c <= .03928 ? c/12.92 : ((c+.055)/1.055)**2.4 }
  return .2126*channel(r)+.7152*channel(g)+.0722*channel(b)
}
function contrast(a,b) { const l1=luminance(a); const l2=luminance(b); return (Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05) }

function numericValue(value, vars) { try { return evaluateNumeric(value, vars) } catch { return null } }
function trackValue(spec, primitive, key, time, vars) {
  const track = (spec.timeline?.tracks ?? []).find((entry) => entry.target.primitive === primitive.id && entry.target.property === key)
  if (!track) return numericValue(primitive[key], vars)
  const frames = track.keyframes
  if (!frames?.length) return numericValue(primitive[key], vars)
  if (time <= frames[0].at) return numericValue(frames[0].value, {...vars})
  if (time >= frames.at(-1).at) return numericValue(frames.at(-1).value, {...vars})
  // Exact keyframe is enough for a static lint; interpolation cannot add new extrema
  // beyond its endpoints for the linear/ease forms used here.
  const frame = frames.find((entry) => Math.abs(entry.at - time) < 1e-6)
  return numericValue((frame ?? frames.at(-1)).value, {...vars})
}

function contextList(spec) {
  const base = { t: 0, duration: spec.timeline.duration }
  const props = spec.properties ?? []
  const defaults = Object.fromEntries(props.map((p) => [p.id, p.default]))
  const times = new Set([0, spec.timeline.duration / 2, spec.timeline.duration])
  for (const track of spec.timeline?.tracks ?? []) for (const frame of track.keyframes) times.add(frame.at)
  for (const cp of spec.checkpoints ?? []) times.add(cp.at)
  const contexts = []
  const values = (() => {
    if (props.length === 0) return [{...defaults,t:0,duration:spec.timeline.duration}]
    const rows = [defaults]
    for (const prop of props) {
      rows.push({...defaults,[prop.id]:prop.min})
      rows.push({...defaults,[prop.id]:prop.max})
    }
    return rows
  })()
  for (const params of values) for (const t of [...times].sort((a,b)=>a-b)) {
    const context = {...params,t,duration:spec.timeline.duration}
    // Match the renderer's case-insensitive expression identifiers.
    for (const [key, value] of Object.entries(context)) { const lower = key.toLowerCase(); if (!(lower in context)) context[lower] = value }
    contexts.push(context)
  }
  return contexts.slice(0, 120)
}

function resolveBounds(primitive, spec, vars) {
  const value = (key) => trackValue(spec, primitive, key, vars.t, vars)
  if (primitive.type === 'rect') {
    const x=value('x'), y=value('y'), w=value('width'), h=value('height')
    if ([x,y,w,h].some((v)=>v===null||!Number.isFinite(v))) return null
    return {x,y,width:w,height:h}
  }
  if (primitive.type === 'circle') {
    const cx=value('cx'), cy=value('cy'), r=value('r')
    if ([cx,cy,r].some((v)=>v===null||!Number.isFinite(v))) return null
    return {x:cx-r,y:cy-r,width:2*r,height:2*r}
  }
  if (primitive.type === 'line' || primitive.type === 'arrow') {
    const x1=value('x1'), y1=value('y1'), x2=value('x2'), y2=value('y2')
    if ([x1,y1,x2,y2].some((v)=>v===null||!Number.isFinite(v))) return null
    return {x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1),height:Math.abs(y2-y1)}
  }
  if (primitive.type === 'text') {
    const x=value('x'), y=value('y'), size=value('fontSize')
    if ([x,y,size].some((v)=>v===null||!Number.isFinite(v))) return null
    const width = Math.max(1, String(primitive.text ?? '').length * size * .6)
    const height = size
    const anchor = primitive.anchor ?? 'start'
    return {x:anchor==='middle'?x-width/2:anchor==='end'?x-width:x,y:y-height,width,height,text:true}
  }
  if (primitive.type === 'path') {
    const nums = String(primitive.d ?? '').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? []
    if (nums.length < 2) return null
    const xs=[]; const ys=[]
    for(let i=0;i+1<nums.length;i+=2){xs.push(nums[i]);ys.push(nums[i+1])}
    if (!xs.length || xs.some((v)=>!Number.isFinite(v)) || ys.some((v)=>!Number.isFinite(v))) return null
    return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
  }
  return null
}

function lintPrimitive(primitive, spec, contexts, background, diagnostics) {
  const pathBase = `primitives.${primitive.id}`
  const isLine = primitive.type === 'line' || primitive.type === 'arrow'
  const fill = primitive.fill === undefined ? null : parseColor(primitive.fill)
  const stroke = primitive.stroke === undefined ? null : parseColor(primitive.stroke)
  const fillOmitted = primitive.fill === undefined
  // SVG defaults a closed shape/text fill to black, not "invisible". Treat an
  // omitted fill as an implicit-black warning; only an explicit `none` with no
  // stroke is truly invisible.
  const hasFill = !isLine && primitive.fill !== 'none' && primitive.fill !== 'transparent'
  const hasStroke = primitive.stroke !== undefined && primitive.stroke !== 'none' && primitive.stroke !== 'transparent'
  if (isLine && !hasStroke) diagnostics.push(fail('VISUAL_MISSING_STROKE','error',`Line-like primitive "${primitive.id}" has no visible stroke.`,{primitiveId:primitive.id,propertyPath:`${pathBase}.stroke`,suggestedFix:'Set an explicit stroke color and strokeWidth.'}))
  if (!isLine && !hasFill && !hasStroke) diagnostics.push(fail('VISUAL_INVISIBLE','error',`Primitive "${primitive.id}" has neither visible fill nor stroke.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Set fill or stroke to a visible color.'}))
  if (!isLine && fillOmitted) diagnostics.push(fail('VISUAL_IMPLICIT_FILL','warning',`Primitive "${primitive.id}" omits fill; SVG defaults to black fill.`,{primitiveId:primitive.id,propertyPath:`${pathBase}.fill`,suggestedFix:'Set an explicit fill (use "none" for an outline).'}))
  if (hasStroke && stroke && background && contrast(stroke, background) < 1.6) diagnostics.push(fail('VISUAL_LOW_CONTRAST','warning',`Stroke on "${primitive.id}" is nearly invisible against the background.`,{primitiveId:primitive.id,propertyPath:`${pathBase}.stroke`,suggestedFix:'Use a darker/contrasting stroke.'}))
  if (!isLine && hasFill && fill && background && contrast(fill, background) < 1.6) diagnostics.push(fail('VISUAL_LOW_CONTRAST','warning',`Fill on "${primitive.id}" is nearly invisible against the background.`,{primitiveId:primitive.id,propertyPath:`${pathBase}.fill`,suggestedFix:'Use a contrasting fill or add a stroke.'}))
  if (primitive.opacity !== undefined && typeof primitive.opacity === 'number' && primitive.opacity <= 0.05) {
    // Research state snapshots can reveal a primitive later. Do not call a
    // deliberately hidden element invisible when a named state makes it visible.
    const revealedByState = (spec.states ?? []).some((state) => (state.overrides ?? []).some((override) => override.primitive === primitive.id && override.property === 'opacity' && Number(override.value) > 0.05))
    const revealedByTrack = (spec.timeline?.tracks ?? []).some((track) => track.target?.primitive === primitive.id && track.target?.property === 'opacity' && (track.keyframes ?? []).some((frame) => Number(frame.value) > 0.05))
    const revealed = revealedByState || revealedByTrack
    diagnostics.push(fail('VISUAL_INVISIBLE', revealed ? 'warning' : 'error', revealed ? `Primitive "${primitive.id}" starts hidden but is revealed by a state or animation.` : `Primitive "${primitive.id}" is effectively transparent (opacity ${primitive.opacity}).`,{primitiveId:primitive.id,propertyPath:`${pathBase}.opacity`,suggestedFix:revealed ? 'Confirm the state/animation timeline reveals it when intended.' : 'Use opacity above 0.05 or remove the primitive.'}))
  }

  const boxes = []
  for (const vars of contexts) {
    const box = resolveBounds(primitive, spec, vars)
    if (box === null) { diagnostics.push(fail('VISUAL_INVALID_EXPRESSION','error',`Primitive "${primitive.id}" has a non-finite numeric value at a sampled frame/parameter.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Check the expression at parameter minima/maxima and timeline frames.'})); return }
    boxes.push(box)
    if (box.width < 0 || box.height < 0 || (primitive.type==='circle' && box.width <= 0) || (primitive.type==='rect' && (box.width===0||box.height===0))) diagnostics.push(fail('VISUAL_INVALID_GEOMETRY','error',`Primitive "${primitive.id}" has zero or negative dimensions.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Set positive width/height/radius.'}))
    if (![box.x,box.y,box.width,box.height].every(Number.isFinite) || Math.max(Math.abs(box.x),Math.abs(box.y),Math.abs(box.width),Math.abs(box.height)) > 100000) diagnostics.push(fail('VISUAL_EXTREME_VALUE','warning',`Primitive "${primitive.id}" has an extreme or non-finite geometric value.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Keep coordinates within the intended viewport.'}))
    const viewport = spec.viewport
    const outside = box.x + box.width < 0 || box.y + box.height < 0 || box.x > viewport.width || box.y > viewport.height
    if (outside) diagnostics.push(fail('VISUAL_OUT_OF_VIEWPORT','error',`Primitive "${primitive.id}" is entirely outside the viewport at a sampled frame.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Move the primitive inside the viewport or narrow its animation range.'}))
    else if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) diagnostics.push(fail('VISUAL_OUT_OF_VIEWPORT','warning',`Primitive "${primitive.id}" is partially clipped by the viewport at a sampled frame.`,{primitiveId:primitive.id,propertyPath:pathBase,suggestedFix:'Check whether the clipping is intentional; keep labels inside the frame.'}))
    if (box.text) {
      if (box.width > viewport.width * .95) diagnostics.push(fail('VISUAL_TEXT_OVERFLOW','warning',`Text primitive "${primitive.id}" is wider than the viewport.`,{primitiveId:primitive.id,propertyPath:`${pathBase}.text`,suggestedFix:'Shorten the label or reduce its font size.'}))
    }
  }
  return boxes
}

function lintOverlaps(spec, boundsByPrimitive, diagnostics) {
  const texts = (spec.primitives ?? []).filter((p)=>p.type==='text')
  for (let i=0;i<texts.length;i++) for (let j=i+1;j<texts.length;j++) {
    const a = boundsByPrimitive.get(texts[i].id)?.[0]; const b = boundsByPrimitive.get(texts[j].id)?.[0]
    if (!a || !b) continue
    const overlapX = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
    const overlapY = Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
    if (overlapX*overlapY > Math.min(a.width*a.height,b.width*b.height)*.35) {
      diagnostics.push(fail('VISUAL_TEXT_OVERLAP','warning',`Text labels "${texts[i].id}" and "${texts[j].id}" overlap.`,{primitiveId:texts[i].id,propertyPath:'primitives',suggestedFix:'Move or re-anchor one label.'}))
    }
  }
}

export function visualLintScene(rawSpec, options = {}) {
  const validate = options.validate ?? validateSceneSpec
  const validation = validate(rawSpec)
  if (!validation.ok) return { ok:false, diagnostics:[fail('VISUAL_SCHEMA_INVALID','error','SceneSpec failed schema validation before visual review.',{propertyPath:'$',suggestedFix:'Fix schema errors first.'})], stats:{primitiveCount:0,frames:0} }
  const spec = validation.spec
  const background = parseColor(spec.viewport.background ?? '#ffffff') ?? [255,255,255,1]
  const diagnostics = []
  const contexts = contextList(spec)
  const bounds = new Map()
  for (const primitive of spec.primitives) bounds.set(primitive.id, lintPrimitive(primitive, spec, contexts, background, diagnostics))
  lintOverlaps(spec, bounds, diagnostics)
  // Duplicate exact text positions are almost always a copy/paste mistake.
  const byPosition = new Map()
  for (const primitive of spec.primitives.filter((p)=>p.type==='text')) {
    const box = bounds.get(primitive.id)?.[0]
    if (!box) continue
    const key = `${Math.round(box.x)}:${Math.round(box.y)}:${primitive.text}`
    if (byPosition.has(key)) diagnostics.push(fail('VISUAL_DUPLICATE','warning',`Text primitive "${primitive.id}" duplicates an earlier label at the same position.`,{primitiveId:primitive.id,propertyPath:`primitives.${primitive.id}`,suggestedFix:'Remove the duplicate or move it intentionally.'}))
    else byPosition.set(key, primitive.id)
  }
  // Deduplicate: the same primitive can be sampled at many frames.
  const seen = new Set(); const unique=[]
  for (const entry of diagnostics) { const key = `${entry.code}:${entry.primitiveId}:${entry.propertyPath}:${entry.message}`; if(!seen.has(key)){seen.add(key);unique.push(entry)} }
  unique.sort((a,b)=> (a.severity==='error'?0:a.severity==='warning'?1:2) - (b.severity==='error'?0:b.severity==='warning'?1:2) || a.code.localeCompare(b.code))
  return { ok: unique.every((entry)=>entry.severity!=='error'), diagnostics: unique, stats:{primitiveCount:spec.primitives.length, frames:contexts.length, errors:unique.filter(e=>e.severity==='error').length, warnings:unique.filter(e=>e.severity==='warning').length} }
}

export { parseColor, contrast }

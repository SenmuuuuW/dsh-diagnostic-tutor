/**
 * Canonical SceneSpec contract metadata.
 *
 * The validators own enforcement; this module is the single source for the
 * generator-facing field summary, contract version and the small, explicit
 * normalization policy. It does not replace strict validation.
 */
import { EASINGS, LIMITS, NUMERIC_PROPS, PRIMITIVE_TYPES } from './spec.js'

export const SCENE_SPEC_VERSION = '0.1'
export const GENERATOR_CONTRACT_VERSION = 'v4'
export const RESEARCH_SCHEMA_VERSION = '0.1.1'

export const TOP_LEVEL_FIELDS = Object.freeze([
  'version', 'viewport', 'metadata', 'properties', 'primitives', 'timeline',
  'controls', 'checkpoints', 'narration', 'fallback', 'accessibility', 'sourceRefs',
])
export const METADATA_FIELDS = Object.freeze([
  'title', 'subject', 'topic', 'objective', 'learner', 'misconceptions', 'expectedUnderstanding',
])
export const DEPRECATED_ALIASES = Object.freeze({ textAnchor: 'anchor' })
export const NORMALIZATION_RULES = Object.freeze([
  Object.freeze({
    from: 'primitives[].textAnchor',
    to: 'primitives[].anchor',
    reason: 'SVG spelling was used by early generators; canonical SceneSpec uses anchor.',
    countedAs: 'normalized',
  }),
])

export function contractSummary() {
  const primitives = Object.entries(NUMERIC_PROPS).map(([type, fields]) => {
    const colors = ['fill', 'stroke']
    const extras = type === 'text'
      ? ['text', 'anchor', 'fontWeight']
      : type === 'path'
        ? ['d', 'dash']
        : type === 'line' || type === 'arrow'
          ? ['dash']
          : ['dash']
    return `  - ${type}: ${[...fields, ...colors, ...extras].join(', ')}`
  }).join('\n')
  return `Canonical SceneSpec ${SCENE_SPEC_VERSION} (generator contract ${GENERATOR_CONTRACT_VERSION})
Top-level fields: ${TOP_LEVEL_FIELDS.join(', ')}
Metadata fields: ${METADATA_FIELDS.join(', ')}
Limit: ${LIMITS.primitives} primitives, ${LIMITS.properties} numeric properties, ${LIMITS.tracks} tracks, ${LIMITS.keyframes} keyframes, ${LIMITS.checkpoints} checkpoints.
Primitive fields by type:
${primitives}
Numbers may be a number or {"expr":"..."}; expressions use declared property ids + t + duration only.
Text MUST use anchor (start|middle|end). textAnchor is a deprecated alias accepted only by explicit normalization, never by strict validation.
properties is optional; omit it or write [] when there are no numeric properties.
metadata.topic is optional. metadata.misconceptions and metadata.expectedUnderstanding are arrays of strings (not a single string). Accessibility, fallback and viewport are required.
property item: {"id":"angle","label":"angle","min":0,"max":6.28,"step":0.01,"default":0.8,"unit":"rad"} — default is REQUIRED; value is not a property field.
timeline track: {"target":{"primitive":"point","property":"cx"},"keyframes":[{"at":0,"value":100,"easing":"linear"}]} — target.property is REQUIRED; field is not a target field.
checkpoint: {"id":"cp-1","at":3.14,"title":"Predict","body":"What is the height?","pause":true,"learnerAction":"answer"} — prompt is not a checkpoint field.
control: {"id":"angle-control","kind":"slider","propertyId":"angle","label":"angle"} — propertyId is REQUIRED; property is not a control field.
accessibility: {"alt":"...","reducedMotion":"static","keyboard":true} — reducedMotion is exactly static or no-autoplay.
sourceRefs: [] or [{"sourceId":"...","locator":"..."}] — never an array of bare strings.
viewport: {"width":960,"height":540,"background":"#ffffff"} — all three fields.
States/stateTimeline are a research-only extension (versions ${RESEARCH_SCHEMA_VERSION}); never use them in production-approved scenes.
Easings: ${[...EASINGS].join('|')}. Primitive types: ${[...PRIMITIVE_TYPES].join('|')}.`
}

/**
 * Deterministic compatibility normalization. Every change is recorded and is
 * reported as NORMALIZED, never as strict first-pass success.
 */
export function normalizeSceneSpec(raw) {
  const changes = []
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { spec: raw, changes }
  const spec = structuredClone(raw)
  if (Array.isArray(spec.primitives)) {
    for (const [index, primitive] of spec.primitives.entries()) {
      if (primitive === null || typeof primitive !== 'object' || Array.isArray(primitive)) continue
      if (primitive.textAnchor !== undefined && primitive.anchor === undefined) {
        primitive.anchor = primitive.textAnchor
        delete primitive.textAnchor
        changes.push({ path: `primitives[${index}].textAnchor`, from: 'textAnchor', to: 'anchor' })
      }
    }
  }
  return { spec, changes }
}

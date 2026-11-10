/**
 * Code-reviewed production scene registry.
 *
 * This is the approval boundary: a valid SceneSpec is renderable only when its
 * canonical {spec, fallback} key is present in this compiled registry. A model
 * cannot set an `approved` field; a content change produces a different key.
 * Adding a scene is a source-code review action, not a runtime mutation.
 */
import { canonicalSceneKey } from './canonical.js'
import { validateSceneSpec } from './spec.js'
import { visualLintScene } from './visual-lint.js'

export interface ApprovedScene {
  readonly id: string
  readonly title: string
  /** Normalized spec produced by validateSceneSpec. */
  readonly spec: any
  readonly fallback: string
  /** SHA-256 of canonicalSceneKey({spec, fallback}); server-computed when displayed. */
  readonly digest?: string
}

const approvedSource = {
  id: 'approved-unit-circle',
  title: 'Unit circle and sine',
  spec: {
    version: '0.1',
    viewport: { width: 820, height: 380, background: '#ffffff' },
    metadata: {
      title: 'Unit circle and sine',
      subject: 'Mathematics / trigonometry',
      objective: 'Connect a point on the unit circle to the height of the sine curve.',
      learner: 'Knows right-triangle ratios',
      misconceptions: ['Sine is only a triangle ratio'],
      expectedUnderstanding: ['The y-coordinate on the circle equals sine of the angle'],
    },
    properties: [
      { id: 'angle', label: 'angle', min: 0, max: 6.283185307, step: 0.01, default: 0.8, unit: 'rad' },
    ],
    primitives: [
      { id: 'circle', type: 'circle', cx: 180, cy: 180, r: 110, fill: 'none', stroke: '#2563eb', strokeWidth: 2 },
      { id: 'radius', type: 'line', x1: 180, y1: 180, x2: { expr: '180 + 110*cos(angle)' }, y2: { expr: '180 - 110*sin(angle)' }, stroke: '#111827', strokeWidth: 2 },
      { id: 'height', type: 'line', x1: { expr: '180 + 110*cos(angle)' }, y1: 180, x2: { expr: '180 + 110*cos(angle)' }, y2: { expr: '180 - 110*sin(angle)' }, stroke: '#dc2626', strokeWidth: 3, dash: '5 4' },
      { id: 'point', type: 'circle', cx: { expr: '180 + 110*cos(angle)' }, cy: { expr: '180 - 110*sin(angle)' }, r: 6, fill: '#dc2626' },
      { id: 'sine', type: 'path', d: 'M 420 180 Q 470 70 520 180 T 620 180 T 720 180 T 800 180', fill: 'none', stroke: '#93c5fd', strokeWidth: 2 },
      { id: 'sine-point', type: 'circle', cx: { expr: '420 + 370*(angle/6.283185307)' }, cy: { expr: '180 - 110*sin(angle)' }, r: 5, fill: '#dc2626' },
      { id: 'label', type: 'text', x: 430, y: 35, text: 'height = sin(angle)', fontSize: 14, fill: '#111827' },
    ],
    timeline: { duration: 6.28, tracks: [] },
    controls: [{ id: 'angle-control', kind: 'slider', propertyId: 'angle', label: 'angle' }],
    checkpoints: [{ id: 'cp-pi', at: 3.14, title: 'Predict the sign', body: 'At pi radians, what is sine?', pause: true, learnerAction: 'answer' }],
    narration: [{ at: 0, text: 'As the angle increases, the point traces the circle.' }, { at: 3.14, text: 'At pi, the sine height is zero.' }],
    fallback: { text: 'A unit circle with a point and a dashed height, beside a sine curve.' },
    accessibility: { alt: 'A point on a unit circle and the corresponding point on a sine wave', reducedMotion: 'static', keyboard: true },
  },
  fallback: 'A unit circle with a point and a dashed height, beside a sine curve. The vertical height is the sine of the angle.',
} as const

const validated = validateSceneSpec(approvedSource.spec)
if (!validated.ok) throw new Error('approved scene is invalid: ' + validated.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; '))
const approvedVisual = visualLintScene(validated.spec)
if (!approvedVisual.ok) throw new Error('approved scene fails visual lint: ' + approvedVisual.diagnostics.filter((entry) => entry.severity === 'error').map((entry) => entry.code).join(', '))

export const APPROVED_SCENES: readonly ApprovedScene[] = [
  { id: approvedSource.id, title: approvedSource.title, spec: validated.spec, fallback: approvedSource.fallback },
]

const APPROVED_KEYS = new Set(APPROVED_SCENES.map((entry) => canonicalSceneKey(entry.spec, entry.fallback)))

/** Normalize and test an exact reviewed content pair. */
export function isApprovedScene(spec: unknown, fallback: string): boolean {
  const result = validateSceneSpec(spec)
  if (!result.ok) return false
  return APPROVED_KEYS.has(canonicalSceneKey(result.spec, fallback))
}

/** The canonical key used by the server digest and the client comparison. */
export function sceneApprovalKey(spec: unknown, fallback: string): string | null {
  const result = validateSceneSpec(spec)
  return result.ok ? canonicalSceneKey(result.spec, fallback) : null
}

export function approvedScenes(): readonly ApprovedScene[] {
  return APPROVED_SCENES
}

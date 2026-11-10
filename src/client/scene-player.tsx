/**
 * Production Scene playback.
 *
 * Only a validated, code-approved, feature-enabled scene renders. The player is
 * presentation state: it never records evidence, advances the lesson, calls the
 * tutor or changes the knowledge map. Every visual is generated from the
 * bounded SceneSpec; no model JavaScript, URL or HTML is executed.
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import type { SceneBlock } from '../lesson.js'
import type { SceneProgress } from '../path.js'
import { isApprovedScene, sceneApprovalKey } from '../scene/approved.js'
import { sceneFingerprint } from '../scene/canonical.js'
import { evaluateNumeric, validateSceneSpec } from '../scene/spec.js'
import { useLang } from './i18n.js'

interface SceneInteraction {
  sceneEnabled?: boolean | undefined
  sceneInitial?: ((blockId: string) => SceneProgress | undefined) | undefined
  sceneProgress?: ((blockId: string, progress: SceneProgress) => void) | undefined
}

interface ScenePlayerProps {
  block: SceneBlock
  interaction?: SceneInteraction | undefined
}

type Primitive = Record<string, any>
type Spec = Record<string, any>

function ease(name: string, x: number): number {
  if (name === 'ease-in') return x * x
  if (name === 'ease-out') return 1 - (1 - x) * (1 - x)
  if (name === 'ease-in-out') return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2
  if (name === 'step') return 0
  return x
}

function interpolate(keyframes: readonly any[], time: number, vars: Record<string, number>): number {
  if (keyframes.length === 0) return 0
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

function trackValue(spec: Spec, primitive: Primitive, key: string, time: number, vars: Record<string, number>): number {
  const track = (spec.timeline.tracks as any[]).find((entry) => entry.target.primitive === primitive.id && entry.target.property === key)
  return track === undefined ? evaluateNumeric(primitive[key], vars) : interpolate(track.keyframes, time, vars)
}

function arrowPoints(x1: number, y1: number, x2: number, y2: number, width: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = Math.max(5, Math.min(18, width * 4))
  const left = angle + Math.PI * 0.85
  const right = angle - Math.PI * 0.85
  return `${x2},${y2} ${x2 + Math.cos(left) * size},${y2 + Math.sin(left) * size} ${x2 + Math.cos(right) * size},${y2 + Math.sin(right) * size}`
}

function attrs(primitive: Primitive): Record<string, unknown> {
  const value: Record<string, unknown> = { key: primitive.id, 'data-scene-primitive': primitive.id }
  if (primitive.fill !== undefined) value.fill = primitive.fill
  if (primitive.stroke !== undefined) value.stroke = primitive.stroke
  if (primitive.strokeWidth !== undefined) value.strokeWidth = primitive.strokeWidth
  if (primitive.opacity !== undefined) value.opacity = primitive.opacity
  if (primitive.dash !== undefined) value.strokeDasharray = primitive.dash
  return value
}

function renderPrimitive(spec: Spec, primitive: Primitive, time: number, vars: Record<string, number>): ReactNode {
  const value = (key: string): number => trackValue(spec, primitive, key, time, vars)
  if (primitive.type === 'text') return createElement('text', { ...attrs(primitive), x: value('x'), y: value('y'), fontSize: value('fontSize'), textAnchor: primitive.anchor ?? 'start', fill: primitive.fill ?? '#111827' }, String(primitive.text))
  if (primitive.type === 'arrow') {
    const x1 = value('x1'); const y1 = value('y1'); const x2 = value('x2'); const y2 = value('y2'); const width = value('strokeWidth')
    return createElement('g', { key: primitive.id, 'data-scene-primitive': primitive.id }, [
      createElement('line', { key: 'line', x1, y1, x2, y2, stroke: primitive.stroke ?? '#2563eb', strokeWidth: width, opacity: value('opacity') }),
      createElement('polygon', { key: 'head', points: arrowPoints(x1, y1, x2, y2, width), fill: primitive.stroke ?? '#2563eb', opacity: value('opacity') }),
    ])
  }
  if (primitive.type === 'rect') return createElement('rect', { ...attrs(primitive), x: value('x'), y: value('y'), width: value('width'), height: value('height'), rx: value('rx'), opacity: value('opacity') })
  if (primitive.type === 'circle') return createElement('circle', { ...attrs(primitive), cx: value('cx'), cy: value('cy'), r: value('r'), opacity: value('opacity') })
  if (primitive.type === 'line') return createElement('line', { ...attrs(primitive), x1: value('x1'), y1: value('y1'), x2: value('x2'), y2: value('y2'), opacity: value('opacity') })
  return createElement('path', { ...attrs(primitive), d: primitive.d, opacity: value('opacity') })
}

function SceneSvg({ spec, time, params }: { spec: Spec; time: number; params: Record<string, number> }): ReactNode {
  const vars = { ...params, t: time, duration: spec.timeline.duration }
  return createElement('svg', { className: 'dt-scene-svg', viewBox: `0 0 ${spec.viewport.width} ${spec.viewport.height}`, role: 'img', 'aria-label': spec.accessibility.alt }, [
    createElement('rect', { key: 'background', x: 0, y: 0, width: spec.viewport.width, height: spec.viewport.height, fill: spec.viewport.background ?? '#ffffff' }),
    ...spec.primitives.map((primitive: Primitive) => renderPrimitive(spec, primitive, time, vars)),
  ])
}

function clampTime(value: number, duration: number): number { return Math.min(duration, Math.max(0, value)) }

export function ScenePlayer({ block, interaction }: ScenePlayerProps): ReactNode {
  const lang = useLang()
  const text = lang === 'zh' ? {
    unavailable: '此动态场景当前不可用，已显示静态解释。', disabled: '动态场景功能未启用，已显示静态解释。',
    play: '播放', pause: '暂停', replay: '重播', back: '后退 0.5 秒', forward: '前进 0.5 秒',
    timeline: '场景时间轴', parameters: '参数', checkpoint: '教学检查点', continue: '继续播放', commentary: '讲解',
    reduced: '已启用减少动态效果，默认暂停，由你控制播放。', scene: '动态场景',
  } : {
    unavailable: 'This interactive scene is unavailable; showing the static explanation.', disabled: 'Dynamic scenes are disabled; showing the static explanation.',
    play: 'Play', pause: 'Pause', replay: 'Replay', back: 'Back 0.5 seconds', forward: 'Forward 0.5 seconds',
    timeline: 'Scene timeline', parameters: 'Parameters', checkpoint: 'Teaching checkpoint', continue: 'Continue', commentary: 'Narration',
    reduced: 'Reduced motion is enabled; playback starts paused and remains under your control.', scene: 'Interactive scene',
  }
  const reducedMotion = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [remoteEnabled, setRemoteEnabled] = useState<boolean | undefined>(interaction?.sceneEnabled)
  const [remoteApproved, setRemoteApproved] = useState<readonly { spec: unknown; fallback: string }[] | undefined>(undefined)
  const validation = useMemo(() => validateSceneSpec(block.content.spec), [block.content.spec])
  const approved = useMemo(() => {
    if (!validation.ok) return false
    if (remoteApproved === undefined) return isApprovedScene(block.content.spec, block.content.fallback)
    const key = sceneApprovalKey(validation.spec, block.content.fallback)
    return key !== null && remoteApproved.some((entry) => sceneApprovalKey(entry.spec, entry.fallback) === key)
  }, [validation, block.content.spec, block.content.fallback, remoteApproved])
  const spec = validation.ok ? validation.spec as Spec : null
  const duration = spec === null ? 0 : Number(spec.timeline.duration)
  const fingerprint = useMemo(() => spec === null ? '' : sceneFingerprint(spec, block.content.fallback), [spec, block.content.fallback])
  const initialProgress = useMemo(() => interaction?.sceneInitial?.(block.id), [interaction, block.id])
  const initialMatches = initialProgress !== undefined && initialProgress.sceneHash === fingerprint
  const initialParams = useMemo(() => {
    const values: Record<string, number> = {}
    for (const property of spec?.properties ?? []) values[property.id] = property.default
    if (initialMatches && initialProgress !== undefined) {
      for (const property of spec?.properties ?? []) {
        const value = initialProgress.params[property.id]
        if (typeof value === 'number' && Number.isFinite(value)) values[property.id] = Math.min(property.max, Math.max(property.min, value))
      }
    }
    return values
  }, [spec, initialMatches, initialProgress])
  const [time, setTime] = useState(initialMatches && initialProgress !== undefined ? clampTime(initialProgress.time, duration) : 0)
  const [playing, setPlaying] = useState(false)
  const [params, setParams] = useState<Record<string, number>>(initialParams)
  const [checkpointId, setCheckpointId] = useState<string | undefined>(initialMatches ? initialProgress?.checkpointId : undefined)
  const [reached, setReached] = useState<readonly string[]>(initialMatches ? initialProgress?.reached ?? [] : [])
  const timeRef = useRef(time)
  const previousTime = useRef(time)
  const lastReport = useRef(0)
  useEffect(() => { timeRef.current = time }, [time])

  const enabled = interaction?.sceneEnabled ?? remoteEnabled
  useEffect(() => {
    if (interaction?.sceneEnabled !== undefined) return
    let cancelled = false
    fetch('/diagnostic-tutor/api/scene-config', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('scene-config')))
      .then((body: any) => {
        if (cancelled) return
        setRemoteEnabled(body?.dynamicScenes?.enabled === true)
        setRemoteApproved(Array.isArray(body?.dynamicScenes?.approved) ? body.dynamicScenes.approved : [])
      })
      .catch(() => { if (!cancelled) setRemoteEnabled(false) })
    return () => { cancelled = true }
  }, [interaction?.sceneEnabled])

  const report = useCallback(() => {
    if (spec === null || interaction?.sceneProgress === undefined) return
    interaction.sceneProgress(block.id, { blockId: block.id, sceneHash: fingerprint, time, params, playing, ...(checkpointId === undefined ? {} : { checkpointId }), reached: [...reached] })
  }, [block.id, checkpointId, fingerprint, interaction, params, playing, reached, spec, time])

  useEffect(() => {
    if (spec === null) return
    const stamp = Date.now()
    if (playing && stamp - lastReport.current < 1000) return
    lastReport.current = stamp
    report()
  }, [time, params, checkpointId, reached, playing, report, spec])

  useEffect(() => {
    if (!playing || !validation.ok) return
    let frame = 0
    const started = performance.now()
    const base = timeRef.current
    const tick = (now: number): void => {
      const next = base + (now - started) / 1000
      if (next >= duration) { setTime(duration); setPlaying(false); return }
      setTime(next)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, duration, validation.ok])

  useEffect(() => {
    if (!playing || spec === null) { previousTime.current = time; return }
    for (const checkpoint of spec.checkpoints ?? []) {
      if (previousTime.current < checkpoint.at && time >= checkpoint.at && !reached.includes(checkpoint.id)) {
        setCheckpointId(checkpoint.id)
        setReached((current) => current.includes(checkpoint.id) ? current : [...current, checkpoint.id])
        setPlaying(false)
        break
      }
    }
    previousTime.current = time
  }, [time, playing, spec, reached])

  if (spec === null) return <div className="dt-scene-fallback" role="note"><p>{text.unavailable}</p><p>{block.content.fallback}</p></div>
  if (enabled === undefined) return <div className="dt-scene-loading" aria-live="polite">…</div>
  if (!enabled) return <div className="dt-scene-fallback" role="note"><p>{text.disabled}</p><p>{block.content.fallback}</p></div>
  if (!approved) return <div className="dt-scene-fallback" role="note"><p>{text.unavailable}</p><p>{block.content.fallback}</p></div>

  const activeCheckpoint = (spec.checkpoints ?? []).find((checkpoint: any) => checkpoint.id === checkpointId)
  const narration = (spec.narration ?? []).filter((cue: any) => cue.at <= time + 1e-6).at(-1)
  const toggle = (): void => { if (playing) setPlaying(false); else { if (time >= duration) setTime(0); setPlaying(true) } }
  const seek = (next: number): void => { setPlaying(false); setTime(clampTime(next, duration)) }
  const continueAfterCheckpoint = (): void => { setCheckpointId(undefined); setPlaying(true) }
  return (
    <div className="dt-scene" data-block-id={block.id}>
      <div className="dt-scene-head"><span className="dt-scene-eyebrow">{text.scene}</span><span className="dt-scene-title">{spec.metadata.title}</span></div>
      <div className="dt-scene-stage"><SceneSvg spec={spec} time={time} params={params} /></div>
      <div className="dt-scene-controls" role="group" aria-label={text.timeline}>
        <button type="button" className="dt-scene-icon" onClick={toggle} aria-pressed={playing} aria-label={playing ? text.pause : text.play}>{playing ? '❚❚' : '▶'}</button>
        <button type="button" className="dt-scene-small" onClick={() => { setPlaying(false); setTime(0) }} aria-label={text.replay}>⟲</button>
        <button type="button" className="dt-scene-small" onClick={() => setTime(clampTime(time - 0.5, duration))} aria-label={text.back}>−0.5s</button>
        <button type="button" className="dt-scene-small" onClick={() => setTime(clampTime(time + 0.5, duration))} aria-label={text.forward}>+0.5s</button>
        <input className="dt-scene-range" type="range" min={0} max={duration} step={0.01} value={time} onChange={(event) => seek(Number(event.target.value))} aria-label={text.timeline} />
        <output className="dt-scene-time">{time.toFixed(2)}s</output>
      </div>
      {(spec.properties ?? []).length > 0 && <div className="dt-scene-params"><span className="dt-scene-label">{text.parameters}</span>{spec.properties.map((property: any) => (
        <label className="dt-scene-param" key={property.id}><span>{property.label}</span><input type="range" min={property.min} max={property.max} step={property.step} value={params[property.id] ?? property.default} onChange={(event) => { const value = Number(event.target.value); setParams((current) => ({ ...current, [property.id]: value })) }} aria-label={property.label} /><output>{Number(params[property.id] ?? property.default).toFixed(2)}{property.unit ?? ''}</output></label>
      ))}</div>}
      <div className="dt-scene-narration" aria-live="polite"><strong>{text.commentary}:</strong> {narration?.text ?? '—'}</div>
      {(spec.checkpoints ?? []).length > 0 && <div className="dt-scene-checkpoints"><span className="dt-scene-label">{text.checkpoint}</span>{(spec.checkpoints as any[]).map((checkpoint) => <button type="button" key={checkpoint.id} className={checkpoint.id === checkpointId ? 'dt-scene-checkpoint is-active' : 'dt-scene-checkpoint'} onClick={() => seek(checkpoint.at)}>{checkpoint.at.toFixed(2)}s · {checkpoint.title}</button>)}</div>}
      {activeCheckpoint !== undefined && <div className="dt-scene-checkpoint-card" role="note"><strong>{activeCheckpoint.title}</strong><p>{activeCheckpoint.body}</p><button type="button" className="dt-scene-small" onClick={continueAfterCheckpoint}>{text.continue}</button></div>}
      {reducedMotion && <p className="dt-scene-reduced-hint">{text.reduced}</p>}
    </div>
  )
}

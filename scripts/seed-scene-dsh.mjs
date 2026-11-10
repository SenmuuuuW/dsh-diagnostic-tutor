/**
 * Developer E2E fixture: seed a course containing the one approved production
 * scene into a DSH storage root. This bypasses the model only to arrange the
 * browser test; it uses the same validated state APIs and approved registry.
 *
 * node scripts/seed-scene-dsh.mjs --root /path/to/storages --session session-...
 */
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as storageJson from '@deepseek-ai/dsh-storage-json'
import * as storageDomain from '@deepseek-ai/dsh-storage-domain'
import { openUdState, newNode } from '../lib/state.js'
import { saveAssessment, saveBrief, proposeCurriculum, acceptCurriculum, beginCourseItem, bindCourseNode, recordCourseTeaching, saveStudyProgress } from '../lib/path-runtime.js'
import { APPROVED_SCENES } from '../lib/scene/approved.js'
import { readFileSync } from 'node:fs'

const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
  if (value.startsWith('--')) all.push([value.slice(2), list[index + 1]])
  return all
}, []))
const root = args.root
const session = args.session
if (!root || !session) throw new Error('usage: --root <storages> --session <sessionId>')

const ctx = new Context()
await ctx.plugin(Storage)
await ctx.plugin(storageJson, { root })
await ctx.plugin(storageDomain, { backend: 'json' })
const state = await openUdState(ctx.get('storageDomain'))
const now = new Date().toISOString()
const course = 'scene-demo'
const node = 'scene-demo:unit-circle'
await state.writeCourse({ id: course, title: 'Interactive scenes', goal: 'See the unit circle and sine together.', status: 'active', createdAt: now, updatedAt: now })
await state.writeNode(newNode({ id: `${course}:goal`, courseId: course, title: 'Interactive scenes', relation: 'goal', now }))
await state.writeNode(newNode({ id: node, courseId: course, title: 'Unit circle and sine', relation: 'part-of', parentId: `${course}:goal`, now,
  evidence: [{ kind: 'diagnosis', at: now, note: 'Can name sine as a ratio but has not connected it to circular motion.' }] }))
await state.selectProject(session, course, now)
const brief = {
  purpose: 'Connect circular motion to the sine function.',
  outcomes: ['Explain why the vertical coordinate of a unit-circle point is sine.'],
  background: 'Knows right-triangle ratios.',
  timeZone: 'America/New_York', targetDate: null, durationWeeks: 1, deadline: 'flexible',
  weeklyMinutes: 30, sessionMinutes: 15, preferences: 'Use a visual scene.',
}
const saved = await saveBrief(state, course, session, 0, brief)
const assessment = {
  status: 'ready', summary: 'Ratio knowledge is present; the circular interpretation is the gap.',
  strengths: ['Knows sine as opposite over hypotenuse.'], gaps: ['Has not linked circular motion to sine.'],
  uncertainties: ['Transfer to non-right triangles.'], evidence: [{ nodeId: node, evidenceIndex: 0 }],
  briefRevision: saved.briefRevision, sessionId: session, updatedAt: now,
}
const assessed = await saveAssessment(state, course, session, saved.revision, assessment)
const curriculum = {
  title: 'One visual bridge', summary: 'Use the unit circle to make the sine height visible.',
  modules: [{ id: 'trig', title: 'Unit circle', overview: 'Connect angle, point and height.', outcomes: ['Explain sine as a height.'], milestone: 'Explain the mapping.' }],
  items: [{ id: 'unit-circle', moduleId: 'trig', title: 'Unit circle and sine', overview: 'Connect the circle point to the sine height.',
    outcomes: ['Explain why the y-coordinate equals sine.'], outline: ['Orient', 'Trace', 'Predict', 'Check'], topics: ['unit circle', 'sine'],
    nodeIds: [node], practice: 'Predict the height at pi.', assessment: 'Explain a new angle.', minutes: { min: 10, max: 20 } }],
  edges: [], assumptions: ['Background is self-reported.'], changeReason: 'Initial assessment.',
}
const proposed = await proposeCurriculum(state, course, session, assessed.revision, curriculum)
await acceptCurriculum(state, course, session, proposed.revision, 1)
const started = await beginCourseItem(state, { courseId: course, sessionId: session, expectedRevision: state.readPath(course).revision, version: 1, itemId: 'unit-circle', operationId: 'seed-scene-e2e' })
const attempt = started.attempt
await bindCourseNode(state, course, session, attempt.id, node)
const sceneFile = args.scene
const approved = sceneFile ? (() => { const raw = JSON.parse(readFileSync(sceneFile, 'utf8')); const spec = raw.spec ?? raw; const fallback = raw.fallback?.text ?? raw.fallback; if (typeof fallback !== 'string') throw new Error('scene file must contain a fallback string'); return { id: raw.id ?? 'local-scene', spec, fallback } })() : APPROVED_SCENES[0]
const lesson = {
  id: `${node}:lesson`, courseId: course, nodeId: node, title: 'Unit circle and sine', origin: 'tutor', createdAt: now, updatedAt: now,
  blocks: [
    { id: 'scene-unit', type: 'scene', content: { sceneVersion: '1', spec: approved.spec, fallback: approved.fallback } },
    { id: 'after-scene', type: 'text', content: { md: 'The vertical coordinate is the sine. Continue when you can explain why.' } },
    { id: 'scene-quiz', type: 'quiz', content: { title: 'Check the idea', questions: [{ id: 'q1', kind: 'mcq', prompt: 'At the point where the tangent is horizontal, what is the angle of the radius?', options: ['0 or 180 degrees', '90 degrees', '45 degrees'] }] } },
  ],
}
await recordCourseTeaching(state, course, session, attempt.id, lesson)
await saveStudyProgress(state, { courseId: course, sessionId: session, attemptId: attempt.id,
  progress: { blockId: 'scene-unit', stepIndex: 0, scrollRatio: 0, fullscreen: false, finished: false,
    scenes: { 'scene-unit': { blockId: 'scene-unit', sceneHash: 'seed-placeholder', time: 2.4, params: { angle: 2 }, playing: true, reached: [] } } } })
await state.close()
console.log(JSON.stringify({ ok: true, root, session, course, attemptId: attempt.id, node, block: 'scene-unit' }))

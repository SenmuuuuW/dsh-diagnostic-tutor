/** v4 prompt generated from the Canonical SceneSpec Contract. */
import { contractSummary } from '../../../src/scene/contract.js'

function publicCase(caseEntry) {
  const { semantic, ...publicFields } = caseEntry
  return publicFields
}

export function v4BatchPrompt(cases, folder) {
  return `You are the teaching designer in a research benchmark. For each case, FIRST decide whether an interactive visual Scene genuinely helps. Do not force animation onto every topic.

For EACH case, write exactly one:
A) /tmp/udt-scene-v4/${folder}/<id>.decision.json:
   {"needsScene":false,"reason":"why static/text is better for this learning objective","staticAlternative":"a concrete non-animated teaching move"}
   Do NOT write a scene for that case.
B) /tmp/udt-scene-v4/${folder}/<id>.plan.json and <id>.scene.json if a visual scene genuinely helps.

CANONICAL CONTRACT:
${contractSummary()}

STRICT ADDITIONAL RULES:
- Use exactly the canonical field names. Do NOT use textAnchor; use anchor.
- properties may be omitted or []; metadata.topic may be used; do not invent other metadata keys.
- Every visible primitive must explicitly declare fill and stroke. A line/arrow must have a visible non-none stroke. A filled shape must have a non-none fill or a visible stroke. Text must have an explicit fill.
- Use dark strokes (#111827/#1d4ed8/#dc2626) on a white or near-white background; keep labels inside the viewport; avoid overlapping labels.
- For algorithms use at most 12 named states with states/stateTimeline; otherwise keep <=16 primitives.
- Timeline track keyframes use "at", never "t"; target is an object.
- Numeric fields are numbers or {"expr":"..."}; expressions use declared property ids + t + duration only.
- checkpoints learnerAction, if present, is exactly "continue" or "answer".
- Include fallback {text} and accessibility {alt,reducedMotion,keyboard:true}.
- No JavaScript, HTML, CSS, URLs, images, event handlers, foreignObject, loops, or extra keys.
- The scene must be conceptually faithful to the case, not just visually attractive.

After all files, reply "saved ${folder}".

CASES:
${JSON.stringify(cases.map(publicCase), null, 2)}`
}

export function v4RepairPrompt(caseId, errors, folder = 'sealed') {
  return `Repair only this artifact in place: /tmp/udt-scene-v4/${folder}/${caseId}.scene.json

Do not rewrite unrelated content. Fix the structured errors below. Preserve the teaching objective. For expression or semantic errors, re-derive the relationship instead of guessing. Never change an approved reference value. Never add JavaScript, HTML, CSS, URLs, images or event handlers.

${contractSummary()}

STRUCTURED ERRORS:
${JSON.stringify(errors, null, 2)}

Reply "repaired ${caseId}" after writing the whole corrected JSON.`
}

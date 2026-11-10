/** Generation v2 prompts: plan first, then a bounded SceneSpec; repairs get exact deltas. */
export function planPrompt(caseRecord) {
  return `You are planning one interactive teaching scene for a research benchmark. Do not write the scene yet.

Return ONLY a compact JSON plan with keys:
{"representation":"one sentence","entities":["..."],"motion":["..."],"controls":["..."],"checkpoints":["..."],"misconceptionTest":"how the scene confronts one misconception","accessibility":"keyboard/alt/reduced-motion plan"}

The plan must be teachable with SVG shapes, lines, paths, text, finite keyframes, numeric sliders, checkpoints and narration. No JavaScript, HTML, CSS, images, URLs or external resources. For an algorithm with discrete states, plan named state snapshots rather than arbitrary code.

CASE:
${JSON.stringify(caseRecord, null, 2)}`
}

export function scenePromptV2(caseRecord, plan) {
  return `Build ONE SceneSpec v0 for the case below. First use the plan; do not change the learning objective.

Return ONLY valid JSON (write it with the write tool to /tmp/udt-scene-v2/<id>.json). The JSON must follow this exact contract:

- top-level keys ONLY: version, viewport, metadata, properties, primitives, timeline, controls, checkpoints, narration, states?, stateTimeline?, fallback, accessibility, sourceRefs?
- version must be "0.1".
- every primitive has a unique string id and type rect|circle|line|path|text|arrow, plus all required numeric fields.
- numeric fields are numbers OR {"expr":"..."}; NEVER bare expression strings. Expressions use property ids + t + duration only; safe functions only.
- timeline: {duration:number, tracks:[{target:{primitive:"id",property:"numericProperty"},keyframes:[{at:number,value:number-or-expr,easing?:string}]}]}. Use "at", NEVER "t"; target is an object, NEVER a string.
- properties: [{id,label,min,max,step,default,unit?}] max 4.
- controls: [{id,kind:"slider",propertyId,label?}] or omit.
- checkpoints: [{id,at,title,body,pause:boolean,learnerAction?}] with at inside duration. learnerAction, if present, must be exactly "continue" or "answer"; put instructions in body.
- narration: [{at,text}].
- states: optional array [{id,label,overrides:[{primitive:"id",property:"numericProperty-or-text",value:number-or-short-string}]}].
- stateTimeline: optional array [{at,state:"stateId"}] sorted, at inside duration.
- fallback: {text:"static explanation"} required.
- accessibility: {alt:"<=240 chars",reducedMotion:"static"|"no-autoplay",keyboard:true} required.
- sourceRefs: omit or [] for this benchmark.
- Keep <=18 primitives, <=2 properties, <=6 checkpoints. No extra keys. No invalid colors, path tags, event handlers, URLs, loops, or executable content.

For algorithms with discrete steps, prefer named states + stateTimeline over a fake numeric graph. For continuous relationships, use numeric properties and expressions.

PLAN:
${JSON.stringify(plan, null, 2)}

CASE:
${JSON.stringify(caseRecord, null, 2)}

Write the final JSON to /tmp/udt-scene-v2/${caseRecord.id}.json and reply "saved ${caseRecord.id}".`
}

export function repairPromptV2(caseId, errors) {
  return `The SceneSpec file /tmp/udt-scene-v2/${caseId}.json failed strict validation. Repair it in place using the write tool.

Errors:
${errors.map((entry) => `- ${entry.path}: ${entry.message} [${entry.code}]`).join('\n')}

Keep the learning goal and visual design. Do not add arbitrary code, HTML, URLs or event handlers. Return only the corrected JSON object, and reply "repaired ${caseId}".`
}

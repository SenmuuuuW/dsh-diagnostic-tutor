/** Generation v3: decide whether a visual scene helps, then plan and write one. */
export function blindBatchPrompt(cases, folder) {
  return `You are the teaching designer in a research benchmark. For each case, FIRST decide whether an interactive visual Scene is actually the right teaching medium. Do not force animation onto every topic.

For EACH case, write exactly one of:
A) /tmp/udt-scene-v3/${folder}/<id>.decision.json with:
   {"needsScene":false,"reason":"why static/text is better for this learning objective","staticAlternative":"a concrete non-animated teaching move"}
   Do NOT write a scene file for that case.
B) /tmp/udt-scene-v3/${folder}/<id>.plan.json and <id>.scene.json if a visual scene genuinely helps.

SHARED SCENE CONTRACT (only for B):
- version "0.1"; viewport {width:number,height:number,background:"#rrggbb"}.
- metadata {title,subject,objective,learner,misconceptions?:[],expectedUnderstanding?:[]}.
- primitives: unique id, type rect|circle|line|path|text|arrow. Text uses fields x,y,text,fontSize,fill,anchor (NOT textAnchor). The top-level properties array is REQUIRED, use [] when there are no sliders.
- Text uses fields x,y,text,fontSize,fill,anchor (NOT textAnchor).
- EVERY visible primitive must explicitly declare fill and stroke. Use fill:"none" for a line path. A line/arrow must have a visible non-none stroke. A filled shape must have a non-none fill or a visible stroke. Text must have an explicit fill. Never rely on SVG's default black fill.
- Use dark stroke (#111827/#1d4ed8/#dc2626) on a white or near-white background; keep all key labels inside the viewport; avoid overlapping labels. Do not use a light color as the only signal.
- Numeric fields: numbers OR {"expr":"..."} (never bare expression strings). Expressions use declared property ids + t + duration only.
- timeline {duration:0.5..120, tracks:[{target:{primitive:"id",property:"numericProperty"},keyframes:[{at:number,value:number-or-expr,easing:"linear"|"ease-in"|"ease-out"|"ease-in-out"|"step"}]}]}; use "at", never "t"; target is an object.
- properties is a required array, max 4; controls optional; checkpoints [{id,at,title,body,pause:boolean,learnerAction?}] where learnerAction if present is exactly "continue"|"answer"; narration [{at,text}].
- For discrete algorithms, use at most 12 named states with states and stateTimeline and primitive property overrides. Do not invent a command language.
- fallback {text:"static explanation"} and accessibility {alt:"<=240 chars",reducedMotion:"static"|"no-autoplay",keyboard:true} required.
- no JavaScript, HTML, CSS, URLs, images, event handlers, foreignObject, loops, or extra keys. Keep <=16 primitives.

After all files, reply "saved ${folder}".

CASES:
${JSON.stringify(cases, null, 2)}`
}

export function repairV3Prompt(caseId, errors) {
  return `The artifact for ${caseId} failed Schema or Visual Quality validation. Repair only the artifact in place with the write tool.

Errors:
${errors.map((entry) => `- ${entry}`).join('\n')}

If a scene is appropriate, keep its teaching idea and fix the named fields; do not randomly rewrite everything. Every primitive must explicitly style fill/stroke. If the visual approach is irreparably wrong, you may replace the scene, but keep the decision honest. Do not add code, HTML, URLs or event handlers.`
}

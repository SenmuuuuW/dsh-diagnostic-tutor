/** Real-model v2 batch prompt: plan, then a contract-complete SceneSpec. */
export function batchPrompt(cases, folder) {
  return `You are generating SceneSpec v0 research scenes. Work case by case, compactly, and use the write tool. Do NOT write helper scripts or SVG files.

For EACH case:
1. Write a small plan JSON to /tmp/udt-scene-v2/${folder}/<id>.plan.json with keys representation, entities, motion, controls, checkpoints, misconceptionTest, accessibility.
2. Write the final SceneSpec to /tmp/udt-scene-v2/${folder}/<id>.scene.json following the exact contract below.

CONTRACT (must match exactly):
- top-level keys ONLY: version, viewport, metadata, properties, primitives, timeline, controls, checkpoints, narration, states?, stateTimeline?, fallback, accessibility, sourceRefs?
- version exactly "0.1".
- viewport {width:number,height:number,background?}.
- metadata {title,subject,objective,learner,misconceptions?:string[],expectedUnderstanding?:string[]}.
- every primitive: unique id, type rect|circle|line|path|text|arrow, and required numeric fields. Numeric values are numbers OR {"expr":"..."}; never bare expression strings. Expressions may use declared property ids + t + duration and safe functions only.
- timeline {duration:number 0.5..120, tracks:[{target:{primitive:"id",property:"numericProperty"},keyframes:[{at:number,value:number-or-expr,easing?:'linear'|'ease-in'|'ease-out'|'ease-in-out'|'step'}]}]}. Use "at", never "t"; target is an object; easing must be one of those exact strings.
- properties max 4: {id,label,min,max,step,default,unit?}; controls optional [{id,kind:"slider",propertyId,label?}].
- checkpoints [{id,at,title,body,pause:boolean,learnerAction?}] with at within duration; narration [{at,text}]. 'learnerAction' is optional and, when present, MUST be exactly "continue" or "answer"; put any teaching instruction in 'body', never in 'learnerAction'.
- Use at most 12 named states and 120 total state overrides. For discrete algorithm states use ONLY optional states [{id,label,overrides:[{primitive:"id",property:"numericProperty-or-text",value:number-or-short-string}]}] and stateTimeline [{at,state:"id"}]. Do not invent a state-machine command language.
- fallback {text:"static explanation"} and accessibility {alt:"<=240 chars",reducedMotion:"static"|"no-autoplay",keyboard:true} are required.
- no JavaScript, HTML, CSS, URLs, images, event handlers, loops, foreignObject or extra keys.
- Keep each scene <=16 primitives and <=2 properties.

After all files are written, reply "saved ${folder}".

CASES:
${JSON.stringify(cases, null, 2)}`
}

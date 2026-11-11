/** Strategy C: three small schema-shaped stages instead of one large SceneSpec. */
import { contractSummary } from '../../../src/scene/contract.js'

function publicCase(entry) { const { semantic, ...rest } = entry; return rest }

export function stage1Prompt(cases, folder) {
  return `You are designing a teaching scene in three stages. STAGE 1: decide and write the scene's outer contract.

For every case write exactly one JSON file:
- /tmp/udt-scene-v11/${folder}/<id>.stage1.json for a scene:
{
  "needsScene": true,
  "metadata": {"title":"...","subject":"...","topic":"...","objective":"...","learner":"...","misconceptions":["..."],"expectedUnderstanding":["..."]},
  "viewport": {"width":960,"height":540,"background":"#ffffff"},
  "properties": [{"id":"angle","label":"angle","min":0,"max":6.283,"step":0.01,"default":0.8,"unit":"rad"}],
  "fallback": {"text":"static explanation"},
  "accessibility": {"alt":"<=300 chars","reducedMotion":"static","keyboard":true}
}
- /tmp/udt-scene-v11/${folder}/<id>.decision.json for no scene:
{"needsScene":false,"reason":"why animation/text is not the right medium","staticAlternative":"a concrete non-animated move"}

Do not write primitives or timeline yet. Do not use textAnchor. properties may be [].
Cases:
${JSON.stringify(cases.map(publicCase), null, 2)}`
}

export function stage2Prompt(ids, folder) {
  return `STAGE 2: write only the primitives array for each scene. File:
/tmp/udt-scene-v11/${folder}/<id>.stage2.json
Shape: {"primitives":[{"id":"p1","type":"circle","cx":100,"cy":100,"r":40,"fill":"none","stroke":"#1d4ed8","strokeWidth":2}, ...]}
Rules:
- unique ids; types rect|circle|line|path|text|arrow.
- explicit fill and stroke on every visible primitive; line/arrow must have a visible stroke; text must have fill; path fill:"none" unless intentionally filled.
- text uses x,y,text,fontSize,fill,anchor (start|middle|end), NOT textAnchor.
- numeric fields are numbers or {"expr":"..."}; expressions use declared property ids + t + duration only.
- keep labels in the viewport and avoid overlaps; 1..16 primitives; no extra keys.
- Each primitive should be complete on its own; use the canonical primitive fields:
${contractSummary()}
Scene ids: ${ids.join(', ')}`
}

export function stage3Prompt(ids, folder) {
  return `STAGE 3: write only timeline, controls, checkpoints and narration. File:
/tmp/udt-scene-v11/${folder}/<id>.stage3.json
Shape: {"timeline":{"duration":6,"tracks":[{"target":{"primitive":"p1","property":"cy"},"keyframes":[{"at":0,"value":100,"easing":"linear"}]}]},"controls":[{"id":"c1","kind":"slider","propertyId":"angle","label":"angle"}],"checkpoints":[{"id":"cp1","at":3,"title":"Predict","body":"What happens?","pause":true,"learnerAction":"answer"}],"narration":[{"at":0,"text":"..."}]}
Rules:
- target MUST be {"primitive":"existing id","property":"numeric property"} (never field/t).
- keyframes use "at", value number or {"expr":...}, easing linear|ease-in|ease-out|ease-in-out|step.
- controls: propertyId must reference a declared property; no 'property' key.
- checkpoints: id/title/body/pause required; learnerAction exactly continue|answer.
- no extra keys. Scene ids: ${ids.join(', ')}`
}

export function stageRepairPrompt(id, stage, errors, folder) {
  return `Repair only /tmp/udt-scene-v11/${folder}/${id}.${stage}.json. Fix these structured errors; preserve the teaching idea. Do not add JavaScript, HTML, CSS, URLs or event handlers. If the error cannot be fixed safely, keep the honest artifact and explain in the file only if it has a reason field.

${contractSummary()}

ERRORS:
${JSON.stringify(errors, null, 2)}`
}

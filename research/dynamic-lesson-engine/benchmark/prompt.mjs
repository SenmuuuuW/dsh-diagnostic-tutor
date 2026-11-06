export function scenePrompt(caseRecord) {
  return `You are participating in a v0.7 research spike on AI-generated teaching scenes. Design ONE SceneSpec v0 for the learning case below.

Read the schema at /Users/sunjungong/Documents/DSH/dsh-diagnostic-tutor/research/dynamic-lesson-engine/SCHEMA.md and inspect examples only if useful. The scene must be safe declarative JSON; no JavaScript, HTML, CSS, external URLs, event handlers, or images. Use only the documented primitives, bounded expressions, timeline, controls, checkpoints and narration. Let your teaching judgment decide the visual representation; do not force a fixed diagram.

Use the write tool to save ONLY the JSON object (no markdown, no commentary) to /tmp/udt-scene-bench/${caseRecord.id}.json, then reply with "saved ${caseRecord.id}".

CASE:
${JSON.stringify(caseRecord, null, 2)}`
}

export function repairPrompt(caseId, errors) {
  return `The SceneSpec you wrote to /tmp/udt-scene-bench/${caseId}.json failed validation. Repair it in place with the write tool.

Validation errors:
${errors.map((entry) => `- ${entry.path}: ${entry.message} [${entry.code}]`).join('\n')}

Keep the same learning case. Return only the corrected JSON object in the file; no markdown or commentary. Do not add unsupported fields or any executable content. Reply "repaired ${caseId}".`
}

export const SCENE_SPEC_VERSION: string
export const GENERATOR_CONTRACT_VERSION: string
export const RESEARCH_SCHEMA_VERSION: string
export const TOP_LEVEL_FIELDS: readonly string[]
export const METADATA_FIELDS: readonly string[]
export const DEPRECATED_ALIASES: Readonly<Record<string, string>>
export const NORMALIZATION_RULES: readonly { from: string; to: string; reason: string; countedAs: string }[]
export function contractSummary(): string
export function normalizeSceneSpec(raw: unknown): { spec: unknown; changes: { path: string; from: string; to: string }[] }

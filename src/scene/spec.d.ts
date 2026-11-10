/** Production copy of the bounded SceneSpec v0 validator (JS implementation). */
export const SCENE_SPEC_VERSION: string
export const LIMITS: Record<string, unknown>
export interface SceneValidationError { path: string; code: string; message: string }
export interface SceneValidationOk { ok: true; spec: any; errors: [] }
export interface SceneValidationFail { ok: false; errors: SceneValidationError[] }
export type SceneValidation = SceneValidationOk | SceneValidationFail
export type CompiledExpression = { ok: true; variables: string[]; evaluate(vars: Record<string, number>): number } | { ok: false; error: string }
export function compileExpression(source: string, allowedVariables?: string[]): CompiledExpression
export function validateSceneSpec(raw: unknown): SceneValidation
export function formatValidationErrors(errors: readonly SceneValidationError[]): string
export function evaluateNumeric(value: unknown, vars: Record<string, number>): number
export const EASINGS: Set<string>
export const FUNCTIONS: Record<string, unknown>
export const NUMERIC_PROPS: Record<string, readonly string[]>
export const PRIMITIVE_TYPES: Set<string>

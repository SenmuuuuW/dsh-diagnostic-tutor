export interface VisualDiagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  primitiveId: string | null
  propertyPath: string | null
  message: string
  suggestedFix: string | null
  context: unknown
}
export interface VisualLintResult {
  ok: boolean
  diagnostics: VisualDiagnostic[]
  stats: { primitiveCount: number; frames: number; errors?: number; warnings?: number }
}
export function visualLintScene(spec: unknown, options?: { validate?: (spec: unknown) => any }): VisualLintResult
export function parseColor(value: string): [number, number, number, number] | null
export function contrast(a: [number, number, number, number], b: [number, number, number, number]): number

/**
 * Turn provider errors into an actionable category for the learner.
 *
 * A raw provider message ("403 insufficient balance", "429", "invalid api
 * key") is truthful but unhelpful. The classifier only reads the message; the
 * localized advice lives in path-text so both languages stay together.
 */

/** The failure buckets the route page can explain. */
export type TutorErrorKind = 'billing' | 'auth' | 'rate-limit' | 'network' | 'context' | 'other'

const PATTERNS: readonly { kind: TutorErrorKind; pattern: RegExp }[] = [
  { kind: 'billing', pattern: /insufficient balance|billing|payment required|quota exceeded|credit/i },
  { kind: 'auth', pattern: /invalid api key|unauthorized|authentication|invalid token|401|403|forbidden|permission denied|sign in|sign-in/i },
  { kind: 'rate-limit', pattern: /rate limit|rate-limit|429|too many requests|overloaded/i },
  { kind: 'network', pattern: /network|fetch failed|econn|etimedout|timed out|timeout|connection|dns|socket/i },
  { kind: 'context', pattern: /context overflow|context length|token limit|too long|maximum context|compaction/i },
]

/**
 * Classify one raw tutor-turn error.
 *
 * @param raw - provider error message as recorded.
 * @returns the most specific bucket, or `other`.
 */
export function classifyTutorError(raw: string): TutorErrorKind {
  for (const entry of PATTERNS) if (entry.pattern.test(raw)) return entry.kind
  return 'other'
}

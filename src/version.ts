/** The installed plugin version, read once from its own package.json. */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let cached: string | undefined

/**
 * Read the package version.
 *
 * The journal and diagnostics report it, so a support report says which build
 * produced the events. Failure is not worth an error: diagnostics can say
 * "unknown".
 *
 * @returns the version string, or `"unknown"`.
 */
export function packageVersion(): string {
  if (cached !== undefined) return cached
  try {
    const parsed = require('../package.json') as { version?: unknown }
    cached = typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    cached = 'unknown'
  }
  return cached
}

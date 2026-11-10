/**
 * Stable text identity for a validated scene. This is a structural key, not a
 * security primitive: the authoritative approval set is compiled into the
 * runtime and every candidate is validated before the key is compared.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function canonicalSceneKey(spec: unknown, fallback: string): string {
  return canonicalJson({ fallback, spec })
}

/** Non-cryptographic fingerprint used only to invalidate stale Study positions. */
export function sceneFingerprint(spec: unknown, fallback: string): string {
  const source = canonicalSceneKey(spec, fallback)
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index))
    hash = (hash * prime) & 0xffffffffffffffffn
  }
  return `fnv1a64-${hash.toString(16).padStart(16, '0')}`
}

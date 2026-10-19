/**
 * Interface language for this plugin's browser surfaces.
 *
 * The learner's choice is stored in two places, for two different reasons:
 *
 *   - the host's learner profile (`preferredLanguage`), because that is the
 *     preference that survives a restart and follows the learner across
 *     conversations and profiles; and
 *   - `localStorage`, so the very first render after a reload does not flash
 *     English while the preference request is in flight.
 *
 * The host is authoritative. A stored local value is only a starting guess;
 * `hydrateLanguage()` replaces it as soon as the host answers. A failed request
 * keeps the local choice — the UI never flips back because the network did.
 *
 * No DSH internals are reached into here: this is a browser-side preference for
 * the plugin's own copy. It does not translate the harness, the model's
 * teaching, or the learner's own content.
 */

import { useSyncExternalStore } from 'react'

/** The languages this build ships copy for. */
export type Lang = 'en' | 'zh'

/** Route prefix owned by this plugin; must match the host's `API_PREFIX`. */
const BASE = '/diagnostic-tutor/api'

/** Where the fallback copy lives. Namespaced so another plugin cannot collide. */
export const STORAGE_KEY = 'dsh-diagnostic-tutor.language'

/** Narrow an arbitrary stored/response value to a language we render. */
function asLang(value: unknown): Lang | null {
  return value === 'en' || value === 'zh' ? value : null
}

/** The saved local choice, when there is one and storage is reachable. */
function storedLang(): Lang | null {
  try {
    return asLang(globalThis.localStorage?.getItem(STORAGE_KEY))
  } catch {
    // Private modes and sandboxed frames can throw on access; the preference is
    // a convenience, never a requirement.
    return null
  }
}

/**
 * A first guess before the host is asked.
 *
 * Chinese is selected only for a Chinese browser/UI locale; everything else
 * starts in English, which is the language every surface already shipped in.
 * The learner can always change it with the toggle.
 */
function detectedLang(): Lang {
  const tags = [globalThis.navigator?.language ?? '', globalThis.document?.documentElement?.lang ?? '']
  return tags.some((tag) => /^zh/i.test(tag)) ? 'zh' : 'en'
}

let current: Lang = storedLang() ?? detectedLang()

/**
 * Whether a real DSH host is behind this page.
 *
 * Only the plugin's `apply()` turns this on, so the preview, tests and any
 * embedded surface that renders components directly never make a request they
 * cannot satisfy — and the fixture harness's "no learner-data request" check
 * stays honest.
 */
let hostPersistence = false

/** Enable saving the preference to the host. Called once by the real client. */
export function enableLanguagePersistence(): void {
  hostPersistence = true
}

/**
 * Whether the learner chose a language in this page session.
 *
 * A slow preference read must not overwrite a click that happened while it was
 * in flight: the learner's latest explicit action wins over the stored value.
 */
let userChoice = false

/** Everything that renders copy subscribes to this set. */
const listeners = new Set<() => void>()

function announce(): void {
  for (const listener of listeners) listener()
}

/** Apply a language without persisting it (used for the host's saved value). */
function adopt(lang: Lang): void {
  if (lang === current) return
  current = lang
  announce()
}

/** Remember locally, then tell the host — never blocking the UI on either. */
function persist(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang)
  } catch {
    // Best effort only, same reasoning as `storedLang`.
  }
  if (!hostPersistence) return
  try {
    void fetch(`${BASE}/preferences/language`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {
      // The local choice still stands; the next toggle will try again.
    })
  } catch {
    // A missing `fetch` (tests, exotic frames) is not a reason to lose the choice.
  }
}

/** The language the plugin is rendering in. */
export function getLang(): Lang {
  return current
}

/**
 * Change the interface language.
 *
 * Applied immediately so the button responds on the same click, then saved.
 *
 * @param lang - the language to switch to.
 */
export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  userChoice = true
  announce()
  persist(lang)
}

/** Subscribe to changes. Exported for `useSyncExternalStore` callers and tests. */
export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current language as React state. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang)
}

/**
 * Read the learner's saved preference from the host.
 *
 * Called once when the real client plugin loads, never from the preview or from
 * tests — those mount components directly and have no host to ask. A failure,
 * an older host without the route, or an unrecognised value leaves the
 * detected/local guess in place.
 */
export async function hydrateLanguage(): Promise<void> {
  try {
    const response = await fetch(`${BASE}/preferences`, { headers: { accept: 'application/json' } })
    if (!response.ok) return
    const body = (await response.json()) as { ok?: unknown; language?: unknown }
    if (body !== null && typeof body === 'object' && body.ok === false) return
    const language = asLang(body?.language)
    // The learner's own click while this was in flight outranks the stored value.
    if (language !== null && !userChoice) adopt(language)
  } catch {
    // No host, no problem: the UI keeps working in the detected language.
  }
}

/** Test seam: restore a clean store between cases. */
export function resetLanguageForTests(): void {
  current = 'en'
  hostPersistence = false
  userChoice = false
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean if storage was never reachable.
  }
  announce()
}

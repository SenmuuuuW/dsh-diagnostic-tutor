// @vitest-environment jsdom
/**
 * The interface-language store and its toggle.
 *
 * Two promises matter here, and both are about not losing the learner's choice:
 * the toggle applies immediately (no round trip before the copy changes), and
 * the saved preference is restored on the next page load. The host request is a
 * persistence detail — a failed one keeps the local choice, and an old host
 * without the route must not break the UI.
 */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LanguageToggle } from '../src/client/language-toggle.js'
import {
  enableLanguagePersistence,
  getLang,
  hydrateLanguage,
  resetLanguageForTests,
  setLang,
  STORAGE_KEY,
} from '../src/client/i18n.js'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PREFERENCES = '/diagnostic-tutor/api/preferences'

/** A fetch response good enough for `hydrateLanguage`. */
function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('interface language', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    resetLanguageForTests()
    fetchMock = vi.fn().mockResolvedValue(response({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    resetLanguageForTests()
    vi.unstubAllGlobals()
  })

  it('starts in English when nothing is saved', () => {
    expect(getLang()).toBe('en')
  })

  it('keeps the choice local until a real host enables persistence', () => {
    setLang('zh')

    expect(getLang()).toBe('zh')
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('zh')
    // The preview and tests mount components without a host; they must not call
    // an API that does not exist there.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies a change immediately, remembers it locally, and saves it on the host', () => {
    enableLanguagePersistence()
    setLang('zh')

    expect(getLang()).toBe('zh')
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('zh')
    expect(fetchMock).toHaveBeenCalledWith(
      `${PREFERENCES}/language`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ language: 'zh' }),
      }),
    )
  })

  it('does not call the host when the language does not change', () => {
    enableLanguagePersistence()
    setLang('en')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adopts the host preference without writing it back', async () => {
    enableLanguagePersistence()
    fetchMock.mockResolvedValueOnce(response({ ok: true, language: 'zh' }))
    await hydrateLanguage()

    expect(getLang()).toBe('zh')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(PREFERENCES, expect.anything())
  })

  it('keeps the local choice when the host is unavailable or answers nonsense', async () => {
    enableLanguagePersistence()
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await hydrateLanguage()
    expect(getLang()).toBe('en')

    fetchMock.mockResolvedValueOnce(response({ ok: false, error: { code: 'forbidden' } }))
    await hydrateLanguage()
    expect(getLang()).toBe('en')

    fetchMock.mockResolvedValueOnce(response({ ok: true, language: 'klingon' }))
    await hydrateLanguage()
    expect(getLang()).toBe('en')
  })

  it('lets a click made while the preference is loading win over the stored value', async () => {
    enableLanguagePersistence()
    let resolvePreferences: (value: Response) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { resolvePreferences = resolve }))
    const pending = hydrateLanguage()

    // The learner acts before the host answers.
    setLang('zh')
    resolvePreferences(response({ ok: true, language: 'en' }))
    await pending

    expect(getLang()).toBe('zh')
    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toBe('zh')
  })

  it('labels the toggle with the language it switches to, and flips it on click', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)

    act(() => {
      root.render(createElement(LanguageToggle))
    })
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('中文')
    expect(button?.getAttribute('aria-label')).toBe('Switch to Chinese')

    act(() => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(getLang()).toBe('zh')
    expect(container.querySelector('button')?.textContent).toBe('EN')
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Switch to English')

    act(() => {
      root.unmount()
    })
    container.remove()
  })
})

/**
 * The language switch.
 *
 * Shows the *other* language, because that is what pressing it does: a button
 * labelled with the language you are already reading is a label, not a control.
 * The accessible name states both the action and the destination, so a screen
 * reader hears "switch to Chinese" rather than "中文".
 *
 * The two languages are written in themselves (`中文`, `EN`) rather than
 * translated — a learner who cannot read the current interface still recognises
 * the name of their own language.
 */

import type { ReactNode } from 'react'

import { setLang, useLang } from './i18n.js'

/** Props let the header that hosts it adjust the surrounding rhythm. */
export interface LanguageToggleProps {
  /** Extra class for the hosting header's own layout. */
  className?: string | undefined
}

/**
 * Render the toggle.
 *
 * @param props - optional extra class.
 * @returns a button that flips the interface language.
 */
export function LanguageToggle({ className }: LanguageToggleProps): ReactNode {
  const lang = useLang()
  const next = lang === 'zh' ? 'en' : 'zh'
  const classes = ['dt-lang-toggle', className].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={classes}
      data-lang={lang}
      aria-label={next === 'zh' ? 'Switch to Chinese' : 'Switch to English'}
      title={next === 'zh' ? 'Switch to Chinese' : 'Switch to English'}
      onClick={() => setLang(next)}
    >
      {next === 'zh' ? '中文' : 'EN'}
    </button>
  )
}

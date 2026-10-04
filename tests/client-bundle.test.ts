// @vitest-environment jsdom
/**
 * The client bundle, as the browser receives it.
 *
 * The host half is plain TypeScript that `tsc` emits, so it is tested by
 * importing it. The client half is not: it is a **single classic script** that
 * registers itself with `window.__ModuleLoader__.load({ id, factory })`, and
 * the loader assembles it by package name. Every one of those constraints is
 * invisible to `tsc` and only breaks in the browser — one stray top-level ESM
 * import, for instance, takes down every plugin's registration and points the
 * error at an innocent entry.
 *
 * So the built artifact is asserted here, and then actually executed through a
 * simulated loader to prove the panel reaches the slots.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { LearningPanel } from '../src/client/app.js'
import { LearningTab } from '../src/client/tab.jsx'

// Resolved from the project root rather than `import.meta.url`: under the
// jsdom environment that URL is an http one, which `readFileSync` rejects.
const ROOT = process.cwd()
const BUNDLE = join(ROOT, 'lib', 'client.js')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string }
const bundleExists = existsSync(BUNDLE)

const source = bundleExists ? readFileSync(BUNDLE, 'utf8') : ''

// The describes below share one jsdom document, and an earlier `apply` leaves
// its sheet behind on purpose (its disposers are not run). Clear between tests
// so the residue assertion below is about one instance, not about leftovers.
afterEach(() => {
  for (const sheet of document.querySelectorAll('style[data-diagnostic-tutor-style]')) sheet.remove()
})

/** Seed words of the DSH web module table; nothing else may be required. */
const ALLOWED_REQUIRES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
]

describe('the bundle exists and honours the loader contract', () => {
  it('is built', () => {
    expect(
      bundleExists,
      'lib/client.js is missing — run `pnpm build` (the package `pretest` hook builds it)',
    ).toBe(true)
  })

  it('registers itself under the package name', () => {
    // The loader assembles by package name, so a mismatch means the panel
    // silently never appears.
    expect(source).toContain(`"${pkg.name}"`)
    expect(source).toContain('window.__ModuleLoader__.load')
  })

  it('is a classic single-file script', () => {
    expect(source).not.toContain('import(')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/^\s*export\s/m)
  })

  it('requires only platform modules from the shared table', () => {
    const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
    for (const name of required) {
      expect(ALLOWED_REQUIRES, `unexpected runtime require: ${name}`).toContain(name)
    }
    expect(required).toContain('react')
  })

  it('does not drag the host half into the browser', () => {
    // zod and the storage layer are host-only; their presence would mean the
    // client is importing across the boundary.
    expect(source).not.toContain('zod')
    expect(source).not.toContain('storage-domain')
    expect(source).not.toContain('node:crypto')
  })

  it('ships a sourcemap reference', () => {
    expect(source).toContain('sourceMappingURL=client.js.map')
  })
})

/* -------------------------------------------------------------------------- */
/* Execute it through a simulated DSH module loader                           */
/* -------------------------------------------------------------------------- */

interface Registration {
  options: Record<string, unknown>
  Component: (props: never) => unknown
}

interface FakeSlots {
  registrations: Registration[]
  disposers: (() => void)[]
  tabKinds: Record<string, unknown>[]
  openedTabs: string[]
}

/** A ctx with every service `apply` reaches for, recording what it claims. */
function fakeClientContext(): { ctx: Record<string, unknown>; recorded: FakeSlots } {
  const recorded: FakeSlots = { registrations: [], disposers: [], tabKinds: [], openedTabs: [] }
  const ctx = {
    get: (name: string) => {
      if (name === 'layout') return { selectPanel: () => {} }
      // Resolved with `get`, because this plugin injects the tab *registry*
      // but not the navigation *controller*.
      if (name === 'sidebarRight') return { openTab: (kind: string) => recorded.openedTabs.push(kind) }
      return undefined
    },
    effect: (fn: () => () => void) => {
      recorded.disposers.push(fn())
    },
    sidebarRightTabs: {
      register(definition: Record<string, unknown>) {
        recorded.tabKinds.push(definition)
        return () => {}
      },
    },
    slots: {
      inject: (_key: string, callback: () => () => void) => {
        recorded.disposers.push(callback())
      },
      register: (options: Record<string, unknown>, Component: Registration['Component']) => {
        recorded.registrations.push({ options, Component })
        return () => {}
      },
    },
  }
  return { ctx, recorded }
}

/** Load the bundle exactly as the browser would, and capture its module. */
function loadBundle(): Record<string, unknown> {
  const captured: { module?: Record<string, unknown> } = {}
  // Exactly what the browser's shared module table supplies.
  const require = (name: string): unknown => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return ReactJsxRuntime
    throw new Error(`unexpected require in test: ${name}`)
  }
  const window_ = window as unknown as {
    __ModuleLoader__?: { load(def: { id: string; factory: (r: typeof require) => unknown }): void }
  }
  window_.__ModuleLoader__ = {
    load(def) {
      captured.module = def.factory(require) as Record<string, unknown>
    },
  }
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', 'exports', source)(window, { exports: {} }, {})
  if (!captured.module) throw new Error('bundle did not register a module')
  return captured.module
}

describe('the client plugin registers into the DSH slots', () => {
  const module = loadBundle()

  it('exports a client plugin with the expected shape', () => {
    expect(module.name).toBe('diagnostic-tutor-client')
    expect(module.inject).toEqual(['slots', 'layout', 'sidebarRightTabs', 'uiSession'])
    expect(typeof module.apply).toBe('function')
    // Same rule as the host half: a default export is never used.
    expect('default' in module).toBe(false)
  })

  it('puts Learn in an action seat, not a panel seat, and keeps the full view reachable', () => {
    const { ctx, recorded } = fakeClientContext()
    ;(module.apply as (c: unknown) => void)(ctx)

    const bySlot = (name: string) => recorded.registrations.filter((entry) => entry.options.name === name)

    // The regression this pins: Learn used to be a `sidebar.panellist` entry,
    // and a panellist id is contractually the "matching main panel key" whose
    // click the shell wires to `layout.selectPanel(id)`. So pressing Learn
    // replaced the conversation — which reads as the chat having been lost.
    expect(bySlot('sidebar.panellist'), 'Learn must not be a main-panel switch').toHaveLength(0)
    expect(bySlot('sidebar.footer.action')[0], 'no Learn action registered').toBeDefined()

    // The full panel still exists; it is simply reached on purpose, from the
    // docked tab's "Open full view", rather than by the sidebar.
    expect(bySlot('main')[0], 'the full panel must still be registered').toBeDefined()

    // The docked tab: a declared type, plus a body and a title registered under
    // the type's own id, because that is the key the seats dispatch on.
    expect(recorded.tabKinds).toHaveLength(1)
    const kind = recorded.tabKinds[0] as { id: string; kind: string }
    expect(kind.id).toBe(kind.kind)
    expect(bySlot('sidebar.right.pane.tab')[0]?.options.key).toBe(kind.id)
    expect(bySlot('sidebar.right.pane.tab.title')[0]?.options.key).toBe(kind.id)

    // Nothing is force-opened on load in this environment (the overview fetch
    // has no server), so the layout stays as the user left it.
    expect(recorded.disposers.length).toBeGreaterThanOrEqual(2)
  })

  it('renders both surfaces when their registered components are mounted', () => {
    const { ctx, recorded } = fakeClientContext()
    ;(module.apply as (c: unknown) => void)(ctx)

    const main = recorded.registrations.find((entry) => entry.options.name === 'main')
    const tab = recorded.registrations.find((entry) => entry.options.name === 'sidebar.right.pane.tab')
    expect(main).toBeDefined()
    expect(tab).toBeDefined()

    // Both render without a client injected. With no data at all — what a
    // freshly mounted client has before its first fetch — both show the
    // first-use state rather than an empty shell.
    const mainHtml = renderToStaticMarkup(createElement(main?.Component as never, {} as never))
    expect(mainHtml).toContain('dt-root')
    expect(mainHtml).toContain('What do you want to learn?')

    // The docked tab is narrow-first. With no data at all — which is what a
    // freshly mounted client has before its first fetch — it must show the
    // first-use state rather than an empty box.
    const tabHtml = renderToStaticMarkup(createElement(tab?.Component as never, {} as never))
    expect(tabHtml).toContain('dt-tab')
    expect(tabHtml).toContain('What do you want to learn?')
    expect(tabHtml).toContain('I want to learn machine learning.')
  })
})

describe('the client plugin injects its stylesheet and takes it away again', () => {
  const module = loadBundle()

  it('injects exactly one sheet, and removes it on dispose', () => {
    const disposers: (() => void)[] = []
    const { ctx, recorded } = fakeClientContext()
    ;(module.apply as (c: unknown) => void)(ctx)

    const sheets = document.querySelectorAll('style[data-diagnostic-tutor-style]')
    expect(sheets).toHaveLength(1)
    expect(sheets[0]?.textContent).toContain('.dt-root')

    // Unloading must leave no residue in the DOM.
    for (const dispose of recorded.disposers) dispose()
    expect(document.querySelectorAll('style[data-diagnostic-tutor-style]')).toHaveLength(0)
  })

  it('does not inject a second copy when applied twice', () => {
    const { ctx, recorded } = fakeClientContext()
    for (const dispose of recorded.disposers) dispose()
    ;(module.apply as (c: unknown) => void)(ctx)
    ;(module.apply as (c: unknown) => void)(ctx)
    expect(document.querySelectorAll('style[data-diagnostic-tutor-style]').length).toBeLessThanOrEqual(1)
  })
})

describe('the stylesheet cannot silently lose its theme', () => {
  const sheet = (() => {
    const source = readFileSync('src/client/styles.ts', 'utf8')
    const body = source.split('const CSS = `')[1]
    if (body === undefined) throw new Error('could not find the CSS template literal')
    return body.split('\n`\n')[0] ?? ''
  })()

  it('uses only design tokens that exist', () => {
    // A `var(--x, #fff)` fallback that is a colour turns a typo into a theme
    // bug: the panel keeps light cards inside a dark frame, nothing errors, and
    // it only shows up when someone opens dark mode.
    //
    // Four names were wrong exactly this way — bg-elevated, bg-sunken,
    // border-secondary, border-primary. The list below is the set this stylesheet
    // is allowed to use, each one checked against the shipped design system
    // (`@deepseek-ai/dsh-client-ui-theme`, design-platform.css, which defines
    // them under `body` and `body[data-ds-dark-theme]`). Adding a token here
    // means checking it there first; the theme package is not a dependency of
    // this repo, so it cannot be read at test time.
    const KNOWN = new Set([
      'dsw-alias-bg-base',
      'dsw-alias-bg-layer-1',
      'dsw-alias-bg-module-platform',
      'dsw-alias-border-l2',
      'dsw-alias-border-l3',
      'dsw-alias-button-primary-fill',
      // The design system's own pairing for a filled primary control:
      // ui-primitives Button.module.css sets `.primary` to
      // `background: var(--dsw-alias-button-primary-fill)` together with
      // `color: var(--dsw-alias-label-primary-foreground)`. The pairing is the
      // point — the fill inverts with the theme (near-black in light, near-white
      // in dark) and only the paired foreground inverts with it. White
      // hardcoded onto that fill is a blank button in dark mode.
      'dsw-alias-label-primary-foreground',
      'dsw-alias-label-primary',
      'dsw-alias-label-secondary',
      'dsw-alias-state-error-primary',
      'dsw-alias-state-success-primary',
      'dsw-alias-state-warn-primary',
    ])
    const used = [...new Set([...sheet.matchAll(/var\(--(dsw-[a-z0-9-]+)/g)].map((m) => m[1] ?? ''))]
    expect(used.length).toBeGreaterThan(0)
    const unknown = used.filter((name) => !KNOWN.has(name))
    expect(unknown, `unknown design tokens: ${unknown.join(', ')}`).toEqual([])
  })

  it('keeps backticks out of the CSS body', () => {
    // The sheet lives in a template literal; one backtick in a comment ends it
    // early and the file stops parsing. This has happened twice.
    expect(sheet).not.toContain('`')
  })

  it('declares the tokens on every root the plugin renders', () => {
    // This is the bug the panel and the tab each had, one release apart.
    //
    // A custom property that does not resolve makes the whole declaration
    // invalid at computed-value time: `background: var(--dt-accent)` with no
    // --dt-accent is not a fallback to some sensible default, it is no
    // background at all. So a root element outside the token rule loses its
    // entire appearance silently — no error, no warning, and on a light page
    // nothing looks obviously wrong until a white button lands on white.
    //
    // The docked tab shipped that way: `.dt-root-wrap` and `.dt-root` were in
    // the selector list, `.dt-tab` was not, and the tab had no card surfaces,
    // no borders, and an invisible primary button in light mode.
    //
    // The roots are discovered by rendering the two surfaces the plugin mounts,
    // so a new surface cannot quietly opt out of the token layer.
    const roots = [LearningPanel, LearningTab].map((component) => {
      const html = renderToStaticMarkup(createElement(component as never, {}))
      const first = /^<div class="([^"]+)"/.exec(html)?.[1] ?? ''
      return first.split(' ')[0] ?? ''
    })
    expect(roots.filter(Boolean), `could not find the rendered roots: ${roots.join(', ')}`).toHaveLength(2)

    const tokenRule = /([^{}]*)\{[^{}]*--dt-bg:/.exec(sheet)?.[1] ?? ''
    const declared = new Set([...tokenRule.matchAll(/\.(dt-[a-z0-9-]+)/g)].map((m) => m[1] ?? ''))
    const missing = roots.filter((root) => !declared.has(root))
    expect(
      missing,
      `these roots render outside the token rule and will lose all their styling: ${missing.join(', ')}`,
    ).toEqual([])
  })
})

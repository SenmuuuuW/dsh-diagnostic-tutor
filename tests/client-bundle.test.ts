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
    expect(module.inject).toEqual(['slots', 'layout', 'sidebarRightTabs'])
    expect(typeof module.apply).toBe('function')
    // Same rule as the host half: a default export is never used.
    expect('default' in module).toBe(false)
  })

  it('registers a sidebar entry, a main panel, and a docked tab under one id', () => {
    const { ctx, recorded } = fakeClientContext()
    ;(module.apply as (c: unknown) => void)(ctx)

    const bySlot = (name: string) => recorded.registrations.filter((entry) => entry.options.name === name)
    const sidebar = bySlot('sidebar.panellist')[0]
    const main = bySlot('main')[0]

    expect(sidebar, 'no sidebar.panellist registration').toBeDefined()
    expect(main, 'no main registration').toBeDefined()
    // The sidebar list id is what addresses the main panel key; if these ever
    // drift apart, the icon opens nothing.
    expect(sidebar?.options.id).toBe(main?.options.key)
    expect(sidebar?.options.label).toBe('Learn')

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

/**
 * tsdown build — client half only.
 *
 * The host half is not bundled: `tsc` already emits plain node ESM with
 * relative imports, which is how published DSH plugins ship.
 *
 * The client bundle replicates the official client-bundle preset's contract:
 *   - platform modules (`react`, `react-dom`, `@deepseek-ai/cordis`) stay
 *     external and are resolved at runtime from DSH's shared module table;
 *     everything else is inlined;
 *   - the output is ONE classic script registering itself through
 *     `window.__ModuleLoader__.load({ id, factory })`, and `id` MUST equal
 *     `package.json#name` — the loader assembles by package name;
 *   - it must stay a single file (the module table serves only
 *     `/plugins/<id>/client.js`), so the client source may contain no dynamic
 *     import.
 *
 * Styles never go through the bundler: `src/client/styles.ts` injects a
 * `<style data-plugin>` element at mount time.
 *
 * Note the external list uses `@deepseek-ai/cordis`, which is what the module
 * table actually exposes. Two published plugins list the bare `cordis` name
 * instead, which silently does nothing.
 */
import { defineConfig } from 'tsdown'

/** Seed words of the web module table (`apps/web`'s PLATFORM_MODULES). */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
]

export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  // `deps.neverBundle` is the current spelling of the old `external` option.
  deps: { neverBundle: CLIENT_EXTERNALS },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: "window.__ModuleLoader__.load({ id: 'dsh-diagnostic-tutor', factory: (require) => {",
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})

/**
 * Two build halves from one package: the node library the Loader mounts as a
 * plugin row, and the browser closure-factory bundle the web shell loads as
 * `dsh-pandaclaw/client`.
 *
 * The browser half runs inside the shell's frozen module table: every
 * `@deepseek-ai` import in `src/client` must be a platform module or
 * type-only — the purity plugin fails the BUILD instead of the page.
 */
import type { UserConfig } from 'tsdown'

const ID = 'dsh-pandaclaw'

/** Specifiers the web shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  // The runtime row's factory registers before dependent bundles materialize,
  // so its lazy module table answers this subpath natively.
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/** Wire/type layers with no cross-plugin runtime identity, safe to inline. */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand|session-projection)(\/|$)/

const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

/** The node half: ESM plus declarations into dist/. */
const library: UserConfig = {
  name: ID,
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2023',
  fixedExtension: false,
  dts: true,
  clean: true,
  external: [/^@deepseek-ai\//, /^node:/, 'zod'],
}

/** The browser half: one closure factory registered with the shell's loader. */
const client: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'dist',
  format: 'cjs',
  platform: 'browser',
  sourcemap: true,
  clean: false,
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  plugins: [{
    name: 'pandaclaw-client-bundle-purity',
    resolveId(source: string) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (INLINE_SAFE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is neither a platform module nor an inline-safe wire layer — `
        + 'cross-plugin value imports are forbidden; collaborate through projections',
      )
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [library, client]

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, UserConfig } from 'vite';
import { resolveVrtConfig } from '../node/config';
import type { VrtOptions, VrtRuntimeOptions } from '../types';

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/**
 * Resolves a file of this package itself. Prefers `import.meta.resolve`
 * (available wherever Vite loads config files natively); falls back to a
 * URL relative to this module for runtimes that do not provide it.
 */
function resolveOwnFile(specifier: string, fallbackRelative: string): string {
  const resolver = (import.meta as { resolve?: (s: string) => string }).resolve;
  if (typeof resolver === 'function') {
    try {
      return fileURLToPath(resolver(specifier));
    } catch {
      // fall through to URL-relative resolution
    }
  }
  return fileURLToPath(new URL(fallbackRelative, import.meta.url));
}

// Loose view of the Vitest-specific config; typed structurally so this
// package does not depend on vitest's Vite module augmentation.
type VitestUserConfigLike = UserConfig & {
  test?: {
    browser?: { instances?: unknown[] };
  };
};

/**
 * Vitest plugin that injects the per-story screenshot capture into the
 * project. Add it to the SAME Vitest project as `storybookTest()` from
 * `@storybook/addon-vitest`:
 *
 * ```ts
 * projects: [{
 *   plugins: [storybookTest({ ... }), vrt()],
 *   test: { browser: { ... } },
 * }]
 * ```
 *
 * Disabled runs (default: `VRT` env var unset) inject nothing, so a plain
 * `vitest run` keeps zero overhead.
 */
export function vrt(options: VrtOptions = {}): Plugin {
  return {
    name: 'storybook-addon-vrt',
    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      const resolved = resolveVrtConfig({ cwd: root, inline: options });
      if (!resolved.enabled) return undefined;

      const instances = (config as VitestUserConfigLike).test?.browser?.instances;
      if (Array.isArray(instances) && instances.length > 1 && !resolved.browserNameSuffix) {
        console.warn(
          '[vrt] Multiple browser instances detected; enable `browserNameSuffix` ' +
            'so their screenshots do not overwrite each other.',
        );
      }

      const runtime: VrtRuntimeOptions = {
        root: toPosix(root),
        baseDir: toPosix(resolved.baseDir),
        actualDir: toPosix(resolved.actualDir),
        diffDir: toPosix(resolved.diffDir),
        browserNameSuffix: resolved.browserNameSuffix,
        stability: resolved.stability,
      };

      // Returned partials are array-concatenated by Vite's mergeConfig, so
      // existing setupFiles/globalSetup of the project are preserved and our
      // setup file lands AFTER them (its afterEach then runs first — LIFO).
      return {
        test: {
          setupFiles: [resolveOwnFile('storybook-addon-vrt/setup', '../browser/setup.mjs')],
          globalSetup: [
            resolveOwnFile('storybook-addon-vrt/internal/global-setup', './global-setup.mjs'),
          ],
          env: {
            __VRT_OPTIONS__: JSON.stringify(runtime),
          },
        },
      } as UserConfig;
    },
  };
}

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VrtRuntimeOptions } from '../types';
import { vrt } from './index';

type InjectedConfig = {
  test?: {
    setupFiles?: string[];
    globalSetup?: string[];
    env?: Record<string, string>;
  };
};

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vrt-plugin-'));
  tmpDirs.push(dir);
  return dir;
}

function callConfigHook(plugin: Plugin, config: UserConfig): InjectedConfig | undefined {
  const hook = plugin.config;
  const handler = typeof hook === 'function' ? hook : hook?.handler;
  if (!handler) throw new Error('plugin has no config hook');
  return handler.call(
    // biome/oxlint: the hook context is unused by our plugin.
    undefined as never,
    config,
    { command: 'serve', mode: 'test' },
  ) as InjectedConfig | undefined;
}

describe('vrt plugin', () => {
  it('injects nothing when disabled', async () => {
    const root = await makeRoot();

    const result = callConfigHook(vrt({ enabled: false }), { root });

    expect(result).toBeUndefined();
  });

  it('injects setup file, global setup and serialized runtime options when enabled', async () => {
    const root = await makeRoot();

    const result = callConfigHook(vrt({ enabled: true }), { root });

    expect(result?.test?.setupFiles).toHaveLength(1);
    expect(result?.test?.setupFiles?.[0]).toMatch(/browser[/\\]setup\.(mjs|ts)$/);
    expect(result?.test?.globalSetup).toHaveLength(1);
    expect(result?.test?.globalSetup?.[0]).toMatch(/global-setup\.(mjs|ts)$/);

    const raw = result?.test?.env?.['__VRT_OPTIONS__'];
    expect(raw).toBeDefined();
    const runtime = JSON.parse(raw ?? '{}') as VrtRuntimeOptions;
    expect(runtime.actualDir).toBe(`${root.split(path.sep).join('/')}/.vrt/actual`);
    expect(runtime.stability).toEqual({
      retries: 5,
      interval: 100,
      disableAnimations: true,
    });
  });

  it('warns when multiple browser instances run without browserNameSuffix', async () => {
    const root = await makeRoot();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    callConfigHook(vrt({ enabled: true }), {
      root,
      test: { browser: { instances: [{}, {}] } },
    } as UserConfig);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('browserNameSuffix'));
  });
});

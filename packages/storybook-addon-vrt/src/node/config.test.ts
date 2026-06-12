import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveVrtConfig, VrtConfigError } from './config';

const tmpDirs: string[] = [];

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vrt-config-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('resolveVrtConfig', () => {
  it('resolves defaults relative to cwd', async () => {
    const cwd = await makeTmpDir();

    const config = resolveVrtConfig({ cwd });

    expect(config.baseDir).toBe(path.join(cwd, '.vrt'));
    expect(config.expectedDir).toBe(path.join(cwd, '.vrt', 'expected'));
    expect(config.actualDir).toBe(path.join(cwd, '.vrt', 'actual'));
    expect(config.diffDir).toBe(path.join(cwd, '.vrt', 'diff'));
    expect(config.threshold).toBe(0.1);
    expect(config.allowedMismatchedPixels).toBeUndefined();
    expect(config.allowedMismatchedPixelRatio).toBeUndefined();
    expect(config.failOn).toEqual(['changed', 'added', 'deleted']);
    expect(config.browserNameSuffix).toBe(false);
    expect(config.stability).toEqual({
      retries: 5,
      interval: 100,
      disableAnimations: true,
    });
  });

  it('is disabled by default and enabled by the VRT env var', async () => {
    const cwd = await makeTmpDir();

    expect(resolveVrtConfig({ cwd }).enabled).toBe(false);
    vi.stubEnv('VRT', '1');
    expect(resolveVrtConfig({ cwd }).enabled).toBe(true);
  });

  it('reads vrt.config.json from cwd', async () => {
    const cwd = await makeTmpDir();
    await writeFile(
      path.join(cwd, 'vrt.config.json'),
      JSON.stringify({ threshold: 0.3, baseDir: 'shots' }),
    );

    const config = resolveVrtConfig({ cwd });

    expect(config.threshold).toBe(0.3);
    expect(config.baseDir).toBe(path.join(cwd, 'shots'));
  });

  it('applies precedence: cli > inline > config file', async () => {
    const cwd = await makeTmpDir();
    await writeFile(path.join(cwd, 'vrt.config.json'), JSON.stringify({ threshold: 0.3 }));

    expect(resolveVrtConfig({ cwd, inline: { threshold: 0.5 } }).threshold).toBe(0.5);
    expect(
      resolveVrtConfig({ cwd, inline: { threshold: 0.5 }, cli: { threshold: 0.7 } }).threshold,
    ).toBe(0.7);
  });

  it('deep-merges stability across sources', async () => {
    const cwd = await makeTmpDir();
    await writeFile(
      path.join(cwd, 'vrt.config.json'),
      JSON.stringify({ stability: { retries: 3 } }),
    );

    const config = resolveVrtConfig({
      cwd,
      inline: { stability: { interval: 50 } },
    });

    expect(config.stability).toEqual({
      retries: 3,
      interval: 50,
      disableAnimations: true,
    });
  });

  it('throws on invalid JSON in the config file', async () => {
    const cwd = await makeTmpDir();
    await writeFile(path.join(cwd, 'vrt.config.json'), '{ broken');

    expect(() => resolveVrtConfig({ cwd })).toThrow(VrtConfigError);
  });

  it('throws when an option has the wrong type', async () => {
    const cwd = await makeTmpDir();
    await writeFile(path.join(cwd, 'vrt.config.json'), JSON.stringify({ threshold: 'high' }));

    expect(() => resolveVrtConfig({ cwd })).toThrow(VrtConfigError);
  });

  it('rejects out-of-range numeric options', async () => {
    const cwd = await makeTmpDir();

    expect(() => resolveVrtConfig({ cwd, inline: { threshold: 1.5 } })).toThrow(VrtConfigError);
    expect(() => resolveVrtConfig({ cwd, inline: { allowedMismatchedPixelRatio: -0.1 } })).toThrow(
      VrtConfigError,
    );
    expect(() => resolveVrtConfig({ cwd, inline: { allowedMismatchedPixels: -1 } })).toThrow(
      VrtConfigError,
    );
    expect(() => resolveVrtConfig({ cwd, inline: { stability: { retries: 0 } } })).toThrow(
      VrtConfigError,
    );
    expect(() => resolveVrtConfig({ cwd, inline: { stability: { interval: -5 } } })).toThrow(
      VrtConfigError,
    );
    expect(() => resolveVrtConfig({ cwd, inline: { threshold: Number.NaN } })).toThrow(
      VrtConfigError,
    );
  });

  it('throws when failOn contains an unknown category', async () => {
    const cwd = await makeTmpDir();

    expect(() =>
      resolveVrtConfig({
        cwd,
        inline: { failOn: ['changed', 'broken'] as never },
      }),
    ).toThrow(VrtConfigError);
  });

  it('throws when an explicitly given config file is missing', async () => {
    const cwd = await makeTmpDir();

    expect(() => resolveVrtConfig({ cwd, configFile: 'nope.json' })).toThrow(VrtConfigError);
  });

  it('warns on unknown option keys but keeps going', async () => {
    const cwd = await makeTmpDir();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await writeFile(path.join(cwd, 'vrt.config.json'), JSON.stringify({ thresold: 0.2 }));

    const config = resolveVrtConfig({ cwd });

    expect(config.threshold).toBe(0.1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown option "thresold"'));
  });
});

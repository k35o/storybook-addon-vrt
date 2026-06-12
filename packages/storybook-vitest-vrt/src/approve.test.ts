import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { approve } from './approve';
import type { ResolvedVrtConfig } from './types';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeFixture(files: {
  expected?: Record<string, string>;
  actual?: Record<string, string>;
}): Promise<ResolvedVrtConfig> {
  const root = await mkdtemp(path.join(tmpdir(), 'vrt-approve-'));
  tmpDirs.push(root);
  const baseDir = path.join(root, '.vrt');
  const config: ResolvedVrtConfig = {
    enabled: true,
    root,
    baseDir,
    expectedDir: path.join(baseDir, 'expected'),
    actualDir: path.join(baseDir, 'actual'),
    diffDir: path.join(baseDir, 'diff'),
    browserNameSuffix: false,
    stability: { retries: 5, interval: 100, disableAnimations: true },
    threshold: 0.1,
    allowedMismatchedPixels: undefined,
    allowedMismatchedPixelRatio: undefined,
    failOn: ['changed', 'added', 'deleted'],
  };
  for (const [dir, entries] of [
    [config.expectedDir, files.expected ?? {}],
    [config.actualDir, files.actual ?? {}],
  ] as const) {
    for (const [key, content] of Object.entries(entries)) {
      const filePath = path.join(dir, ...key.split('/'));
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    }
  }
  return config;
}

describe('approve', () => {
  it('copies every actual over expected and deletes orphaned baselines', async () => {
    const config = await makeFixture({
      expected: { 'a/changed.png': 'old', 'a/gone.png': 'orphan' },
      actual: { 'a/changed.png': 'new', 'b/added.png': 'fresh' },
    });

    const result = await approve(config);

    expect(result).toEqual({
      copied: ['a/changed.png', 'b/added.png'],
      deleted: ['a/gone.png'],
    });
    expect(await readFile(path.join(config.expectedDir, 'a/changed.png'), 'utf8')).toBe('new');
    expect(await readFile(path.join(config.expectedDir, 'b/added.png'), 'utf8')).toBe('fresh');
    expect(existsSync(path.join(config.expectedDir, 'a/gone.png'))).toBe(false);
  });

  it('restricts both copies and deletions to keys matching the filter', async () => {
    const config = await makeFixture({
      expected: { 'a/gone.png': 'orphan', 'b/gone.png': 'orphan' },
      actual: { 'a/new.png': 'fresh', 'b/new.png': 'fresh' },
    });

    const result = await approve(config, { filter: 'a/**' });

    expect(result).toEqual({ copied: ['a/new.png'], deleted: ['a/gone.png'] });
    expect(existsSync(path.join(config.expectedDir, 'b/new.png'))).toBe(false);
    expect(existsSync(path.join(config.expectedDir, 'b/gone.png'))).toBe(true);
  });

  it('reports operations without touching files in dry-run mode', async () => {
    const config = await makeFixture({
      expected: { 'gone.png': 'orphan' },
      actual: { 'new.png': 'fresh' },
    });

    const result = await approve(config, { dryRun: true });

    expect(result).toEqual({ copied: ['new.png'], deleted: ['gone.png'] });
    expect(existsSync(path.join(config.expectedDir, 'new.png'))).toBe(false);
    expect(existsSync(path.join(config.expectedDir, 'gone.png'))).toBe(true);
  });
});

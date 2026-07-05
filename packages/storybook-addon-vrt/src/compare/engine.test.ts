import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedVrtConfig, VrtUncapturedReason } from '../types';
import { runCompare } from './engine';

type Rgba = [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];

function pngBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba = () => WHITE,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (width * y + x) << 2;
      const [r, g, b, a] = paint(x, y);
      png.data[index] = r;
      png.data[index + 1] = g;
      png.data[index + 2] = b;
      png.data[index + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeFixture(
  files: {
    expected?: Record<string, Buffer>;
    actual?: Record<string, Buffer>;
    uncaptured?: Record<string, VrtUncapturedReason>;
  },
  overrides: Partial<ResolvedVrtConfig> = {},
): Promise<ResolvedVrtConfig> {
  const root = await mkdtemp(path.join(tmpdir(), 'vrt-engine-'));
  tmpDirs.push(root);
  const baseDir = path.join(root, '.vrt');
  const config: ResolvedVrtConfig = {
    enabled: true,
    root,
    baseDir,
    expectedDir: path.join(baseDir, 'expected'),
    actualDir: path.join(baseDir, 'actual'),
    diffDir: path.join(baseDir, 'diff'),
    uncapturedDir: path.join(baseDir, 'uncaptured'),
    browserNameSuffix: false,
    stability: { retries: 5, interval: 100, disableAnimations: true },
    threshold: 0.1,
    allowedMismatchedPixels: undefined,
    allowedMismatchedPixelRatio: undefined,
    failOn: ['changed', 'added', 'removed'],
    fullRunTriggers: ['**/.storybook/**'],
    project: 'storybook',
    ...overrides,
  };
  for (const [dir, entries] of [
    [config.expectedDir, files.expected ?? {}],
    [config.actualDir, files.actual ?? {}],
  ] as const) {
    for (const [key, buffer] of Object.entries(entries)) {
      const filePath = path.join(dir, ...key.split('/'));
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, buffer);
    }
  }
  for (const [key, reason] of Object.entries(files.uncaptured ?? {})) {
    const filePath = path.join(config.uncapturedDir, ...`${key}.json`.split('/'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify({ reason }));
  }
  return config;
}

describe('runCompare', () => {
  it('classifies identical pairs as passed', async () => {
    const image = pngBuffer(4, 4);
    const config = await makeFixture({
      expected: { 'a/story.png': image },
      actual: { 'a/story.png': image },
    });

    const report = await runCompare(config);

    expect(report.summary).toEqual({
      total: 1,
      passed: 1,
      changed: 0,
      added: 0,
      removed: 0,
      skipped: 0,
      carried: 0,
      failed: false,
    });
    expect(report.version).toBe(2);
    expect(report.run.mode).toBe('full');
    expect(report.items[0]).toEqual({
      key: 'a/story.png',
      status: 'passed',
      paths: {
        expected: 'expected/a/story.png',
        actual: 'actual/a/story.png',
        diff: null,
      },
    });
  });

  it('classifies a one-pixel difference as changed and writes a diff image', async () => {
    const config = await makeFixture({
      expected: { 'story.png': pngBuffer(4, 4) },
      actual: {
        'story.png': pngBuffer(4, 4, (x, y) => (x === 0 && y === 0 ? BLACK : WHITE)),
      },
    });

    const report = await runCompare(config);

    expect(report.summary.changed).toBe(1);
    expect(report.summary.failed).toBe(true);
    expect(report.items[0]).toMatchObject({
      status: 'changed',
      mismatchedPixels: 1,
      mismatchRatio: 0.0625,
      paths: { diff: 'diff/story.png' },
    });
    expect(existsSync(path.join(config.diffDir, 'story.png'))).toBe(true);
  });

  it('passes within allowedMismatchedPixels', async () => {
    const config = await makeFixture(
      {
        expected: { 'story.png': pngBuffer(4, 4) },
        actual: {
          'story.png': pngBuffer(4, 4, (x, y) => (x === 0 && y === 0 ? BLACK : WHITE)),
        },
      },
      { allowedMismatchedPixels: 1 },
    );

    const report = await runCompare(config);

    expect(report.items[0]?.status).toBe('passed');
    expect(existsSync(path.join(config.diffDir, 'story.png'))).toBe(false);
  });

  it('treats allowedMismatchedPixelRatio as an inclusive boundary', async () => {
    const files = {
      expected: { 'story.png': pngBuffer(2, 2) },
      actual: {
        'story.png': pngBuffer(2, 2, (x, y) => (x === 0 && y === 0 ? BLACK : WHITE)),
      },
    };

    const atBoundary = await runCompare(
      await makeFixture(files, { allowedMismatchedPixelRatio: 0.25 }),
    );
    const belowBoundary = await runCompare(
      await makeFixture(files, { allowedMismatchedPixelRatio: 0.2 }),
    );

    expect(atBoundary.items[0]?.status).toBe('passed');
    expect(belowBoundary.items[0]?.status).toBe('changed');
  });

  it('lets the stricter of both limits win', async () => {
    const config = await makeFixture(
      {
        expected: { 'story.png': pngBuffer(2, 2) },
        actual: {
          'story.png': pngBuffer(2, 2, (x, y) => (x === 0 && y === 0 ? BLACK : WHITE)),
        },
      },
      { allowedMismatchedPixels: 0, allowedMismatchedPixelRatio: 0.25 },
    );

    const report = await runCompare(config);

    expect(report.items[0]?.status).toBe('changed');
  });

  it('marks dimension mismatches as changed regardless of tolerances', async () => {
    const config = await makeFixture(
      {
        expected: { 'story.png': pngBuffer(4, 4) },
        actual: { 'story.png': pngBuffer(4, 6) },
      },
      { allowedMismatchedPixelRatio: 1 },
    );

    const report = await runCompare(config);

    expect(report.items[0]).toMatchObject({
      status: 'changed',
      dimensions: { expected: [4, 4], actual: [4, 6] },
    });
    expect(existsSync(path.join(config.diffDir, 'story.png'))).toBe(true);
  });

  it('classifies actual-only keys as added and expected-only keys as removed', async () => {
    const config = await makeFixture({
      expected: { 'gone.png': pngBuffer(2, 2) },
      actual: { 'new.png': pngBuffer(2, 2) },
    });

    const report = await runCompare(config);

    expect(report.items).toEqual([
      {
        key: 'gone.png',
        status: 'removed',
        reason: 'no-capture',
        paths: { expected: 'expected/gone.png', actual: null, diff: null },
      },
      {
        key: 'new.png',
        status: 'added',
        reason: 'new-story',
        paths: { expected: null, actual: 'actual/new.png', diff: null },
      },
    ]);
    expect(report.summary).toMatchObject({ added: 1, removed: 1, failed: true });
  });

  it('carries an unexecuted baseline forward in changed mode instead of removing it', async () => {
    const config = await makeFixture({ expected: { 'kept.png': pngBuffer(2, 2) } });

    const report = await runCompare(config, { mode: 'changed', ref: 'origin/main' });

    expect(report.items[0]).toEqual({
      key: 'kept.png',
      status: 'carried',
      reason: 'not-selected',
      paths: { expected: 'expected/kept.png', actual: null, diff: null },
    });
    expect(report.summary).toMatchObject({ carried: 1, removed: 0, failed: false });
    expect(report.run).toMatchObject({ mode: 'changed', ref: 'origin/main' });
  });

  it('classifies a vrt.skip baseline as skipped, not removed, even in a full run (V6)', async () => {
    const config = await makeFixture({
      expected: { 'flaky.png': pngBuffer(2, 2) },
      uncaptured: { 'flaky.png': 'vrt-skip' },
    });

    const report = await runCompare(config, { mode: 'full' });

    expect(report.items[0]).toEqual({
      key: 'flaky.png',
      status: 'skipped',
      reason: 'vrt-skip',
      paths: { expected: 'expected/flaky.png', actual: null, diff: null },
    });
    expect(report.summary).toMatchObject({ skipped: 1, removed: 0, failed: false });
  });

  it('only fails on categories listed in failOn', async () => {
    const config = await makeFixture(
      { actual: { 'new.png': pngBuffer(2, 2) } },
      { failOn: ['changed'] },
    );

    const report = await runCompare(config);

    expect(report.summary.added).toBe(1);
    expect(report.summary.failed).toBe(false);
  });
});

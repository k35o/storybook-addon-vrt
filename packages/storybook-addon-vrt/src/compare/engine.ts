import { availableParallelism } from 'node:os';
import path from 'node:path';
import type {
  ResolvedVrtConfig,
  VrtReport,
  VrtReportItem,
  VrtRunMode,
  VrtUncapturedReason,
} from '../types';
import { comparePair } from './diff-image';
import { scanPngs, scanUncaptured } from './scan';

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results = Array.from({ length: tasks.length }) as T[];
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      if (!task) break;
      results[index] = await task();
    }
  });
  await Promise.all(workers);
  return results;
}

export type RunCompareOptions = {
  /**
   * How much of the suite this run covered. In `changed` mode a baseline
   * without a screenshot is `carried` (not selected), never a failing
   * `removed`. Defaults to `full`.
   */
  mode?: VrtRunMode;
  /** `--changed` base ref, recorded in the report for provenance. */
  ref?: string | null;
  /** Set when `--changed` was escalated to a full run by a trigger. */
  escalation?: { file: string; trigger: string } | null;
};

export async function runCompare(
  config: ResolvedVrtConfig,
  options: RunCompareOptions = {},
): Promise<VrtReport> {
  const mode: VrtRunMode = options.mode ?? 'full';
  const [expected, actual, uncaptured] = await Promise.all([
    scanPngs(config.expectedDir),
    scanPngs(config.actualDir),
    scanUncaptured(config.uncapturedDir),
  ]);
  const keys = [...new Set([...expected.keys(), ...actual.keys(), ...uncaptured.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );

  // Report paths are relative to baseDir so the HTML report can reference
  // the images no matter where the whole baseDir ends up (e.g. CI artifact).
  const relDir = (dir: string) => toPosix(path.relative(config.baseDir, dir));
  const dirs = {
    expected: relDir(config.expectedDir),
    actual: relDir(config.actualDir),
    diff: relDir(config.diffDir),
  };

  const uncapturedReason: Record<VrtUncapturedReason, 'vrt-skip' | 'test-skipped' | 'test-failed'> =
    { 'vrt-skip': 'vrt-skip', 'test-skipped': 'test-skipped', 'test-failed': 'test-failed' };

  const tasks = keys.map((key) => async (): Promise<VrtReportItem> => {
    const expectedPath = expected.get(key);
    const actualPath = actual.get(key);
    const marker = uncaptured.get(key);
    const expectedRel = expectedPath === undefined ? null : `${dirs.expected}/${key}`;

    if (actualPath !== undefined) {
      if (expectedPath === undefined) {
        return {
          key,
          status: 'added',
          reason: 'new-story',
          paths: { expected: null, actual: `${dirs.actual}/${key}`, diff: null },
        };
      }
      const result = await comparePair({
        expectedPath,
        actualPath,
        diffPath: path.join(config.diffDir, ...key.split('/')),
        threshold: config.threshold,
        allowedMismatchedPixels: config.allowedMismatchedPixels,
        allowedMismatchedPixelRatio: config.allowedMismatchedPixelRatio,
      });
      return {
        key,
        status: result.passed ? 'passed' : 'changed',
        ...(result.passed ? {} : { reason: result.dimensions ? 'dimension-diff' : 'pixel-diff' }),
        paths: {
          expected: expectedRel,
          actual: `${dirs.actual}/${key}`,
          diff: result.passed ? null : `${dirs.diff}/${key}`,
        },
        ...(result.passed
          ? {}
          : {
              mismatchedPixels: result.mismatchedPixels,
              mismatchRatio: result.mismatchRatio,
            }),
        ...(result.dimensions ? { dimensions: result.dimensions } : {}),
      };
    }

    // No screenshot for this key. A marker means the story ran but was
    // intentionally not captured (fixes the vrt.skip-as-deleted bug); the
    // baseline is kept, never a failure. Otherwise a missing capture is a
    // real deletion in a full run, but only "not selected" under --changed.
    if (marker !== undefined) {
      return {
        key,
        status: 'skipped',
        reason: uncapturedReason[marker],
        paths: { expected: expectedRel, actual: null, diff: null },
      };
    }
    return {
      key,
      status: mode === 'changed' ? 'carried' : 'removed',
      reason: mode === 'changed' ? 'not-selected' : 'no-capture',
      paths: { expected: expectedRel, actual: null, diff: null },
    };
  });

  const items = await runPool(tasks, Math.min(availableParallelism(), 8));

  const count = (status: VrtReportItem['status']) =>
    items.filter((item) => item.status === status).length;
  const summary = {
    total: items.length,
    passed: count('passed'),
    changed: count('changed'),
    added: count('added'),
    removed: count('removed'),
    skipped: count('skipped'),
    carried: count('carried'),
    failed: false,
  };
  summary.failed = config.failOn.some((status) => count(status) > 0);

  return {
    version: 2,
    createdAt: new Date().toISOString(),
    run: {
      mode,
      ref: options.ref ?? null,
      escalation: options.escalation ?? null,
    },
    options: {
      threshold: config.threshold,
      ...(config.allowedMismatchedPixels !== undefined
        ? { allowedMismatchedPixels: config.allowedMismatchedPixels }
        : {}),
      ...(config.allowedMismatchedPixelRatio !== undefined
        ? { allowedMismatchedPixelRatio: config.allowedMismatchedPixelRatio }
        : {}),
      failOn: config.failOn,
    },
    dirs,
    summary,
    items,
  };
}

import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { ResolvedVrtConfig, VrtReport, VrtReportItem } from '../types';
import { comparePair } from './diff-image';
import { scanPngs } from './scan';

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

export async function runCompare(config: ResolvedVrtConfig): Promise<VrtReport> {
  const [expected, actual] = await Promise.all([
    scanPngs(config.expectedDir),
    scanPngs(config.actualDir),
  ]);
  const keys = [...new Set([...expected.keys(), ...actual.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );

  // Report paths are relative to baseDir so the HTML report can reference
  // the images no matter where the whole baseDir ends up (e.g. CI artifact).
  const relDir = (dir: string) => toPosix(path.relative(config.baseDir, dir));
  const dirs = {
    expected: relDir(config.expectedDir),
    actual: relDir(config.actualDir),
    diff: relDir(config.diffDir),
  };

  const tasks = keys.map((key) => async (): Promise<VrtReportItem> => {
    const expectedPath = expected.get(key);
    const actualPath = actual.get(key);
    if (expectedPath === undefined) {
      return {
        key,
        status: 'added',
        paths: { expected: null, actual: `${dirs.actual}/${key}`, diff: null },
      };
    }
    if (actualPath === undefined) {
      return {
        key,
        status: 'deleted',
        paths: { expected: `${dirs.expected}/${key}`, actual: null, diff: null },
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
      paths: {
        expected: `${dirs.expected}/${key}`,
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
  });

  const items = await runPool(tasks, Math.min(availableParallelism(), 8));

  const count = (status: VrtReportItem['status']) =>
    items.filter((item) => item.status === status).length;
  const summary = {
    total: items.length,
    passed: count('passed'),
    changed: count('changed'),
    added: count('added'),
    deleted: count('deleted'),
    failed: false,
  };
  summary.failed = config.failOn.some((status) => count(status) > 0);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
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

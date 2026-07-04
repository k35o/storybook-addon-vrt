import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VrtReport } from '../types';
import { writeGithubAnnotations, writeGithubStepSummary } from './github';

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function makeReport(): VrtReport {
  return {
    version: 2,
    createdAt: '2026-06-12T00:00:00.000Z',
    run: { mode: 'changed', ref: 'origin/main', escalation: null },
    options: { threshold: 0.1, failOn: ['changed', 'added', 'removed'] },
    dirs: { expected: 'expected', actual: 'actual', diff: 'diff' },
    summary: {
      total: 4,
      passed: 1,
      changed: 1,
      added: 1,
      removed: 0,
      skipped: 0,
      carried: 1,
      failed: true,
    },
    items: [
      {
        key: 'src/button.stories.tsx/Primary.png',
        status: 'changed',
        reason: 'pixel-diff',
        paths: { expected: 'e', actual: 'a', diff: 'd' },
        mismatchedPixels: 342,
        mismatchRatio: 0.0084,
      },
      {
        key: 'src/badge.stories.tsx/New.png',
        status: 'added',
        reason: 'new-story',
        paths: { expected: null, actual: 'a', diff: null },
      },
    ],
  };
}

describe('writeGithubStepSummary', () => {
  it('appends a markdown verdict, counts, and failing rows', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vrt-gh-'));
    tmpDirs.push(dir);
    const summaryPath = path.join(dir, 'summary.md');
    vi.stubEnv('GITHUB_STEP_SUMMARY', summaryPath);

    writeGithubStepSummary(makeReport());

    const md = await readFile(summaryPath, 'utf8');
    expect(md).toContain('❌ VRT failed');
    expect(md).toContain('incremental vs `origin/main`');
    expect(md).toContain('| 1 | 1 | 1 | 0 | 0 | 1 |');
    expect(md).toContain('src/button.stories.tsx › **Primary**');
    expect(md).toContain('342px (0.84%)');
  });

  it('is a no-op when GITHUB_STEP_SUMMARY is unset', () => {
    vi.stubEnv('GITHUB_STEP_SUMMARY', '');
    expect(() => writeGithubStepSummary(makeReport())).not.toThrow();
  });
});

describe('writeGithubAnnotations', () => {
  it('emits ::error annotations with a repo-relative file prefix', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    writeGithubAnnotations(makeReport(), 'examples/basic');

    const lines = log.mock.calls.map((c) => String(c[0]));
    expect(lines).toContainEqual(
      expect.stringContaining(
        '::error file=examples/basic/src/button.stories.tsx,title=VRT changed::',
      ),
    );
    expect(lines.some((l) => l.includes('Primary') && l.includes('342px'))).toBe(true);
  });
});

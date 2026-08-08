import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VrtReport } from '../types';
import {
  buildCommentMarkdown,
  COMMENT_MARKER,
  resolveCommentTarget,
  upsertPrComment,
  type CommentTarget,
} from './comment';

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function makeReport(overrides: Partial<VrtReport> = {}): VrtReport {
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
        key: 'src/button.stories.tsx/Primary Large.png',
        status: 'changed',
        reason: 'pixel-diff',
        paths: {
          expected: 'expected/src/button.stories.tsx/Primary Large.png',
          actual: 'actual/src/button.stories.tsx/Primary Large.png',
          diff: 'diff/src/button.stories.tsx/Primary Large.png',
        },
        mismatchedPixels: 342,
        mismatchRatio: 0.0084,
      },
      {
        key: 'src/badge.stories.tsx/New.png',
        status: 'added',
        reason: 'new-story',
        paths: { expected: null, actual: 'actual/src/badge.stories.tsx/New.png', diff: null },
      },
    ],
    ...overrides,
  };
}

describe('buildCommentMarkdown', () => {
  it('embeds encoded image URLs and a report link when reportUrl is set', () => {
    const md = buildCommentMarkdown(makeReport(), { reportUrl: 'https://vrt.example.com/pr-12/' });

    expect(md).toContain(COMMENT_MARKER);
    expect(md).toContain('## 📸 VRT: 1 changed · 1 added');
    expect(md).toContain('Mode: incremental vs `origin/main`');
    expect(md).toContain('| 1 | 1 | 1 | 0 | 0 | 1 |');
    expect(md).toContain(
      '#### `src/button.stories.tsx` › Primary Large — `changed` · 342px (0.84%)',
    );
    expect(md).toContain(
      '![diff](https://vrt.example.com/pr-12/diff/src/button.stories.tsx/Primary%20Large.png)',
    );
    // The added story has no expected/diff image — cells degrade to a dash.
    expect(md).toContain(
      '| — | ![actual](https://vrt.example.com/pr-12/actual/src/badge.stories.tsx/New.png) | — |',
    );
    expect(md).toContain('[Open the full report](https://vrt.example.com/pr-12/report.html)');
    expect(md).not.toContain('artifact');
  });

  it('degrades to a text table pointing at the artifact without reportUrl', () => {
    const md = buildCommentMarkdown(makeReport());

    expect(md).toContain(
      '| `changed` | src/button.stories.tsx › **Primary Large** | 342px (0.84%) |',
    );
    expect(md).not.toContain('![');
    expect(md).toContain('_Download the `vrt-report` artifact');
  });

  it('collapses findings beyond maxEntries into a count', () => {
    const md = buildCommentMarkdown(makeReport(), { maxEntries: 1 });

    expect(md).toContain('src/button.stories.tsx');
    expect(md).not.toContain('src/badge.stories.tsx');
    expect(md).toContain('…and 1 more.');
  });

  it('reports a clean pass without findings sections', () => {
    const report = makeReport({
      summary: {
        total: 2,
        passed: 2,
        changed: 0,
        added: 0,
        removed: 0,
        skipped: 0,
        carried: 0,
        failed: false,
      },
      items: [],
    });

    const md = buildCommentMarkdown(report);

    expect(md).toContain('## ✅ VRT passed');
    expect(md).not.toContain('| status | story |');
    expect(md).not.toContain('artifact');
  });
});

describe('resolveCommentTarget', () => {
  it('resolves from flags and the environment token', () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    vi.stubEnv('GITHUB_API_URL', '');

    const target = resolveCommentTarget({ repo: 'k35o/storybook-addon-vrt', pr: 12 });

    expect(target).toEqual({
      repo: 'k35o/storybook-addon-vrt',
      pr: 12,
      token: 'test-token',
      apiUrl: 'https://api.github.com',
    });
  });

  it('auto-detects the PR number from the pull_request event payload', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vrt-comment-'));
    tmpDirs.push(dir);
    const eventPath = path.join(dir, 'event.json');
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 42 } }));
    vi.stubEnv('GITHUB_EVENT_PATH', eventPath);
    vi.stubEnv('GITHUB_REPOSITORY', 'k35o/storybook-addon-vrt');
    vi.stubEnv('GITHUB_TOKEN', 'test-token');

    expect(resolveCommentTarget().pr).toBe(42);
  });

  it('rejects a missing PR number with a --pr hint', () => {
    vi.stubEnv('GITHUB_EVENT_PATH', '');
    vi.stubEnv('GITHUB_TOKEN', 'test-token');

    expect(() => resolveCommentTarget({ repo: 'k35o/storybook-addon-vrt' })).toThrow(/--pr/);
  });

  it('rejects a missing repository', () => {
    vi.stubEnv('GITHUB_REPOSITORY', '');

    expect(() => resolveCommentTarget({ pr: 12 })).toThrow(/--repo/);
  });

  it('rejects a missing token', () => {
    vi.stubEnv('GITHUB_TOKEN', '');

    expect(() => resolveCommentTarget({ repo: 'k35o/storybook-addon-vrt', pr: 12 })).toThrow(
      /GITHUB_TOKEN/,
    );
  });
});

type FetchCall = { url: string; method: string; body: unknown };

function fakeFetch(responses: Array<{ status?: number; json?: unknown }>): {
  impl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const next = responses.shift() ?? { status: 200, json: {} };
    return new Response(JSON.stringify(next.json ?? {}), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const target: CommentTarget = {
  repo: 'k35o/storybook-addon-vrt',
  pr: 12,
  token: 'test-token',
  apiUrl: 'https://api.github.com',
};

describe('upsertPrComment', () => {
  it('creates a comment when no marker comment exists', async () => {
    const { impl, calls } = fakeFetch([
      { json: [{ id: 1, body: 'unrelated comment' }] },
      { json: { html_url: 'https://github.com/k35o/storybook-addon-vrt/pull/12#issuecomment-9' } },
    ]);

    const result = await upsertPrComment(target, `${COMMENT_MARKER}\nhello`, {}, impl);

    expect(result).toEqual({
      action: 'created',
      url: 'https://github.com/k35o/storybook-addon-vrt/pull/12#issuecomment-9',
    });
    expect(calls[1]).toEqual({
      url: 'https://api.github.com/repos/k35o/storybook-addon-vrt/issues/12/comments',
      method: 'POST',
      body: { body: `${COMMENT_MARKER}\nhello` },
    });
  });

  it('updates the existing marker comment in place', async () => {
    const { impl, calls } = fakeFetch([
      { json: [{ id: 5, body: `${COMMENT_MARKER}\nold` }] },
      { json: { html_url: 'https://github.com/k35o/storybook-addon-vrt/pull/12#issuecomment-5' } },
    ]);

    const result = await upsertPrComment(target, 'new body', {}, impl);

    expect(result.action).toBe('updated');
    expect(calls[1]).toEqual({
      url: 'https://api.github.com/repos/k35o/storybook-addon-vrt/issues/comments/5',
      method: 'PATCH',
      body: { body: 'new body' },
    });
  });

  it('skips creating under onlyUpdate when no marker comment exists', async () => {
    const { impl, calls } = fakeFetch([{ json: [] }]);

    const result = await upsertPrComment(target, 'body', { onlyUpdate: true }, impl);

    expect(result).toEqual({ action: 'skipped', url: null });
    expect(calls).toHaveLength(1);
  });

  it('explains the fork-PR token restriction on 403', async () => {
    const { impl } = fakeFetch([{ json: [] }, { status: 403, json: { message: 'Forbidden' } }]);

    await expect(upsertPrComment(target, 'body', {}, impl)).rejects.toThrow(/fork PR/);
  });
});

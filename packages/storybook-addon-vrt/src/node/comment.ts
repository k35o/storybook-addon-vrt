import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { VrtReport, VrtReportItem } from '../types';
import { VrtConfigError } from './config';
import { detailOf, FAILING_STATUSES, storyOf } from './github';

/** Hidden marker that lets `svrt comment` find and update its own comment. */
export const COMMENT_MARKER = '<!-- storybook-addon-vrt -->';

export function findingsOf(report: VrtReport): VrtReportItem[] {
  return report.items.filter((item) => FAILING_STATUSES.has(item.status));
}

export type BuildCommentOptions = {
  /**
   * Public URL serving the VRT base dir contents (the same tree `report.html`
   * references relatively). When set, the comment embeds expected/actual/diff
   * images and links `<reportUrl>/report.html`; without it the comment
   * degrades to a text summary pointing at the CI artifact.
   */
  reportUrl?: string;
  /** Max findings rendered in detail before collapsing to a count. */
  maxEntries?: number;
};

function imageUrl(base: string, relPath: string): string {
  return `${base}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

function imageCell(base: string, relPath: string | null, alt: string): string {
  return relPath === null ? '—' : `![${alt}](${imageUrl(base, relPath)})`;
}

export function buildCommentMarkdown(report: VrtReport, options: BuildCommentOptions = {}): string {
  const maxEntries = options.maxEntries ?? 10;
  const reportUrl = options.reportUrl?.replace(/\/+$/, '');
  const s = report.summary;
  const findings = findingsOf(report);

  const heading =
    findings.length === 0
      ? '## ✅ VRT passed'
      : `## 📸 VRT: ${[
          s.changed > 0 ? `${s.changed} changed` : null,
          s.added > 0 ? `${s.added} added` : null,
          s.removed > 0 ? `${s.removed} removed` : null,
        ]
          .filter((part) => part !== null)
          .join(' · ')}`;

  const mode =
    report.run.mode === 'changed'
      ? `incremental${report.run.ref ? ` vs \`${report.run.ref}\`` : ''}`
      : 'full run';
  const escalated = report.run.escalation
    ? ` — escalated to full by \`${report.run.escalation.file}\``
    : '';

  const lines = [
    COMMENT_MARKER,
    heading,
    '',
    `Mode: ${mode}${escalated}`,
    '',
    '| passed | changed | added | removed | skipped | carried |',
    '| --: | --: | --: | --: | --: | --: |',
    `| ${s.passed} | ${s.changed} | ${s.added} | ${s.removed} | ${s.skipped} | ${s.carried} |`,
  ];

  const shown = findings.slice(0, maxEntries);
  if (reportUrl !== undefined) {
    for (const item of shown) {
      const { file, name } = storyOf(item.key);
      const detail = detailOf(item);
      lines.push(
        '',
        `#### \`${file}\` › ${name} — \`${item.status}\`${detail ? ` · ${detail}` : ''}`,
        '',
        '| expected | actual | diff |',
        '| --- | --- | --- |',
        `| ${imageCell(reportUrl, item.paths.expected, 'expected')} | ${imageCell(reportUrl, item.paths.actual, 'actual')} | ${imageCell(reportUrl, item.paths.diff, 'diff')} |`,
      );
    }
  } else if (shown.length > 0) {
    lines.push('', '| status | story | detail |', '| --- | --- | --- |');
    for (const item of shown) {
      const { file, name } = storyOf(item.key);
      lines.push(`| \`${item.status}\` | ${file} › **${name}** | ${detailOf(item)} |`);
    }
  }
  if (findings.length > maxEntries) {
    lines.push('', `…and ${findings.length - maxEntries} more.`);
  }

  if (reportUrl !== undefined) {
    lines.push('', `📊 [Open the full report](${reportUrl}/report.html)`);
  } else if (findings.length > 0) {
    lines.push(
      '',
      '_Download the `vrt-report` artifact and open `report.html` for side-by-side diffs._',
    );
  }

  return `${lines.join('\n')}\n`;
}

export function readReportJson(baseDir: string): VrtReport {
  const filePath = path.join(baseDir, 'report.json');
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new VrtConfigError(
      `No report found at ${filePath}. Run "svrt run" or "svrt compare" first.`,
    );
  }
  try {
    return JSON.parse(raw) as VrtReport;
  } catch (error) {
    throw new VrtConfigError(`Failed to parse ${filePath} as JSON: ${(error as Error).message}`);
  }
}

export type CommentTarget = {
  /** `owner/name`. */
  repo: string;
  pr: number;
  token: string;
  apiUrl: string;
};

function readPrNumberFromEvent(): number | undefined {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (eventPath === undefined || eventPath === '') return undefined;
  try {
    const payload = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: { number?: number };
    };
    const number = payload.pull_request?.number;
    return typeof number === 'number' ? number : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves where to post from flags first, then the GitHub Actions
 * environment. PR auto-detection only works on `pull_request` events — a
 * `workflow_run` job (the fork-PR setup) must pass `--pr` explicitly.
 */
export function resolveCommentTarget(flags: { pr?: number; repo?: string } = {}): CommentTarget {
  const repo = flags.repo ?? process.env['GITHUB_REPOSITORY'];
  if (repo === undefined || repo === '') {
    throw new VrtConfigError(
      'Cannot determine the repository. Pass --repo <owner/name> or set GITHUB_REPOSITORY.',
    );
  }
  const pr = flags.pr ?? readPrNumberFromEvent();
  if (pr === undefined) {
    throw new VrtConfigError(
      'Cannot determine the pull request. Pass --pr <number> (auto-detection only works on pull_request events).',
    );
  }
  if (!Number.isInteger(pr) || pr <= 0) {
    throw new VrtConfigError(`Invalid pull request number: ${pr}`);
  }
  // Presence check only — the token is never compared against another value.
  const token = process.env['GITHUB_TOKEN'];
  if (!token) {
    throw new VrtConfigError(
      'GITHUB_TOKEN is not set. In GitHub Actions, pass it via `env: GITHUB_TOKEN: ${{ github.token }}`.',
    );
  }
  const apiUrl = (process.env['GITHUB_API_URL'] || 'https://api.github.com').replace(/\/+$/, '');
  return { repo, pr, token, apiUrl };
}

async function githubRequest(
  target: CommentTarget,
  fetchImpl: typeof fetch,
  method: 'GET' | 'POST' | 'PATCH',
  pathname: string,
  jsonBody?: object,
): Promise<unknown> {
  const response = await fetchImpl(`${target.apiUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${target.token}`,
      'x-github-api-version': '2022-11-28',
      ...(jsonBody !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(jsonBody !== undefined ? { body: JSON.stringify(jsonBody) } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const forkHint =
      response.status === 403
        ? ' — a fork PR runs with a read-only GITHUB_TOKEN; see "Fork pull requests" in the README'
        : '';
    throw new Error(
      `GitHub API ${method} ${pathname} failed with ${response.status}${forkHint}${text ? `: ${text.slice(0, 300)}` : ''}`,
    );
  }
  return response.json();
}

async function findMarkerComment(
  target: CommentTarget,
  fetchImpl: typeof fetch,
): Promise<number | null> {
  for (let page = 1; page <= 10; page++) {
    const comments = (await githubRequest(
      target,
      fetchImpl,
      'GET',
      `/repos/${target.repo}/issues/${target.pr}/comments?per_page=100&page=${page}`,
    )) as Array<{ id: number; body?: string }>;
    const hit = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
    if (hit !== undefined) return hit.id;
    if (comments.length < 100) return null;
  }
  return null;
}

export type UpsertResult = {
  action: 'created' | 'updated' | 'skipped';
  url: string | null;
};

/**
 * Creates or updates the single marker-tagged VRT comment on a PR.
 * `onlyUpdate` refreshes a stale comment (e.g. back to green) without ever
 * creating one — so an all-passed run on a PR that never had findings stays
 * silent.
 */
export async function upsertPrComment(
  target: CommentTarget,
  body: string,
  options: { onlyUpdate?: boolean } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<UpsertResult> {
  const existingId = await findMarkerComment(target, fetchImpl);
  if (existingId === null && options.onlyUpdate) {
    return { action: 'skipped', url: null };
  }
  if (existingId === null) {
    const created = (await githubRequest(
      target,
      fetchImpl,
      'POST',
      `/repos/${target.repo}/issues/${target.pr}/comments`,
      { body },
    )) as { html_url?: string };
    return { action: 'created', url: created.html_url ?? null };
  }
  const updated = (await githubRequest(
    target,
    fetchImpl,
    'PATCH',
    `/repos/${target.repo}/issues/comments/${existingId}`,
    { body },
  )) as { html_url?: string };
  return { action: 'updated', url: updated.html_url ?? null };
}

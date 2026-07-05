import { appendFileSync } from 'node:fs';
import type { VrtReport, VrtReportItem } from '../types';

export function isGithubActions(): boolean {
  return process.env['GITHUB_ACTIONS'] === 'true';
}

function storyOf(key: string): { file: string; name: string } {
  const slash = key.lastIndexOf('/');
  const file = slash === -1 ? key : key.slice(0, slash);
  const name = (slash === -1 ? key : key.slice(slash + 1)).replace(/\.png$/, '');
  return { file, name };
}

const FAILING = new Set(['changed', 'added', 'removed']);

function detailOf(item: VrtReportItem): string {
  if (item.mismatchedPixels === undefined) return '';
  const ratio = ((item.mismatchRatio ?? 0) * 100).toFixed(2);
  const dims = item.dimensions ? ', dimensions differ' : '';
  return `${item.mismatchedPixels}px (${ratio}%${dims})`;
}

/**
 * Appends a markdown summary of the run to the GitHub Actions job summary, so a
 * reviewer sees the verdict, counts, and every failing story without opening an
 * artifact. No-op when `GITHUB_STEP_SUMMARY` is unset.
 */
export function writeGithubStepSummary(report: VrtReport): void {
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file === undefined || file === '') return;
  const s = report.summary;
  const mode =
    report.run.mode === 'changed'
      ? `incremental${report.run.ref ? ` vs \`${report.run.ref}\`` : ''}`
      : 'full run';
  const escalated = report.run.escalation
    ? ` — escalated to full by \`${report.run.escalation.file}\``
    : '';

  const lines = [
    `## ${s.failed ? '❌ VRT failed' : '✅ VRT passed'}`,
    '',
    `Mode: ${mode}${escalated}`,
    '',
    '| passed | changed | added | removed | skipped | carried |',
    '| --: | --: | --: | --: | --: | --: |',
    `| ${s.passed} | ${s.changed} | ${s.added} | ${s.removed} | ${s.skipped} | ${s.carried} |`,
    '',
  ];

  const failing = report.items.filter((i) => FAILING.has(i.status));
  if (failing.length > 0) {
    lines.push('| status | story | detail |', '| --- | --- | --- |');
    for (const item of failing.slice(0, 50)) {
      const { file: f, name } = storyOf(item.key);
      lines.push(`| \`${item.status}\` | ${f} › **${name}** | ${detailOf(item)} |`);
    }
    if (failing.length > 50) lines.push('', `…and ${failing.length - 50} more.`);
    lines.push(
      '',
      '_Download the `vrt-report` artifact and open `report.html` for side-by-side diffs._',
    );
  }

  appendFileSync(file, `${lines.join('\n')}\n`);
}

function escapeAnnotation(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/**
 * Emits `::error` workflow annotations for failing stories (capped, then a
 * `::notice` with the remainder). `filePrefix` makes the annotation's `file=`
 * repo-root-relative so it attaches inline in a monorepo package.
 */
export function writeGithubAnnotations(report: VrtReport, filePrefix = ''): void {
  const failing = report.items.filter((i) => FAILING.has(i.status));
  const cap = 10;
  for (const item of failing.slice(0, cap)) {
    const { file, name } = storyOf(item.key);
    const detail = detailOf(item);
    const message = escapeAnnotation(`VRT ${item.status}: ${name}${detail ? ` — ${detail}` : ''}`);
    const target = escapeAnnotation(filePrefix ? `${filePrefix}/${file}` : file);
    console.log(`::error file=${target},title=VRT ${item.status}::${message}`);
  }
  if (failing.length > cap) {
    console.log(`::notice::VRT: ${failing.length - cap} more finding(s) — see the job summary.`);
  }
}

import { styleText } from 'node:util';
import type { VrtReport, VrtStatus } from '../types';

const STATUS_STYLE: Record<Exclude<VrtStatus, 'passed'>, Parameters<typeof styleText>[0]> = {
  changed: 'red',
  added: 'cyan',
  deleted: 'magenta',
};

export function formatReportSummary(report: VrtReport): string {
  const { summary } = report;
  const lines: string[] = [];

  for (const status of ['changed', 'added', 'deleted'] as const) {
    const items = report.items.filter((item) => item.status === status);
    if (items.length === 0) continue;
    lines.push(styleText(STATUS_STYLE[status], `${status}:`));
    for (const item of items) {
      const detail =
        item.status === 'changed' && item.mismatchedPixels !== undefined
          ? ` (${item.mismatchedPixels}px, ${(item.mismatchRatio === undefined ? 0 : item.mismatchRatio * 100).toFixed(2)}%${item.dimensions ? ', dimensions differ' : ''})`
          : '';
      lines.push(`  ${styleText(STATUS_STYLE[status], '●')} ${item.key}${detail}`);
    }
    lines.push('');
  }

  const counts = [
    styleText('green', `${summary.passed} passed`),
    styleText(summary.changed > 0 ? 'red' : 'dim', `${summary.changed} changed`),
    styleText(summary.added > 0 ? 'cyan' : 'dim', `${summary.added} added`),
    styleText(summary.deleted > 0 ? 'magenta' : 'dim', `${summary.deleted} deleted`),
  ].join(styleText('dim', ' | '));
  lines.push(`${counts} ${styleText('dim', `(${summary.total} total)`)}`);
  lines.push(
    summary.failed
      ? styleText(['red', 'bold'], 'VRT failed')
      : styleText(['green', 'bold'], 'VRT passed'),
  );
  return lines.join('\n');
}

export function printReportSummary(report: VrtReport): void {
  console.info(formatReportSummary(report));
}

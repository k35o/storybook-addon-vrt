import { styleText } from 'node:util';
import type { VrtReport, VrtStatus } from '../types';

type Color = Parameters<typeof styleText>[0];

const STATUS_STYLE: Record<Exclude<VrtStatus, 'passed'>, Color> = {
  changed: 'red',
  added: 'cyan',
  removed: 'magenta',
  skipped: 'yellow',
  carried: 'gray',
};

// Statuses listed item-by-item; the rest (skipped/carried) can be numerous, so
// they are only summarised, never enumerated.
const ITEMIZED = ['changed', 'added', 'removed'] as const;

export function formatReportSummary(report: VrtReport): string {
  const { summary } = report;
  const lines: string[] = [];

  for (const status of ITEMIZED) {
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
    styleText(summary.removed > 0 ? 'magenta' : 'dim', `${summary.removed} removed`),
  ];
  if (summary.skipped > 0) counts.push(styleText('yellow', `${summary.skipped} skipped`));
  if (summary.carried > 0) counts.push(styleText('gray', `${summary.carried} carried`));
  lines.push(
    `${counts.join(styleText('dim', ' | '))} ${styleText('dim', `(${summary.total} total)`)}`,
  );

  if (summary.carried > 0) {
    lines.push(
      styleText(
        'dim',
        `${summary.carried} baseline(s) not selected by --changed — not verified this run; a full run is the backstop.`,
      ),
    );
  }

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

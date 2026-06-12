import { describe, expect, it } from 'vitest';
import type { VrtReport } from '../types';
import { renderReportHtml } from './html';

function makeReport(): VrtReport {
  return {
    version: 1,
    createdAt: '2026-06-12T00:00:00.000Z',
    options: { threshold: 0.1, failOn: ['changed', 'added', 'deleted'] },
    dirs: { expected: 'expected', actual: 'actual', diff: 'diff' },
    summary: {
      total: 1,
      passed: 0,
      changed: 1,
      added: 0,
      deleted: 0,
      failed: true,
    },
    items: [
      {
        key: 'src/button.stories.tsx/Primary.png',
        status: 'changed',
        paths: {
          expected: 'expected/src/button.stories.tsx/Primary.png',
          actual: 'actual/src/button.stories.tsx/Primary.png',
          diff: 'diff/src/button.stories.tsx/Primary.png',
        },
        mismatchedPixels: 12,
        mismatchRatio: 0.001,
      },
    ],
  };
}

describe('renderReportHtml', () => {
  it('embeds the report data as JSON', () => {
    const html = renderReportHtml(makeReport());

    expect(html).toContain('<script type="application/json" id="report-data">');
    expect(html).toContain('src/button.stories.tsx/Primary.png');
  });

  it('escapes closing script sequences inside the payload', () => {
    const report = makeReport();
    const item = report.items[0];
    if (!item) throw new Error('fixture must contain one item');
    item.key = 'evil</script><script>alert(1)</script>.png';

    const html = renderReportHtml(report);

    expect(html).not.toContain('evil</script>');
    expect(html).toContain('evil<\\/script>');
  });
});

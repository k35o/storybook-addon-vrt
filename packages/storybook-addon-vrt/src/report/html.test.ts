import { describe, expect, it } from 'vitest';
import type { VrtReport } from '../types';
import { renderReportHtml } from './html';

function makeReport(): VrtReport {
  return {
    version: 2,
    createdAt: '2026-06-12T00:00:00.000Z',
    run: { mode: 'full', ref: null, escalation: null },
    options: { threshold: 0.1, failOn: ['changed', 'added', 'removed'] },
    dirs: { expected: 'expected', actual: 'actual', diff: 'diff' },
    summary: {
      total: 1,
      passed: 0,
      changed: 1,
      added: 0,
      removed: 0,
      skipped: 0,
      carried: 0,
      failed: true,
    },
    items: [
      {
        key: 'src/button.stories.tsx/Primary.png',
        status: 'changed',
        reason: 'pixel-diff',
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

  it('renders a search field for filtering files and stories', () => {
    const html = renderReportHtml(makeReport());

    expect(html).toContain('id="search"');
    expect(html).toContain('aria-label="Filter files and stories"');
    // The query narrows the list against the combined file/story path.
    expect(html).toContain('matchesTerms');
  });

  it('wires the search field as an accessible combobox over the list', () => {
    const html = renderReportHtml(makeReport());

    // Combobox over a listbox, with a polite live region for result counts.
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-controls="list"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain('id="search-status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('splits the query on real whitespace, not the letter "s"', () => {
    const html = renderReportHtml(makeReport());

    // Inside the template literal a single backslash collapses, so the
    // emitted regex must carry an escaped whitespace class.
    expect(html).toContain('.split(/\\s+/)');
    expect(html).not.toContain('.split(/s+/)');
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

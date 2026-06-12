import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VrtReport } from '../types';

/**
 * Renders a fully self-contained report page. Images are referenced
 * relatively, so the report works as long as it sits inside baseDir —
 * locally or downloaded as a single CI artifact.
 */
export function renderReportHtml(report: VrtReport): string {
  // `</script>` inside the JSON payload would terminate the script tag.
  const payload = JSON.stringify(report).replaceAll('</', '<\\/');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VRT Report</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: light-dark(#fafaf9, #1c1917);
    --fg: light-dark(#1c1917, #fafaf9);
    --muted: light-dark(#78716c, #a8a29e);
    --card: light-dark(#ffffff, #292524);
    --border: light-dark(#e7e5e4, #44403c);
    --passed: #16a34a;
    --changed: #dc2626;
    --added: #0891b2;
    --deleted: #c026d3;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font-family: ui-sans-serif, system-ui, sans-serif;
    line-height: 1.6;
  }
  header {
    padding: 1.5rem 2rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
  .meta { color: var(--muted); font-size: 0.8rem; }
  main { padding: 1rem 2rem 4rem; max-width: 80rem; margin-inline: auto; }
  .tabs { display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }
  .tab {
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--fg);
    border-radius: 999px;
    padding: 0.35rem 1rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .tab[aria-pressed='true'] { border-color: currentColor; }
  .tab .count { font-weight: 700; }
  .tab.changed { color: var(--changed); }
  .tab.added { color: var(--added); }
  .tab.deleted { color: var(--deleted); }
  .tab.passed { color: var(--passed); }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    margin-bottom: 1.25rem;
    overflow: hidden;
  }
  .card > h2 {
    font-size: 0.85rem;
    font-weight: 600;
    margin: 0;
    padding: 0.75rem 1rem;
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--border);
  }
  .badge {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    color: #fff;
  }
  .badge.changed { background: var(--changed); }
  .badge.added { background: var(--added); }
  .badge.deleted { background: var(--deleted); }
  .badge.passed { background: var(--passed); }
  .metrics { color: var(--muted); font-size: 0.75rem; font-weight: 400; }
  .modes { display: flex; gap: 0.25rem; padding: 0.5rem 1rem 0; }
  .modes button {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    border-radius: 0.4rem;
    font-size: 0.75rem;
    padding: 0.2rem 0.7rem;
    cursor: pointer;
  }
  .modes button[aria-pressed='true'] { color: var(--fg); border-color: var(--fg); }
  .viewer { padding: 1rem; }
  .columns { display: flex; gap: 0.75rem; align-items: flex-start; }
  .columns figure { margin: 0; flex: 1; min-width: 0; }
  .columns figcaption {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.25rem;
  }
  .viewer img {
    max-width: 100%;
    display: block;
    border: 1px solid var(--border);
    background:
      repeating-conic-gradient(light-dark(#f5f5f4, #3a3633) 0% 25%, transparent 0% 50%)
      0 0 / 16px 16px;
  }
  .overlay { position: relative; display: inline-block; max-width: 100%; }
  .overlay img + img { position: absolute; inset: 0; clip-path: inset(0 0 0 var(--clip, 50%)); }
  .overlay input[type='range'] { width: 100%; display: block; margin-top: 0.5rem; }
  .empty { color: var(--muted); padding: 2rem 0; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>VRT Report</h1>
  <div class="meta" id="meta"></div>
</header>
<main>
  <div class="tabs" id="tabs"></div>
  <div id="items"></div>
</main>
<script type="application/json" id="report-data">${payload}</script>
<script>
(() => {
  const report = JSON.parse(document.getElementById('report-data').textContent);
  const STATUSES = ['changed', 'added', 'deleted', 'passed'];
  const visible = new Set(STATUSES.filter((s) => s !== 'passed'));

  document.getElementById('meta').textContent =
    new Date(report.createdAt).toLocaleString() +
    ' — threshold ' + report.options.threshold +
    ', failOn: ' + report.options.failOn.join(', ');

  const tabs = document.getElementById('tabs');
  for (const status of STATUSES) {
    const count = report.summary[status];
    const button = document.createElement('button');
    button.className = 'tab ' + status;
    const countLabel = document.createElement('span');
    countLabel.className = 'count';
    countLabel.textContent = String(count);
    button.append(countLabel, document.createTextNode(' ' + status));
    button.setAttribute('aria-pressed', String(visible.has(status)));
    button.addEventListener('click', () => {
      visible.has(status) ? visible.delete(status) : visible.add(status);
      button.setAttribute('aria-pressed', String(visible.has(status)));
      render();
    });
    tabs.append(button);
  }

  const image = (src, caption) => {
    const figure = document.createElement('figure');
    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.append(figcaption);
    }
    const img = document.createElement('img');
    img.src = src;
    img.loading = 'lazy';
    figure.append(img);
    return figure;
  };

  const viewers = {
    'side-by-side'(item) {
      const columns = document.createElement('div');
      columns.className = 'columns';
      if (item.paths.expected) columns.append(image(item.paths.expected, 'expected'));
      if (item.paths.actual) columns.append(image(item.paths.actual, 'actual'));
      if (item.paths.diff) columns.append(image(item.paths.diff, 'diff'));
      return columns;
    },
    slider(item) {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const expected = image(item.paths.expected).querySelector('img');
      const actual = image(item.paths.actual).querySelector('img');
      overlay.append(expected, actual);
      const range = document.createElement('input');
      range.type = 'range';
      range.min = '0';
      range.max = '100';
      range.value = '50';
      range.addEventListener('input', () => {
        overlay.style.setProperty('--clip', range.value + '%');
      });
      const wrap = document.createElement('div');
      wrap.append(overlay, range);
      return wrap;
    },
    blink(item) {
      const figure = image(item.paths.expected);
      const img = figure.querySelector('img');
      let showActual = false;
      const timer = setInterval(() => {
        if (!img.isConnected) { clearInterval(timer); return; }
        showActual = !showActual;
        img.src = showActual ? item.paths.actual : item.paths.expected;
      }, 700);
      return figure;
    },
  };

  function card(item) {
    const element = document.createElement('section');
    element.className = 'card';
    const heading = document.createElement('h2');
    const badge = document.createElement('span');
    badge.className = 'badge ' + item.status;
    badge.textContent = item.status;
    heading.append(badge, document.createTextNode(item.key));
    if (item.mismatchedPixels !== undefined) {
      const metrics = document.createElement('span');
      metrics.className = 'metrics';
      metrics.textContent =
        item.mismatchedPixels + 'px (' + (item.mismatchRatio * 100).toFixed(2) + '%)' +
        (item.dimensions
          ? ' — ' + item.dimensions.expected.join('×') + ' → ' + item.dimensions.actual.join('×')
          : '');
      heading.append(metrics);
    }
    element.append(heading);

    const viewer = document.createElement('div');
    viewer.className = 'viewer';
    const hasBoth = item.paths.expected && item.paths.actual;
    if (hasBoth) {
      const modes = document.createElement('div');
      modes.className = 'modes';
      for (const mode of Object.keys(viewers)) {
        const button = document.createElement('button');
        button.textContent = mode;
        button.setAttribute('aria-pressed', String(mode === 'side-by-side'));
        button.addEventListener('click', () => {
          for (const sibling of modes.children) sibling.setAttribute('aria-pressed', 'false');
          button.setAttribute('aria-pressed', 'true');
          viewer.replaceChildren(viewers[mode](item));
        });
        modes.append(button);
      }
      element.append(modes);
      viewer.append(viewers['side-by-side'](item));
    } else {
      viewer.append(viewers['side-by-side'](item));
    }
    element.append(viewer);
    return element;
  }

  function render() {
    const container = document.getElementById('items');
    container.replaceChildren();
    const items = report.items.filter((item) => visible.has(item.status));
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nothing to show for the selected statuses.';
      container.append(empty);
      return;
    }
    const order = { changed: 0, added: 1, deleted: 2, passed: 3 };
    for (const item of [...items].sort((a, b) => order[a.status] - order[b.status])) {
      container.append(card(item));
    }
  }

  render();
})();
</script>
</body>
</html>
`;
}

export async function writeReportHtml(report: VrtReport, baseDir: string): Promise<string> {
  const filePath = path.join(baseDir, 'report.html');
  await mkdir(baseDir, { recursive: true });
  await writeFile(filePath, renderReportHtml(report));
  return filePath;
}

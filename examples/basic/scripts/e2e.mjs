#!/usr/bin/env node
// Hermetic end-to-end check of capture → compare → approve. It commits no
// pixel baselines: the baseline is created from the run itself, so the test
// is independent of the OS/font rendering it runs on.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vrtDir = path.join(root, '.vrt');
const actualDir = path.join(vrtDir, 'actual');
const expectedDir = path.join(vrtDir, 'expected');

function run(args, env = {}) {
  const result = spawnSync('pnpm', ['exec', ...args], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

function fail(message) {
  console.error(`e2e: FAILED — ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// Storybook derives story names from export names ("MaskedTimestamp" →
// "Masked Timestamp"), and the capture hook replaces spaces with hyphens.
const KEYS = {
  primary: 'src/button.stories.tsx/Primary.png',
  clicked: 'src/button.stories.tsx/Clicked.png',
  skipped: 'src/button.stories.tsx/Skipped-In-Vrt.png',
  cardDefault: 'src/card.stories.tsx/Default.png',
  cardMasked: 'src/card.stories.tsx/Masked-Timestamp.png',
};

// 1. Capture every story.
rmSync(vrtDir, { recursive: true, force: true });
assert(
  run(['vitest', 'run', '--project=storybook'], { VRT: '1' }) === 0,
  'vitest capture run must succeed',
);
for (const key of [KEYS.primary, KEYS.clicked, KEYS.cardDefault, KEYS.cardMasked]) {
  assert(existsSync(path.join(actualDir, key)), `missing actual screenshot: ${key}`);
}
assert(
  !existsSync(path.join(actualDir, KEYS.skipped)),
  'story with parameters.vrt.skip must not be captured',
);

// 2. Promote everything to baseline → compare must pass.
cpSync(actualDir, expectedDir, { recursive: true });
assert(run(['svrt', 'compare']) === 0, 'compare against identical baseline must pass');

// 3. Simulate a change, a new story and a removed story.
copyFileSync(path.join(expectedDir, KEYS.cardDefault), path.join(expectedDir, KEYS.primary)); // baseline now differs from actual → changed
rmSync(path.join(expectedDir, KEYS.clicked)); // actual without baseline → added
copyFileSync(
  path.join(expectedDir, KEYS.cardDefault),
  path.join(expectedDir, 'src/card.stories.tsx/Ghost.png'),
); // baseline without actual → deleted

const exitCode = run(['svrt', 'compare']);
assert(exitCode === 1, `compare with differences must exit 1 (got ${exitCode})`);

const report = JSON.parse(readFileSync(path.join(vrtDir, 'report.json'), 'utf8'));
assert(report.summary.changed === 1, `expected 1 changed, got ${report.summary.changed}`);
assert(report.summary.added === 1, `expected 1 added, got ${report.summary.added}`);
assert(report.summary.deleted === 1, `expected 1 deleted, got ${report.summary.deleted}`);
assert(existsSync(path.join(vrtDir, 'report.html')), 'report.html must be written');

const changed = report.items.find((item) => item.status === 'changed');
assert(changed?.key === KEYS.primary, `changed item must be ${KEYS.primary}`);
assert(
  existsSync(path.join(vrtDir, changed.paths.diff)),
  'diff image must be written for the changed item',
);

// 4. Approve → compare must pass again.
assert(run(['svrt', 'approve']) === 0, 'approve must succeed');
assert(run(['svrt', 'compare']) === 0, 'compare after approve must pass');

console.info('e2e: all assertions passed');

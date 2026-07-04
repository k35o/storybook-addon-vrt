#!/usr/bin/env node
// Hermetic end-to-end check of capture → compare → approve. It commits no
// pixel baselines: the baseline is created from the run itself, so the test
// is independent of the OS/font rendering it runs on.
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vrtDir = path.join(root, '.vrt');
const actualDir = path.join(vrtDir, 'actual');
const expectedDir = path.join(vrtDir, 'expected');

// Resolve the CLI through the package exports instead of the `svrt` bin:
// pnpm only links workspace bins whose target exists at install time, and
// in CI the install happens before the build.
const require = createRequire(import.meta.url);
const cliPath = path.join(
  path.dirname(require.resolve('storybook-addon-vrt/package.json')),
  'dist',
  'cli.mjs',
);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  return result.status ?? 1;
}

function svrt(...args) {
  return run('node', [cliPath, ...args]);
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
  run('pnpm', ['exec', 'vitest', 'run', '--project=storybook'], { VRT: '1' }) === 0,
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
assert(svrt('compare') === 0, 'compare against identical baseline must pass');

// 3. Simulate a change, a new story and a removed story.
copyFileSync(path.join(expectedDir, KEYS.cardDefault), path.join(expectedDir, KEYS.primary)); // baseline now differs from actual → changed
rmSync(path.join(expectedDir, KEYS.clicked)); // actual without baseline → added
copyFileSync(
  path.join(expectedDir, KEYS.cardDefault),
  path.join(expectedDir, 'src/card.stories.tsx/Ghost.png'),
); // baseline without actual → removed (full run)

const exitCode = svrt('compare');
assert(exitCode === 1, `compare with differences must exit 1 (got ${exitCode})`);

const report = JSON.parse(readFileSync(path.join(vrtDir, 'report.json'), 'utf8'));
assert(report.summary.changed === 1, `expected 1 changed, got ${report.summary.changed}`);
assert(report.summary.added === 1, `expected 1 added, got ${report.summary.added}`);
assert(report.summary.removed === 1, `expected 1 removed, got ${report.summary.removed}`);
assert(existsSync(path.join(vrtDir, 'report.html')), 'report.html must be written');

const changed = report.items.find((item) => item.status === 'changed');
assert(changed?.key === KEYS.primary, `changed item must be ${KEYS.primary}`);
assert(
  existsSync(path.join(vrtDir, changed.paths.diff)),
  'diff image must be written for the changed item',
);

// 4. Approve without --prune keeps the orphaned baseline (safety default).
assert(svrt('approve') === 0, 'approve must succeed');
assert(
  existsSync(path.join(expectedDir, 'src/card.stories.tsx/Ghost.png')),
  'approve without --prune must keep orphaned baselines',
);
assert(svrt('compare') === 1, 'compare must still fail while the orphan remains');

// 5. Approve with --prune removes it → compare passes again.
assert(svrt('approve', '--prune') === 0, 'approve --prune must succeed');
assert(
  !existsSync(path.join(expectedDir, 'src/card.stories.tsx/Ghost.png')),
  'approve --prune must delete orphaned baselines',
);
assert(svrt('compare') === 0, 'compare after approve --prune must pass');

console.info('e2e: all assertions passed');

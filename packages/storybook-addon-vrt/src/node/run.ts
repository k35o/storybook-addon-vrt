import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ResolvedVrtConfig } from '../types';
import { VrtConfigError } from './config';
import type { VrtPlan } from './plan';

/**
 * Wipes the actual/diff/uncaptured slate and writes the run manifest BEFORE
 * Vitest starts, so a `--changed` run that selects zero test files still leaves
 * consistent state and a mode-aware run.json (the plugin's globalSetup stands
 * down when it sees `__VRT_SETUP_DONE__`).
 */
export function prepareRun(config: ResolvedVrtConfig, plan: VrtPlan): void {
  for (const dir of [config.actualDir, config.diffDir, config.uncapturedDir]) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(config.baseDir, { recursive: true });
  writeFileSync(
    path.join(config.baseDir, 'run.json'),
    `${JSON.stringify(
      {
        version: 2,
        mode: plan.mode,
        ref: plan.ref,
        escalation: plan.escalation,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

function resolveVitestBin(root: string): string {
  const require = createRequire(path.join(root, 'package.json'));
  let pkgPath: string;
  try {
    pkgPath = require.resolve('vitest/package.json');
  } catch {
    throw new VrtConfigError(
      `vitest is not installed in this project (looked from ${root}). ` +
        'Install vitest, or capture manually with `VRT=1 vitest run`.',
    );
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['vitest'];
  if (rel === undefined) throw new VrtConfigError('vitest package has no bin entry');
  return path.join(path.dirname(pkgPath), rel);
}

const RESERVED_PASSTHROUGH = new Set(['--changed', '--watch', '-w', '--project', '--ui']);

/**
 * Whether a Vitest arg would fight svrt for control of the run. Besides the
 * exact reserved flags, this catches bundled single-dash short clusters that
 * include `w` (e.g. `-uw`): Vitest keeps watch mode even under `run`, so the
 * spawned process would never exit and the compare step would never happen.
 */
export function isReservedPassthrough(arg: string): boolean {
  if (RESERVED_PASSTHROUGH.has(arg) || RESERVED_PASSTHROUGH.has(arg.split('=')[0] ?? '')) {
    return true;
  }
  return /^-[a-zA-Z]+$/.test(arg) && arg.slice(1).includes('w');
}

export type SpawnVitestOptions = {
  plan: VrtPlan;
  /** Verbatim args after `--`; may not steer selection/watch (svrt owns those). */
  passthrough: string[];
};

/** Spawns `vitest run` with capture enabled, streaming its output. Returns the exit code. */
export function spawnVitest(config: ResolvedVrtConfig, options: SpawnVitestOptions): number {
  const offending = options.passthrough.find(isReservedPassthrough);
  if (offending !== undefined) {
    throw new VrtConfigError(
      `"${offending}" cannot be passed through to Vitest — use svrt's own flags ` +
        '(--changed / --project config) so the git guard and run mode stay correct.',
    );
  }

  const bin = resolveVitestBin(config.root);
  const projectArgs = config.project === false ? [] : [`--project=${config.project}`];
  const args = ['run', ...projectArgs, ...options.plan.vitestArgs, ...options.passthrough];

  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: config.root,
    stdio: 'inherit',
    env: { ...process.env, VRT: '1', __VRT_SETUP_DONE__: '1' },
  });
  if (result.error) {
    throw new VrtConfigError(`failed to start vitest: ${result.error.message}`);
  }
  // A signal (e.g. SIGINT) yields a null status; treat it as a hard failure.
  return result.status ?? 1;
}

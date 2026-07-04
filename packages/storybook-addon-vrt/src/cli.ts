#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { styleText } from 'node:util';
import { cac } from 'cac';
import { approve } from './approve';
import { runCompare, type RunCompareOptions } from './compare/engine';
import { resolveVrtConfig, VrtConfigError, type ResolveVrtConfigInput } from './node/config';
import { repoRoot } from './node/git';
import { isGithubActions, writeGithubAnnotations, writeGithubStepSummary } from './node/github';
import { openInBrowser } from './node/open';
import { computePlan, type VrtPlan } from './node/plan';
import { prepareRun, spawnVitest } from './node/run';
import { printReportSummary } from './report/console';
import { writeReportHtml } from './report/html';
import { writeReportJson } from './report/json';
import type { ResolvedVrtConfig, VrtFailOn, VrtOptions, VrtReport, VrtRunMode } from './types';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

type SharedFlags = {
  config?: string;
  baseDir?: string;
  expectedDir?: string;
  actualDir?: string;
  diffDir?: string;
};

type CompareTuningFlags = {
  threshold?: number | string;
  allowedMismatchedPixels?: number | string;
  allowedMismatchedPixelRatio?: number | string;
  failOn?: string;
};

type CompareFlags = SharedFlags & CompareTuningFlags & { open?: boolean; partial?: boolean };

type RunFlags = SharedFlags &
  CompareTuningFlags & { changed?: string | boolean; strict?: boolean; open?: boolean } & {
    '--'?: string[];
  };

/**
 * Reads the run manifest a capture leaves at `<baseDir>/run.json`. It carries
 * the run mode so compare can classify unexecuted baselines as `carried`
 * (a partial run) rather than a failing `removed`. Missing/unreadable → full.
 */
function readRunInfo(baseDir: string): Pick<RunCompareOptions, 'mode' | 'ref' | 'escalation'> {
  try {
    const raw = readFileSync(path.join(baseDir, 'run.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      mode?: VrtRunMode;
      ref?: string | null;
      escalation?: { file: string; trigger: string } | null;
    };
    return {
      mode: parsed.mode === 'changed' ? 'changed' : 'full',
      ref: parsed.ref ?? null,
      escalation: parsed.escalation ?? null,
    };
  } catch {
    return { mode: 'full', ref: null, escalation: null };
  }
}

function toNumber(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new VrtConfigError(`Expected a number, got "${value}"`);
  }
  return parsed;
}

function resolveFromFlags(flags: SharedFlags, extra: VrtOptions = {}): ResolvedVrtConfig {
  const cli: VrtOptions = {
    ...(flags.baseDir !== undefined ? { baseDir: flags.baseDir } : {}),
    ...(flags.expectedDir !== undefined ? { expectedDir: flags.expectedDir } : {}),
    ...(flags.actualDir !== undefined ? { actualDir: flags.actualDir } : {}),
    ...(flags.diffDir !== undefined ? { diffDir: flags.diffDir } : {}),
    ...extra,
  };
  const input: ResolveVrtConfigInput = { cli };
  if (flags.config !== undefined) input.configFile = flags.config;
  return resolveVrtConfig(input);
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : `Unexpected error: ${String(error)}`;
  console.error(styleText('red', message));
  process.exit(2);
}

/** Resolves config with the compare tuning flags (threshold, allowed pixels, failOn) applied. */
function resolveWithTuning(flags: SharedFlags & CompareTuningFlags): ResolvedVrtConfig {
  return resolveFromFlags(flags, {
    ...(flags.threshold !== undefined ? { threshold: toNumber(flags.threshold) } : {}),
    ...(flags.allowedMismatchedPixels !== undefined
      ? { allowedMismatchedPixels: toNumber(flags.allowedMismatchedPixels) }
      : {}),
    ...(flags.allowedMismatchedPixelRatio !== undefined
      ? { allowedMismatchedPixelRatio: toNumber(flags.allowedMismatchedPixelRatio) }
      : {}),
    ...(flags.failOn !== undefined
      ? { failOn: flags.failOn.split(',').map((s) => s.trim()) as VrtFailOn[] }
      : {}),
  });
}

/** Runs compare, writes report.json/html, prints the summary. Returns the report. */
async function compareAndReport(
  config: ResolvedVrtConfig,
  options: RunCompareOptions,
  open: boolean,
): Promise<VrtReport> {
  const report = await runCompare(config, options);
  await writeReportJson(report, config.baseDir);
  const htmlPath = await writeReportHtml(report, config.baseDir);
  printReportSummary(report);
  console.info(styleText('dim', `Report: ${htmlPath}`));
  if (isGithubActions()) {
    const top = repoRoot(config.root);
    const prefix = top === null ? '' : path.relative(top, config.root).split(path.sep).join('/');
    writeGithubStepSummary(report);
    writeGithubAnnotations(report, prefix);
  }
  if (open) openInBrowser(htmlPath);
  return report;
}

/** Prints the decision a plan represents (mode, ref, escalation/guard, changed count). */
function printPlanBanner(plan: VrtPlan, verbose = false): void {
  const header =
    plan.mode === 'full' && plan.requested === 'changed'
      ? styleText('yellow', `full run (escalated from --changed)`)
      : plan.mode === 'changed'
        ? styleText('cyan', `incremental run${plan.ref ? ` vs ${plan.ref}` : ''}`)
        : styleText('green', 'full run');
  console.info(`svrt · ${header}`);
  if (plan.guard.tripped && plan.guard.message !== null) {
    console.info(styleText('yellow', `  ⚠ ${plan.guard.message}`));
  }
  if (plan.escalation !== null) {
    console.info(
      styleText(
        'dim',
        `  ${plan.escalation.file} matches fullRunTriggers "${plan.escalation.trigger}"`,
      ),
    );
  }
  if (plan.requested === 'changed' && !plan.guard.tripped) {
    console.info(styleText('dim', `  ${plan.changedFiles.length} changed file(s)`));
    if (verbose)
      for (const file of plan.changedFiles) console.info(styleText('dim', `    ${file}`));
  }
  if (verbose) {
    const vitest = ['vitest run', ...plan.vitestArgs].join(' ');
    console.info(styleText('dim', `  → ${vitest}`));
    console.info(styleText('dim', `  → compare mode: ${plan.mode}`));
  }
}

function planFromFlags(
  config: ResolvedVrtConfig,
  changedFlag: string | boolean | undefined,
): VrtPlan {
  const changed = changedFlag !== undefined && changedFlag !== false;
  const base = typeof changedFlag === 'string' ? changedFlag : undefined;
  return computePlan(config, { changed, base });
}

const cli = cac('svrt');

cli
  .option('--config <file>', 'Path to a vrt.config.json')
  .option('--base-dir <dir>', 'Base directory for VRT artifacts (default: .vrt)')
  .option('--expected-dir <dir>', 'Baseline screenshot directory')
  .option('--actual-dir <dir>', 'Captured screenshot directory')
  .option('--diff-dir <dir>', 'Diff image output directory');

cli
  .command('compare', 'Compare actual screenshots against expected baselines')
  .option('--threshold <n>', 'Per-pixel color difference threshold (0-1)')
  .option('--allowed-mismatched-pixels <n>', 'Tolerated mismatched pixel count')
  .option('--allowed-mismatched-pixel-ratio <n>', 'Tolerated mismatched pixel ratio (0-1)')
  .option(
    '--fail-on <list>',
    'Comma separated categories that fail the run (changed,added,removed)',
  )
  .option(
    '--partial',
    'Treat this as a --changed run: baselines with no capture are carried, not removed',
  )
  .option('--open', 'Open the HTML report after comparing')
  .action(async (flags: CompareFlags) => {
    try {
      const config = resolveWithTuning(flags);
      // Explicit --partial wins; otherwise trust the capture's run.json.
      const runInfo = readRunInfo(config.baseDir);
      const compareOptions: RunCompareOptions = flags.partial
        ? { ...runInfo, mode: 'changed' }
        : runInfo;
      const report = await compareAndReport(config, compareOptions, flags.open ?? false);
      process.exit(report.summary.failed ? 1 : 0);
    } catch (error) {
      fail(error);
    }
  });

cli
  .command('run', 'Capture with Vitest, then compare — the one-step VRT command')
  .option('--changed [ref]', 'Incremental: capture only stories affected since <ref> (git)')
  .option(
    '--strict',
    'With --changed, fail (exit 3) instead of falling back to a full run on git errors',
  )
  .option('--threshold <n>', 'Per-pixel color difference threshold (0-1)')
  .option('--allowed-mismatched-pixels <n>', 'Tolerated mismatched pixel count')
  .option('--allowed-mismatched-pixel-ratio <n>', 'Tolerated mismatched pixel ratio (0-1)')
  .option(
    '--fail-on <list>',
    'Comma separated categories that fail the run (changed,added,removed)',
  )
  .option('--open', 'Open the HTML report when there are findings')
  .action(async (flags: RunFlags) => {
    try {
      const config = resolveWithTuning(flags);
      const plan = planFromFlags(config, flags.changed);
      printPlanBanner(plan);
      if (plan.guard.tripped && flags.strict) {
        console.error(
          styleText(
            'red',
            `✗ git preflight failed: ${plan.guard.message}. Refusing to run (--strict).`,
          ),
        );
        process.exit(3);
      }
      prepareRun(config, plan);
      const vitestExit = spawnVitest(config, { plan, passthrough: flags['--'] ?? [] });
      const report = await compareAndReport(
        config,
        { mode: plan.mode, ref: plan.ref, escalation: plan.escalation },
        flags.open ?? false,
      );
      if (vitestExit !== 0) {
        console.error(
          styleText(
            'red',
            `✗ vitest exited with code ${vitestExit} — VRT verification is incomplete`,
          ),
        );
        process.exit(3);
      }
      process.exit(report.summary.failed ? 1 : 0);
    } catch (error) {
      fail(error);
    }
  });

cli
  .command('plan', 'Show what `svrt run` would do, without running Vitest')
  .option('--changed [ref]', 'Plan an incremental run affected since <ref> (git)')
  .option('--json', 'Print the plan as JSON')
  .action((flags: SharedFlags & { changed?: string | boolean; json?: boolean }) => {
    try {
      const config = resolveFromFlags(flags);
      const plan = planFromFlags(config, flags.changed);
      if (flags.json) {
        console.info(JSON.stringify(plan, null, 2));
        return;
      }
      printPlanBanner(plan, true);
    } catch (error) {
      fail(error);
    }
  });

cli
  .command('approve', 'Promote actual screenshots to expected baselines')
  .option('--filter <glob>', 'Only act on screenshot keys matching this glob')
  .option('--prune', 'Also delete baselines whose story produced no screenshot')
  .option('--dry-run', 'Print operations without performing them')
  .action(async (flags: SharedFlags & { filter?: string; prune?: boolean; dryRun?: boolean }) => {
    try {
      const config = resolveFromFlags(flags);
      const result = await approve(config, {
        ...(flags.filter !== undefined ? { filter: flags.filter } : {}),
        ...(flags.prune !== undefined ? { prune: flags.prune } : {}),
        ...(flags.dryRun !== undefined ? { dryRun: flags.dryRun } : {}),
      });
      const prefix = flags.dryRun ? '[dry-run] ' : '';
      for (const key of result.copied) {
        console.info(styleText('dim', `${prefix}copy   ${key}`));
      }
      for (const key of result.deleted) {
        console.info(styleText('magenta', `${prefix}delete ${key}`));
      }
      let summary = `${prefix}${result.copied.length} approved`;
      if (result.deleted.length > 0) {
        summary += `, ${result.deleted.length} orphaned baselines removed`;
      }
      console.info(summary);
      if (result.orphans.length > 0) {
        console.warn(
          styleText(
            'yellow',
            `${result.orphans.length} baseline(s) kept — not captured this run (expected after --changed):`,
          ),
        );
        for (const key of result.orphans.slice(0, 10)) {
          console.warn(styleText('yellow', `  ● ${key}`));
        }
        if (result.orphans.length > 10) {
          console.warn(styleText('yellow', `  …and ${result.orphans.length - 10} more`));
        }
        console.warn(
          styleText(
            'dim',
            'To remove baselines whose story is truly gone, run "svrt approve --prune" after a full "svrt run".',
          ),
        );
      }
    } catch (error) {
      fail(error);
    }
  });

cli.command('report', 'Open the latest HTML report in the browser').action((flags: SharedFlags) => {
  try {
    const config = resolveFromFlags(flags);
    const htmlPath = path.join(config.baseDir, 'report.html');
    if (!existsSync(htmlPath)) {
      throw new VrtConfigError(
        `No report found at ${htmlPath}. Run "svrt run" or "svrt compare" first.`,
      );
    }
    openInBrowser(htmlPath);
  } catch (error) {
    fail(error);
  }
});

cli.help();
cli.version(version);

try {
  cli.parse(process.argv, { run: false });
  if (
    !cli.matchedCommand &&
    cli.args.length === 0 &&
    !cli.options['help'] &&
    !cli.options['version']
  ) {
    cli.outputHelp();
    process.exit(2);
  }
  await cli.runMatchedCommand();
} catch (error) {
  fail(error);
}

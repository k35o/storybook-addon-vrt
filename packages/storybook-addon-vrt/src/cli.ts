#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { styleText } from 'node:util';
import { cac } from 'cac';
import { approve } from './approve';
import { runCompare } from './compare/engine';
import { resolveVrtConfig, VrtConfigError, type ResolveVrtConfigInput } from './node/config';
import { openInBrowser } from './node/open';
import { printReportSummary } from './report/console';
import { writeReportHtml } from './report/html';
import { writeReportJson } from './report/json';
import type { ResolvedVrtConfig, VrtFailOn, VrtOptions } from './types';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

type SharedFlags = {
  config?: string;
  baseDir?: string;
  expectedDir?: string;
  actualDir?: string;
  diffDir?: string;
};

type CompareFlags = SharedFlags & {
  threshold?: number | string;
  allowedMismatchedPixels?: number | string;
  allowedMismatchedPixelRatio?: number | string;
  failOn?: string;
  open?: boolean;
};

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
    'Comma separated categories that fail the run (changed,added,deleted)',
  )
  .option('--open', 'Open the HTML report after comparing')
  .action(async (flags: CompareFlags) => {
    try {
      const config = resolveFromFlags(flags, {
        ...(flags.threshold !== undefined ? { threshold: toNumber(flags.threshold) } : {}),
        ...(flags.allowedMismatchedPixels !== undefined
          ? { allowedMismatchedPixels: toNumber(flags.allowedMismatchedPixels) }
          : {}),
        ...(flags.allowedMismatchedPixelRatio !== undefined
          ? {
              allowedMismatchedPixelRatio: toNumber(flags.allowedMismatchedPixelRatio),
            }
          : {}),
        ...(flags.failOn !== undefined
          ? { failOn: flags.failOn.split(',').map((s) => s.trim()) as VrtFailOn[] }
          : {}),
      });
      const report = await runCompare(config);
      await writeReportJson(report, config.baseDir);
      const htmlPath = await writeReportHtml(report, config.baseDir);
      printReportSummary(report);
      console.info(styleText('dim', `Report: ${htmlPath}`));
      if (flags.open) openInBrowser(htmlPath);
      process.exit(report.summary.failed ? 1 : 0);
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
            `${result.orphans.length} orphaned baseline(s) kept (no screenshot in this run):`,
          ),
        );
        for (const key of result.orphans) {
          console.warn(styleText('yellow', `  ● ${key}`));
        }
        console.warn(
          styleText('yellow', 'Run "svrt approve --prune" after a FULL vitest run to delete them.'),
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
      throw new VrtConfigError(`No report found at ${htmlPath}. Run "svrt compare" first.`);
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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ResolvedVrtConfig, VrtFailOn, VrtOptions, VrtStabilityOptions } from '../types';

export class VrtConfigError extends Error {
  override name = 'VrtConfigError';
}

const FAIL_ON_VALUES: VrtFailOn[] = ['changed', 'added', 'deleted'];

const DEFAULT_STABILITY: Required<VrtStabilityOptions> = {
  retries: 5,
  interval: 100,
  disableAnimations: true,
};

const KNOWN_KEYS = new Set<string>([
  'enabled',
  'baseDir',
  'expectedDir',
  'actualDir',
  'diffDir',
  'browserNameSuffix',
  'stability',
  'threshold',
  'allowedMismatchedPixels',
  'allowedMismatchedPixelRatio',
  'failOn',
]);

function assertType(
  value: unknown,
  type: 'string' | 'number' | 'boolean',
  key: string,
  source: string,
): void {
  if (value !== undefined && typeof value !== type) {
    throw new VrtConfigError(
      `Invalid value for "${key}" in ${source}: expected ${type}, got ${typeof value}`,
    );
  }
}

function validateOptions(options: VrtOptions, source: string): void {
  for (const key of Object.keys(options)) {
    if (!KNOWN_KEYS.has(key)) {
      console.warn(`[vrt] Unknown option "${key}" in ${source} is ignored`);
    }
  }
  assertType(options.enabled, 'boolean', 'enabled', source);
  assertType(options.baseDir, 'string', 'baseDir', source);
  assertType(options.expectedDir, 'string', 'expectedDir', source);
  assertType(options.actualDir, 'string', 'actualDir', source);
  assertType(options.diffDir, 'string', 'diffDir', source);
  assertType(options.browserNameSuffix, 'boolean', 'browserNameSuffix', source);
  assertType(options.threshold, 'number', 'threshold', source);
  assertType(options.allowedMismatchedPixels, 'number', 'allowedMismatchedPixels', source);
  assertType(options.allowedMismatchedPixelRatio, 'number', 'allowedMismatchedPixelRatio', source);
  if (options.stability !== undefined) {
    assertType(options.stability.retries, 'number', 'stability.retries', source);
    assertType(options.stability.interval, 'number', 'stability.interval', source);
    assertType(
      options.stability.disableAnimations,
      'boolean',
      'stability.disableAnimations',
      source,
    );
  }
  if (options.failOn !== undefined) {
    if (
      !Array.isArray(options.failOn) ||
      options.failOn.some((value) => !FAIL_ON_VALUES.includes(value))
    ) {
      throw new VrtConfigError(
        `Invalid value for "failOn" in ${source}: expected an array of ${FAIL_ON_VALUES.join(', ')}`,
      );
    }
  }
}

export function loadConfigFile(cwd: string, explicitPath?: string): VrtOptions | undefined {
  const filePath = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.resolve(cwd, 'vrt.config.json');
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (!explicitPath && code === 'ENOENT') return undefined;
    throw new VrtConfigError(`Failed to read config file ${filePath}: ${code}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new VrtConfigError(`Failed to parse ${filePath} as JSON: ${(error as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new VrtConfigError(`${filePath} must contain a JSON object`);
  }
  const options = parsed as VrtOptions;
  validateOptions(options, filePath);
  return options;
}

export type ResolveVrtConfigInput = {
  /** Vitest project root / CLI working directory. */
  cwd?: string;
  /** Options passed inline to the vitest plugin. */
  inline?: VrtOptions;
  /** Options coming from CLI flags (highest precedence). */
  cli?: VrtOptions;
  /** Explicit path to a vrt.config.json (CLI --config). */
  configFile?: string;
};

/**
 * Resolves the effective config. Precedence per key:
 * CLI flags > inline plugin options > vrt.config.json > defaults.
 */
export function resolveVrtConfig(input: ResolveVrtConfigInput = {}): ResolvedVrtConfig {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (input.inline) validateOptions(input.inline, 'plugin options');
  if (input.cli) validateOptions(input.cli, 'CLI flags');
  const fromFile = loadConfigFile(cwd, input.configFile) ?? {};
  const merged: VrtOptions = { ...fromFile, ...input.inline, ...input.cli };
  const stability: Required<VrtStabilityOptions> = {
    ...DEFAULT_STABILITY,
    ...fromFile.stability,
    ...input.inline?.stability,
    ...input.cli?.stability,
  };

  const baseDir = path.resolve(cwd, merged.baseDir ?? '.vrt');
  return {
    enabled: merged.enabled ?? Boolean(process.env['VRT']),
    root: cwd,
    baseDir,
    expectedDir: merged.expectedDir
      ? path.resolve(cwd, merged.expectedDir)
      : path.join(baseDir, 'expected'),
    actualDir: merged.actualDir
      ? path.resolve(cwd, merged.actualDir)
      : path.join(baseDir, 'actual'),
    diffDir: merged.diffDir ? path.resolve(cwd, merged.diffDir) : path.join(baseDir, 'diff'),
    browserNameSuffix: merged.browserNameSuffix ?? false,
    stability,
    threshold: merged.threshold ?? 0.1,
    allowedMismatchedPixels: merged.allowedMismatchedPixels,
    allowedMismatchedPixelRatio: merged.allowedMismatchedPixelRatio,
    failOn: merged.failOn ?? [...FAIL_ON_VALUES],
  };
}

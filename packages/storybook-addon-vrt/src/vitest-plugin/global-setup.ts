import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VrtRuntimeOptions } from '../types';

type TestProjectLike = {
  config?: { env?: Record<string, string | undefined> };
};

/**
 * Runs once per VRT-enabled `vitest run`: starts from a clean actual/diff/
 * uncaptured slate so a partial run's `.vrt/actual` only ever holds this run's
 * captures. When `svrt run` drives the run it prepares this state itself
 * (before Vitest starts, so a zero-selection `--changed` run is still clean)
 * and sets `__VRT_SETUP_DONE__`, so this hook stands down to avoid a double
 * wipe and to preserve svrt's mode-aware run.json.
 */
export default async function globalSetup(project?: TestProjectLike): Promise<void> {
  if (process.env['__VRT_SETUP_DONE__']) return;
  const raw = project?.config?.env?.['__VRT_OPTIONS__'] ?? process.env['__VRT_OPTIONS__'];
  if (raw === undefined || raw === '') return;
  const options = JSON.parse(raw) as VrtRuntimeOptions;
  await Promise.all([
    rm(options.actualDir, { recursive: true, force: true }),
    rm(options.diffDir, { recursive: true, force: true }),
    rm(options.uncapturedDir, { recursive: true, force: true }),
  ]);
  await mkdir(options.baseDir, { recursive: true });
  await writeFile(
    path.join(options.baseDir, 'run.json'),
    `${JSON.stringify({ version: 2, mode: 'full', createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

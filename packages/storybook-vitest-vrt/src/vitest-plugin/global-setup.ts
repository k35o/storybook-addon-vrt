import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VrtRuntimeOptions } from '../types';

type TestProjectLike = {
  config?: { env?: Record<string, string | undefined> };
};

/**
 * Runs once per VRT-enabled `vitest run`: starts from a clean actual/diff
 * slate so deleted stories are detectable as orphaned baselines.
 */
export default async function globalSetup(project?: TestProjectLike): Promise<void> {
  const raw = project?.config?.env?.['__VRT_OPTIONS__'] ?? process.env['__VRT_OPTIONS__'];
  if (raw === undefined || raw === '') return;
  const options = JSON.parse(raw) as VrtRuntimeOptions;
  await rm(options.actualDir, { recursive: true, force: true });
  await rm(options.diffDir, { recursive: true, force: true });
  await mkdir(options.baseDir, { recursive: true });
  await writeFile(
    path.join(options.baseDir, 'run.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

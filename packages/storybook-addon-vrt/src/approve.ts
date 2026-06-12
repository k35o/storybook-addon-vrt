import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { scanPngs } from './compare/scan';
import type { ResolvedVrtConfig } from './types';

export type ApproveOptions = {
  /** Glob matched against screenshot keys; restricts copies AND deletions. */
  filter?: string;
  dryRun?: boolean;
};

export type ApproveResult = {
  copied: string[];
  deleted: string[];
};

/**
 * Promotes actual screenshots to expected baselines: copies every actual
 * over its expected counterpart and deletes expected files whose story no
 * longer produced a screenshot (orphans).
 */
export async function approve(
  config: ResolvedVrtConfig,
  options: ApproveOptions = {},
): Promise<ApproveResult> {
  const [expected, actual] = await Promise.all([
    scanPngs(config.expectedDir),
    scanPngs(config.actualDir),
  ]);
  const matches = (key: string) =>
    options.filter === undefined || path.matchesGlob(key, options.filter);

  const copied = [...actual.keys()].filter(matches);
  const deleted = [...expected.keys()].filter((key) => !actual.has(key) && matches(key));

  if (!options.dryRun) {
    for (const key of copied) {
      const source = actual.get(key);
      if (!source) continue;
      const target = path.join(config.expectedDir, ...key.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }
    for (const key of deleted) {
      const target = expected.get(key);
      if (target) await rm(target, { force: true });
    }
  }

  return { copied, deleted };
}

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { VrtUncapturedReason } from '../types';

/**
 * Recursively collects every PNG below `dir`.
 * Returns a map of posix-style relative key → absolute file path.
 * A missing directory yields an empty map.
 */
export async function scanPngs(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.png')) {
      continue;
    }
    const absolute = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, absolute).split(path.sep).join('/');
    result.set(key, absolute);
  }
  return new Map([...result.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

const UNCAPTURED_REASONS: readonly VrtUncapturedReason[] = [
  'vrt-skip',
  'test-skipped',
  'test-failed',
];

/**
 * Collects the "uncaptured" markers the capture hook writes for stories that
 * ran but produced no screenshot. Each marker lives at
 * `<uncapturedDir>/<screenshot-key>.json`, so the key is recovered by dropping
 * the trailing `.json`. Returns a map of screenshot key → reason. Unreadable
 * or malformed markers are ignored.
 */
export async function scanUncaptured(dir: string): Promise<Map<string, VrtUncapturedReason>> {
  const result = new Map<string, VrtUncapturedReason>();
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const absolute = path.join(entry.parentPath, entry.name);
    const key = path.relative(dir, absolute).split(path.sep).join('/').slice(0, -'.json'.length);
    let reason: VrtUncapturedReason | undefined;
    try {
      const parsed = JSON.parse(await readFile(absolute, 'utf8')) as { reason?: unknown };
      if (UNCAPTURED_REASONS.includes(parsed.reason as VrtUncapturedReason)) {
        reason = parsed.reason as VrtUncapturedReason;
      }
    } catch {
      // ignore unreadable/malformed markers
    }
    result.set(key, reason ?? 'vrt-skip');
  }
  return result;
}

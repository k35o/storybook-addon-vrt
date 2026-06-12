import { readdir } from 'node:fs/promises';
import path from 'node:path';

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

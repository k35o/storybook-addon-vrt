import path from 'node:path';
import { readFileAtRef } from './git';

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Absolute path of a story's baseline PNG on disk. */
export function baselineAbsPath(repoRoot: string, baselineDir: string, storyId: string): string {
  return path.join(repoRoot, baselineDir, `${storyId}.png`);
}

/** Repo-root-relative posix path of a story's baseline, for `git show <ref>:<path>`. */
export function baselineRefPath(baselineDir: string, storyId: string): string {
  return toPosix(path.join(baselineDir, `${storyId}.png`));
}

/**
 * The committed baseline PNG for a story at a git ref, or null when it was not
 * committed at that ref (a story with no baseline yet → treated as "added").
 * `baselineDir` is repo-root-relative (e.g. `.vrt-live/baseline`).
 */
export function refBaseline(
  repoRoot: string,
  ref: string,
  baselineDir: string,
  storyId: string,
): Buffer | null {
  return readFileAtRef(repoRoot, ref, baselineRefPath(baselineDir, storyId));
}

/**
 * In-memory baseline store for snapshot mode: "freeze the current render as the
 * reference, then diff live edits against it" — the Stage A dev loop, no git
 * involved. Lives for the Storybook dev-server session.
 */
export class SnapshotStore {
  readonly #byStory = new Map<string, Buffer>();

  set(storyId: string, png: Buffer): void {
    this.#byStory.set(storyId, png);
  }

  get(storyId: string): Buffer | null {
    return this.#byStory.get(storyId) ?? null;
  }

  has(storyId: string): boolean {
    return this.#byStory.has(storyId);
  }

  clear(storyId?: string): void {
    if (storyId === undefined) this.#byStory.clear();
    else this.#byStory.delete(storyId);
  }
}

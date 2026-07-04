import { execFileSync } from 'node:child_process';

export type GitResult = { ok: boolean; stdout: string; stderr: string };

/**
 * Runs a git command, never throwing: a non-zero exit or a missing git binary
 * comes back as `ok: false` with whatever git wrote to stderr. Callers decide
 * what a failure means (usually: fall back to a full run).
 */
function git(cwd: string, args: string[]): GitResult {
  try {
    const stdout = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    const err = error as { stderr?: Buffer | string; message?: string };
    const stderr =
      typeof err.stderr === 'string'
        ? err.stderr
        : (err.stderr?.toString('utf8') ?? err.message ?? 'git failed');
    return { ok: false, stdout: '', stderr: stderr.trim() };
  }
}

export function isInsideWorkTree(cwd: string): boolean {
  return git(cwd, ['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true';
}

/** Absolute repository root, or null when `cwd` is not inside a git work tree. */
export function repoRoot(cwd: string): string | null {
  const result = git(cwd, ['rev-parse', '--show-toplevel']);
  return result.ok ? result.stdout.trim() : null;
}

/** Whether the ref resolves to a commit that exists in this (possibly shallow) clone. */
export function refExists(cwd: string, ref: string): boolean {
  return git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok;
}

/**
 * The merge-base SHA between `ref` and HEAD, or null when it cannot be computed
 * (shallow clone with the base outside history, unrelated histories, unknown
 * ref). A null here is the signal that `vitest --changed <ref>` would silently
 * diff against nothing and pass green — the caller must fall back to a full run.
 */
export function mergeBase(cwd: string, ref: string): string | null {
  const result = git(cwd, ['merge-base', ref, 'HEAD']);
  if (!result.ok) return null;
  const sha = result.stdout.trim();
  return sha === '' ? null : sha;
}

/**
 * The set of changed files Vitest's `--changed` would consider, as repo-root-
 * relative posix paths: committed changes since the diff point, plus staged,
 * plus untracked/modified working-tree files. `diffAgainst` is a resolved SHA
 * (merge-base) for a ref-based run, or null for a bare working-tree run.
 *
 * Run this from the repository root (`repoRoot`) so every git subcommand agrees
 * on the path base: `git diff` reports repo-root-relative paths, but `git
 * ls-files` reports cwd-relative and cwd-scoped paths unless given `--full-name`
 * and run from the top — mixing the two (e.g. from a monorepo package dir)
 * yields duplicated, inconsistent keys.
 */
export function changedFiles(repoRootDir: string, diffAgainst: string | null): string[] {
  const files = new Set<string>();
  const add = (result: GitResult) => {
    if (!result.ok) return;
    for (const line of result.stdout.split('\n')) {
      const file = line.trim();
      if (file !== '') files.add(file);
    }
  };
  add(git(repoRootDir, ['diff', '--name-only', diffAgainst ?? 'HEAD']));
  add(git(repoRootDir, ['diff', '--cached', '--name-only']));
  add(
    git(repoRootDir, ['ls-files', '--full-name', '--others', '--modified', '--exclude-standard']),
  );
  return [...files].sort((a, b) => a.localeCompare(b));
}

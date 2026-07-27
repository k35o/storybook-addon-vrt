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

/**
 * Whether a revision string is safe to pass to git as a positional argument.
 *
 * `execFile` never invokes a shell, so there is no shell injection here — but a
 * revision is still passed as its own argv entry, and git reads any entry
 * starting with `-` as an option. A ref of `--output=/tmp/x` therefore turns
 * `git show <ref>:<path>` into a file-writing flag. Refs reach these helpers
 * from user input (a panel text field, a CLI flag), so every helper validates
 * first. Whitespace and control characters are rejected for the same reason.
 */
export function isSafeRef(ref: string): boolean {
  // Hyphens, dots and slashes are legitimate inside a ref (`feature/a-b`,
  // `v1.0-rc1`) — only a *leading* hyphen is the problem. Checked by code
  // point rather than a regex so the intent (reject control characters and
  // whitespace) is explicit, and no lint suppression is needed.
  if (ref.length === 0 || ref.startsWith('-')) return false;
  for (const char of ref) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return false;
  }
  return true;
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
  if (!isSafeRef(ref)) return false;
  return git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok;
}

/** Short SHA a ref currently points at, or null. */
export function resolveRef(cwd: string, ref: string): string | null {
  if (!isSafeRef(ref)) return null;
  const result = git(cwd, ['rev-parse', '--short', `${ref}^{commit}`]);
  return result.ok ? result.stdout.trim() : null;
}

/**
 * The merge-base SHA between `ref` and HEAD, or null when it cannot be computed
 * (shallow clone with the base outside history, unrelated histories, unknown
 * ref). A null here is the signal that `vitest --changed <ref>` would silently
 * diff against nothing and pass green — the caller must fall back to a full run.
 */
export function mergeBase(cwd: string, ref: string): string | null {
  if (!isSafeRef(ref)) return null;
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
 * on the path base.
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

/**
 * Reads a committed file's bytes at `ref` via `git show <ref>:<path>`. `path`
 * must be repo-root-relative posix. Returns null when the path did not exist
 * at that ref (a story with no baseline yet) or git failed.
 */
export function readFileAtRef(cwd: string, ref: string, path: string): Buffer | null {
  if (!isSafeRef(ref)) return null;
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      cwd,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Lists committed files under `dir` at `ref` as repo-root-relative posix paths,
 * via `git ls-tree -r --name-only`. Empty when the ref/dir has none.
 */
export function listFilesAtRef(cwd: string, ref: string, dir: string): string[] {
  if (!isSafeRef(ref)) return [];
  const result = git(cwd, ['ls-tree', '-r', '--name-only', ref, '--', dir]);
  if (!result.ok) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort((a, b) => a.localeCompare(b));
}

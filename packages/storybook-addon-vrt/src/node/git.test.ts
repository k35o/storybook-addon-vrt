import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { changedFiles, isSafeRef, mergeBase, refExists, repoRoot } from './git';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function run(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vrt-git-'));
  tmpDirs.push(dir);
  run(dir, ['init', '-q', '-b', 'main']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'user.name', 'test']);
  run(dir, ['config', 'commit.gpgsign', 'false']);
  await writeFile(path.join(dir, 'a.txt'), 'v1');
  run(dir, ['add', '.']);
  run(dir, ['commit', '-q', '-m', 'first']);
  return dir;
}

const NEWLINE = String.fromCharCode(10);
const TAB = String.fromCharCode(9);

describe('isSafeRef', () => {
  it('accepts real revision syntax', () => {
    for (const ref of [
      'HEAD',
      'main',
      'origin/main',
      'v1.0-rc1',
      'feature/a-b',
      'HEAD~1',
      'a1b2c3d',
    ]) {
      expect(isSafeRef(ref), ref).toBe(true);
    }
  });

  it('rejects option-shaped, empty and whitespace revisions', () => {
    for (const ref of ['', '-x', '--help', '--output=/tmp/x', 'a b', `a${NEWLINE}b`, `a${TAB}b`]) {
      expect(isSafeRef(ref), JSON.stringify(ref)).toBe(false);
    }
  });
});

describe('git helpers reject option-shaped revisions', () => {
  it('refExists and mergeBase refuse them without consulting git', async () => {
    const dir = await makeRepo();
    expect(refExists(dir, 'HEAD')).toBe(true);
    expect(refExists(dir, '--help')).toBe(false);
    expect(refExists(dir, '-x')).toBe(false);
    expect(mergeBase(dir, '--output=/tmp/x')).toBeNull();
  });

  it('changedFiles never lets a revision become a git flag', async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, 'b.txt'), 'new');

    // `git diff --name-only --output=<path>` writes that file. Callers only
    // ever pass a resolved SHA, but the guard has to hold even if that changes.
    const target = path.join(dir, 'PWNED');
    const files = changedFiles(dir, `--output=${target}`);

    expect(existsSync(target)).toBe(false);
    // Falls back to HEAD, so the untracked file is still reported.
    expect(files).toContain('b.txt');
  });

  it('still diffs against a real SHA', async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, 'a.txt'), 'v2');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'second']);
    const first = execFileSync('git', ['rev-parse', 'HEAD~1'], {
      cwd: dir,
      encoding: 'utf8',
    }).trim();

    expect(repoRoot(dir)).not.toBeNull();
    expect(changedFiles(dir, first)).toContain('a.txt');
  });
});

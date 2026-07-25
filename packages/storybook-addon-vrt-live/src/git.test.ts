import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listFilesAtRef, readFileAtRef, refExists, repoRoot, resolveRef } from './git';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function run(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'vrt-live-git-'));
  tmpDirs.push(dir);
  run(dir, ['init', '-q', '-b', 'main']);
  run(dir, ['config', 'user.email', 'test@example.com']);
  run(dir, ['config', 'user.name', 'test']);
  run(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

describe('git ref helpers', () => {
  it('resolves the repo root and confirms HEAD after a commit', async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, 'a.txt'), 'hello');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'first']);

    const root = repoRoot(dir);
    expect(root).not.toBeNull();
    expect(refExists(dir, 'HEAD')).toBe(true);
    expect(resolveRef(dir, 'HEAD')).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('returns null outside a work tree and for an unknown ref', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vrt-live-nogit-'));
    tmpDirs.push(dir);
    expect(repoRoot(dir)).toBeNull();
    const repo = await makeRepo();
    await writeFile(path.join(repo, 'a.txt'), 'x');
    run(repo, ['add', '.']);
    run(repo, ['commit', '-q', '-m', 'c']);
    expect(refExists(repo, 'nope')).toBe(false);
  });

  it('reads a committed binary file byte-for-byte at a ref', async () => {
    const dir = await makeRepo();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0xff, 0xfe]);
    await mkdir(path.join(dir, 'baseline'), { recursive: true });
    await writeFile(path.join(dir, 'baseline', 'Primary.png'), bytes);
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'baseline']);

    const read = readFileAtRef(dir, 'HEAD', 'baseline/Primary.png');
    expect(read).not.toBeNull();
    expect(read?.equals(bytes)).toBe(true);
  });

  it('reads the file as it was at an older ref, not the working tree', async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, 'f.txt'), 'v1');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'v1']);
    await writeFile(path.join(dir, 'f.txt'), 'v2');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'v2']);

    expect(readFileAtRef(dir, 'HEAD~1', 'f.txt')?.toString('utf8')).toBe('v1');
    expect(readFileAtRef(dir, 'HEAD', 'f.txt')?.toString('utf8')).toBe('v2');
  });

  it('returns null for a path absent at the ref', async () => {
    const dir = await makeRepo();
    await writeFile(path.join(dir, 'a.txt'), 'x');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'c']);
    expect(readFileAtRef(dir, 'HEAD', 'missing.png')).toBeNull();
  });

  it('lists committed files under a directory at a ref', async () => {
    const dir = await makeRepo();
    await mkdir(path.join(dir, 'baseline'), { recursive: true });
    await writeFile(path.join(dir, 'baseline', 'A.png'), 'a');
    await writeFile(path.join(dir, 'baseline', 'B.png'), 'b');
    await writeFile(path.join(dir, 'other.txt'), 'o');
    run(dir, ['add', '.']);
    run(dir, ['commit', '-q', '-m', 'c']);

    const listed = listFilesAtRef(dir, 'HEAD', 'baseline');
    expect(listed).toEqual(['baseline/A.png', 'baseline/B.png']);
  });
});

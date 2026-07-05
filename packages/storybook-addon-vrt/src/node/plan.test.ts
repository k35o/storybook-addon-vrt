import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveVrtConfig } from './config';
import { computePlan, matchFullRunTrigger } from './plan';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
};

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, env: GIT_ENV, stdio: 'ignore' });
}

async function writeFileIn(root: string, rel: string, content: string): Promise<void> {
  const filePath = path.join(root, ...rel.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

/** A git repo with one committed baseline, branch `base` pointing at it. */
async function makeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'vrt-plan-'));
  tmpDirs.push(root);
  git(root, ['init', '-b', 'main']);
  await writeFileIn(root, 'src/button.tsx', 'export const Button = 1;\n');
  await writeFileIn(root, 'src/button.stories.tsx', "import './button';\n");
  await writeFileIn(root, '.storybook/preview.ts', 'export default {};\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'init']);
  git(root, ['branch', 'base']);
  return root;
}

describe('matchFullRunTrigger', () => {
  it('matches a repo-root-relative path', () => {
    expect(matchFullRunTrigger('.storybook/preview.ts', ['**/.storybook/**'], '')).toEqual({
      file: '.storybook/preview.ts',
      trigger: '**/.storybook/**',
    });
  });

  it('matches a package-relative form for monorepo globs', () => {
    // git reports 'packages/app/src/tokens.css'; the user wrote 'src/tokens/**'
    expect(
      matchFullRunTrigger('packages/app/src/tokens/x.css', ['src/tokens/**'], 'packages/app'),
    ).toEqual({ file: 'packages/app/src/tokens/x.css', trigger: 'src/tokens/**' });
  });

  it('returns null when nothing matches', () => {
    expect(matchFullRunTrigger('src/button.tsx', ['**/.storybook/**'], '')).toBeNull();
  });
});

describe('computePlan', () => {
  it('plans a full run when --changed is absent', async () => {
    const root = await makeRepo();
    const plan = computePlan(resolveVrtConfig({ cwd: root }), { changed: false });
    expect(plan).toMatchObject({ mode: 'full', requested: 'full', vitestArgs: [] });
    expect(plan.guard.tripped).toBe(false);
  });

  it('falls back to a full run (guard tripped) outside a git repository', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vrt-nogit-'));
    tmpDirs.push(root);
    const plan = computePlan(resolveVrtConfig({ cwd: root }), { changed: true });
    expect(plan.mode).toBe('full');
    expect(plan.guard.tripped).toBe(true);
    expect(plan.vitestArgs).toEqual([]);
  });

  it('falls back to a full run when the base ref cannot be resolved', async () => {
    const root = await makeRepo();
    const plan = computePlan(resolveVrtConfig({ cwd: root }), {
      changed: true,
      base: 'origin/does-not-exist',
    });
    expect(plan.mode).toBe('full');
    expect(plan.guard.tripped).toBe(true);
    expect(plan.guard.message).toMatch(/resolve/);
  });

  it('plans an incremental run when a component file changed', async () => {
    const root = await makeRepo();
    await writeFileIn(root, 'src/button.tsx', 'export const Button = 2;\n');
    const plan = computePlan(resolveVrtConfig({ cwd: root }), { changed: true, base: 'base' });
    expect(plan.mode).toBe('changed');
    expect(plan.escalation).toBeNull();
    expect(plan.changedFiles).toContain('src/button.tsx');
    expect(plan.vitestArgs[0]).toBe('--changed');
    expect(plan.vitestArgs).toHaveLength(2); // ['--changed', <sha>]
  });

  it('escalates to a full run when a fullRunTriggers file changed', async () => {
    const root = await makeRepo();
    await writeFileIn(root, '.storybook/preview.ts', 'export default { tags: [] };\n');
    const plan = computePlan(resolveVrtConfig({ cwd: root }), { changed: true, base: 'base' });
    expect(plan.mode).toBe('full');
    expect(plan.requested).toBe('changed');
    expect(plan.escalation).toEqual({
      file: '.storybook/preview.ts',
      trigger: '**/.storybook/**',
    });
    expect(plan.vitestArgs).toEqual([]);
  });
});

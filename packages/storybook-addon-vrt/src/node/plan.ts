import path from 'node:path';
import type { ResolvedVrtConfig } from '../types';
import { changedFiles, isInsideWorkTree, mergeBase, refExists, repoRoot } from './git';

export type VrtPlan = {
  /** What the user asked for. */
  requested: 'full' | 'changed';
  /** What will actually happen (a changed request can escalate to full). */
  mode: 'full' | 'changed';
  /** Symbolic base ref the user passed (`--changed <ref>`), if any. */
  ref: string | null;
  /** Resolved SHA passed to `vitest --changed`; null for a bare/full run. */
  diffAgainst: string | null;
  /** Repo-root-relative changed files considered (empty for a plain full run). */
  changedFiles: string[];
  /** Set when a changed file matched a fullRunTriggers glob. */
  escalation: { file: string; trigger: string } | null;
  /** Tripped when git cannot produce a trustworthy changeset (V2 guard). */
  guard: { tripped: boolean; message: string | null };
  /** Extra args `svrt run` appends to the Vitest invocation. */
  vitestArgs: string[];
  /** One-line human explanation of the decision. */
  reason: string;
};

/**
 * Returns the first fullRunTriggers glob a changed file matches, testing both
 * the repo-root-relative path (as git reports it) and the package-relative
 * form, so a monorepo user can write `src/tokens/**` against a package that
 * lives at `packages/app`.
 */
export function matchFullRunTrigger(
  file: string,
  triggers: string[],
  packagePrefix: string,
): { file: string; trigger: string } | null {
  const forms = [file];
  if (packagePrefix !== '' && file.startsWith(`${packagePrefix}/`)) {
    forms.push(file.slice(packagePrefix.length + 1));
  }
  for (const trigger of triggers) {
    if (forms.some((form) => path.matchesGlob(form, trigger))) {
      return { file, trigger };
    }
  }
  return null;
}

function fullPlan(reason: string, guardMessage: string | null = null): VrtPlan {
  return {
    requested: 'changed',
    mode: 'full',
    ref: null,
    diffAgainst: null,
    changedFiles: [],
    escalation: null,
    guard: { tripped: guardMessage !== null, message: guardMessage },
    vitestArgs: [],
    reason,
  };
}

export type PlanInput = { changed: boolean; base?: string | undefined };

/**
 * Decides how a run should behave. A `--changed` request falls back to a full
 * run — never a silent green — when git cannot be trusted (not a repo, unknown
 * ref, no merge-base) or when a changed file matches a fullRunTriggers glob.
 */
export function computePlan(config: ResolvedVrtConfig, input: PlanInput): VrtPlan {
  if (!input.changed) {
    return {
      requested: 'full',
      mode: 'full',
      ref: null,
      diffAgainst: null,
      changedFiles: [],
      escalation: null,
      guard: { tripped: false, message: null },
      vitestArgs: [],
      reason: 'full run',
    };
  }

  const root = config.root;
  const top = repoRoot(root);
  if (!isInsideWorkTree(root) || top === null) {
    return { ...fullPlan('not a git repository → full run', 'not a git repository') };
  }

  const base = input.base;
  let diffAgainst: string | null = null;
  if (base !== undefined) {
    if (!refExists(root, base)) {
      return fullPlan(
        `ref "${base}" not found → full run`,
        `git cannot resolve "${base}" (unfetched ref or shallow clone?)`,
      );
    }
    const sha = mergeBase(root, base);
    if (sha === null) {
      return fullPlan(
        `no merge-base with "${base}" → full run`,
        `no merge-base between "${base}" and HEAD (shallow clone? use fetch-depth: 0)`,
      );
    }
    diffAgainst = sha;
  }

  // Run git from the repo root so diff and ls-files share one path base.
  const files = changedFiles(top, diffAgainst);
  const packagePrefix = path.relative(top, root).split(path.sep).join('/');
  for (const file of files) {
    const hit = matchFullRunTrigger(file, config.fullRunTriggers, packagePrefix);
    if (hit) {
      return {
        requested: 'changed',
        mode: 'full',
        ref: base ?? null,
        diffAgainst: null,
        changedFiles: files,
        escalation: hit,
        guard: { tripped: false, message: null },
        vitestArgs: [],
        reason: `escalated to full run: ${hit.file} matches "${hit.trigger}"`,
      };
    }
  }

  return {
    requested: 'changed',
    mode: 'changed',
    ref: base ?? null,
    diffAgainst,
    changedFiles: files,
    escalation: null,
    guard: { tripped: false, message: null },
    vitestArgs: diffAgainst === null ? ['--changed'] : ['--changed', diffAgainst],
    reason: base === undefined ? 'incremental run (working tree)' : `incremental run vs ${base}`,
  };
}

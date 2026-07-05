---
"storybook-addon-vrt": minor
---

Redesign the CLI around a single `svrt run` command and add incremental (changed-only) runs. **Breaking** — see below.

- **`svrt run`** captures with Vitest and compares in one step: it spawns Vitest itself (setting the capture env var for you), prepares a clean slate before Vitest starts, then compares. The two-step `VRT=1 vitest run` + `svrt compare` flow is no longer needed (though `VRT=1 vitest run` still works as an escape hatch).
- **`svrt run --changed [ref]`** captures only the stories a change affects, delegating selection to `vitest --changed`. A git preflight guards Vitest's silent-green failure on shallow clones: it falls back to a full run (loud) on any git error, or exits 3 with `--strict`. `fullRunTriggers` (default `['**/.storybook/**']`) forces a full run for changes the module graph can't see (Storybook config, global CSS, lockfiles).
- **`svrt plan`** previews the run decision (full vs incremental, resolved base, changed files, matched triggers) without launching a browser; `--json` for scripts.
- **New status vocabulary**: `deleted` → `removed`, plus `skipped` (a story that ran but wasn't captured — `vrt.skip`, a skipped/failed test) and `carried` (not selected by `--changed`). `skipped`/`carried` never fail a run and carry a machine-readable `reason`. Fixes a bug where a `vrt.skip` story with an existing baseline failed a full run as `deleted`.
- **`svrt compare --partial`** classifies unexecuted baselines as `carried` instead of `removed`.
- **GitHub Actions output**: under `GITHUB_ACTIONS`, `run`/`compare` write a job-summary table and `::error` annotations for failing stories.
- **report.json is now `version: 2`** with a `run` block (`mode`/`ref`/`escalation`), per-item `reason`, and `summary.removed`/`skipped`/`carried`.
- **New config keys** `fullRunTriggers` and `project`; `failOn` now takes `removed` instead of `deleted`.
- **Exit codes**: `run` adds `3` (a `--strict` guard refusal or a non-zero Vitest exit).

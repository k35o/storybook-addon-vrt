# storybook-addon-vrt

## 0.2.1

### Patch Changes

- Switch release automation from changesets/action to pnpm-release-action (pnpm built-in release management). No runtime changes.

## 0.2.0

### Minor Changes

- [#8](https://github.com/k35o/storybook-addon-vrt/pull/8) [`5a0c2aa`](https://github.com/k35o/storybook-addon-vrt/commit/5a0c2aa2e022cc203a1ee90cbf133bac1564b093) Thanks [@k35o](https://github.com/k35o)! - Add a search box to the HTML report sidebar that filters the file-grouped screenshot list by file path and story name. Whitespace-separated terms match as a conjunction against the combined `file/story` path, matches are highlighted, and the field is keyboard accessible (`/` to focus, `Esc` to clear, arrow keys to navigate).

- [#28](https://github.com/k35o/storybook-addon-vrt/pull/28) [`09a8c39`](https://github.com/k35o/storybook-addon-vrt/commit/09a8c39a651c837b4f9a82fee7904bc5e8ffa3e0) Thanks [@k35o](https://github.com/k35o)! - Redesign the CLI around a single `svrt run` command and add incremental (changed-only) runs. **Breaking** — see below.

  - **`svrt run`** captures with Vitest and compares in one step: it spawns Vitest itself (setting the capture env var for you), prepares a clean slate before Vitest starts, then compares. The two-step `VRT=1 vitest run` + `svrt compare` flow is no longer needed (though `VRT=1 vitest run` still works as an escape hatch).
  - **`svrt run --changed [ref]`** captures only the stories a change affects, delegating selection to `vitest --changed`. A git preflight guards Vitest's silent-green failure on shallow clones: it falls back to a full run (loud) on any git error, or exits 3 with `--strict`. `fullRunTriggers` (default `['**/.storybook/**']`) forces a full run for changes the module graph can't see (Storybook config, global CSS, lockfiles).
  - **`svrt plan`** previews the run decision (full vs incremental, resolved base, changed files, matched triggers) without launching a browser; `--json` for scripts.
  - **New status vocabulary**: `deleted` → `removed`, plus `skipped` (a story that ran but wasn't captured — `vrt.skip`, a skipped/failed test) and `carried` (not selected by `--changed`). `skipped`/`carried` never fail a run and carry a machine-readable `reason`. Fixes a bug where a `vrt.skip` story with an existing baseline failed a full run as `deleted`.
  - **`svrt compare --partial`** classifies unexecuted baselines as `carried` instead of `removed`.
  - **GitHub Actions output**: under `GITHUB_ACTIONS`, `run`/`compare` write a job-summary table and `::error` annotations for failing stories.
  - **report.json is now `version: 2`** with a `run` block (`mode`/`ref`/`escalation`), per-item `reason`, and `summary.removed`/`skipped`/`carried`.
  - **New config keys** `fullRunTriggers` and `project`; `failOn` now takes `removed` instead of `deleted`.
  - **Exit codes**: `run` adds `3` (a `--strict` guard refusal or a non-zero Vitest exit).

## 0.1.0

### Minor Changes

- [`4616cd3`](https://github.com/k35o/storybook-addon-vrt/commit/4616cd3d86848e22845f821825da5b209f6def20) Thanks [@k35o](https://github.com/k35o)! - Initial release: self-contained visual regression testing for Storybook stories running on Vitest browser mode.

  - `vrt()` Vitest plugin that captures a screenshot of every story after render and play function (env-gated via `VRT=1`, zero overhead when disabled)
  - Anti-flake capture pipeline: font readiness, animation disabling, stability retakes, and per-story `parameters.vrt` overrides (`skip` / `delay` / `mask` / `remove` / `capture`)
  - `svrt compare`: classifies screenshots as passed / changed / added / deleted with pixelmatch, writes diff images, `report.json` and a self-contained `report.html`
  - `svrt approve`: promotes actual screenshots to baselines; `--prune` removes orphaned baselines, `--filter` and `--dry-run` scope the operation
  - `svrt report`: opens the HTML report

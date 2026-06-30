# storybook-addon-vrt

## 0.2.0

### Minor Changes

- [#8](https://github.com/k35o/storybook-addon-vrt/pull/8) [`5a0c2aa`](https://github.com/k35o/storybook-addon-vrt/commit/5a0c2aa2e022cc203a1ee90cbf133bac1564b093) Thanks [@k35o](https://github.com/k35o)! - Add a search box to the HTML report sidebar that filters the file-grouped screenshot list by file path and story name. Whitespace-separated terms match as a conjunction against the combined `file/story` path, matches are highlighted, and the field is keyboard accessible (`/` to focus, `Esc` to clear, arrow keys to navigate).

## 0.1.0

### Minor Changes

- [`4616cd3`](https://github.com/k35o/storybook-addon-vrt/commit/4616cd3d86848e22845f821825da5b209f6def20) Thanks [@k35o](https://github.com/k35o)! - Initial release: self-contained visual regression testing for Storybook stories running on Vitest browser mode.

  - `vrt()` Vitest plugin that captures a screenshot of every story after render and play function (env-gated via `VRT=1`, zero overhead when disabled)
  - Anti-flake capture pipeline: font readiness, animation disabling, stability retakes, and per-story `parameters.vrt` overrides (`skip` / `delay` / `mask` / `remove` / `capture`)
  - `svrt compare`: classifies screenshots as passed / changed / added / deleted with pixelmatch, writes diff images, `report.json` and a self-contained `report.html`
  - `svrt approve`: promotes actual screenshots to baselines; `--prune` removes orphaned baselines, `--filter` and `--dry-run` scope the operation
  - `svrt report`: opens the HTML report

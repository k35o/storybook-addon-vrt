---
'storybook-vitest-vrt': minor
---

Initial release: self-contained visual regression testing for Storybook stories running on Vitest browser mode.

- `vrt()` Vitest plugin that captures a screenshot of every story after render and play function (env-gated via `VRT=1`, zero overhead when disabled)
- Anti-flake capture pipeline: font readiness, animation disabling, stability retakes, and per-story `parameters.vrt` overrides (`skip` / `delay` / `mask` / `remove` / `capture`)
- `svrt compare`: classifies screenshots as passed / changed / added / deleted with pixelmatch, writes diff images, `report.json` and a self-contained `report.html`
- `svrt approve`: promotes actual screenshots to baselines and prunes orphans (`--filter`, `--dry-run`)
- `svrt report`: opens the HTML report

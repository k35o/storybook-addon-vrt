# storybook-addon-vrt (workspace)

Self-contained visual regression testing for Storybook stories running on
Vitest browser mode. See the
[package README](./packages/storybook-addon-vrt/README.md) for usage.

## Layout

| Path                            | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `packages/storybook-addon-vrt` | The published library (plugin, runtime, CLI) |
| `examples/basic`                | React + Storybook playground and E2E harness |

## Commands

```sh
pnpm install
pnpm build       # build the library (vp pack)
pnpm test        # unit tests
pnpm e2e         # hermetic end-to-end test via examples/basic
pnpm typecheck
pnpm check       # lint + format (vp check)
pnpm storybook   # run the example's Storybook
```

## Release

Versioning and publishing use
[pnpm's built-in release management](https://pnpm.io/versioning), driven in CI
by [k35o/pnpm-release-action](https://github.com/k35o/pnpm-release-action)
(`.github/workflows/release.yml`). Add a change intent with `pnpm change`
(changesets-format `.changeset/*.md`); merging to `main` opens/updates the
release PR (branch `pnpm-release/main`), and merging that publishes to npm via
OIDC trusted publishing.

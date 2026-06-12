# storybook-vitest-vrt (workspace)

Self-contained visual regression testing for Storybook stories running on
Vitest browser mode. See the
[package README](./packages/storybook-vitest-vrt/README.md) for usage.

## Layout

| Path                            | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `packages/storybook-vitest-vrt` | The published library (plugin, runtime, CLI) |
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

Changesets-based. Add a changeset with `pnpm changeset`; merging to `main`
opens/updates the release PR, and merging that publishes to npm.

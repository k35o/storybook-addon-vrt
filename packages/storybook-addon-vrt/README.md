# storybook-addon-vrt

Self-contained visual regression testing for Storybook stories running on
[Vitest browser mode](https://vitest.dev/guide/browser/) via
[`@storybook/addon-vitest`](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon).

- 📸 **Per-story screenshots** — captured automatically after each story test
  (including play functions), no extra test code.
- 🔍 **Own compare engine** — classifies every screenshot as `passed`,
  `changed` (with a pixel diff image), `added` (new story without a baseline)
  or `deleted` (baseline whose story is gone).
- 📊 **Reports** — console summary, `report.json`, and a self-contained
  `report.html` with side-by-side / slider / blink viewers.
- ✅ **Approval flow** — `svrt approve` promotes captured screenshots to
  baselines; orphaned baselines are only removed with an explicit `--prune`.
- 🪶 **Minimal coupling** — no dependency on Storybook packages and no
  third-party VRT services. The Storybook-facing surface is a duck-typed
  test context plus an optional one-line decorator, so major upgrades of
  Storybook or Vitest are unlikely to break it.

## Requirements

- Storybook 10+ with `@storybook/addon-vitest` configured
- Vitest 4 browser mode with the Playwright provider
- Node.js 22+

## Setup

```sh
npm install --save-dev storybook-addon-vrt
```

Add the `vrt()` plugin to the **same Vitest project** as `storybookTest()`:

```ts
// vitest.config.ts / vite.config.ts
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { vrt } from 'storybook-addon-vrt/vitest-plugin';

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [storybookTest({ configDir: '.storybook' }), vrt()],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', context: { reducedMotion: 'reduce' } }],
          },
        },
      },
    ],
  },
});
```

That's all. VRT is **off by default**; a plain `vitest run` has zero
overhead. Enable it with the `VRT` environment variable:

```sh
VRT=1 vitest run --project=storybook   # capture screenshots into .vrt/actual
npx svrt compare                       # compare against .vrt/expected
npx svrt report                        # open the HTML report
npx svrt approve                       # accept the changes as new baselines
```

`svrt compare` exits with `0` when everything passed, `1` when there are
changed/added/deleted screenshots, and `2` on usage errors.

## How it works

1. The plugin injects a setup file into the Vitest project. Its `afterEach`
   hook runs after every story test — i.e. after rendering **and** the play
   function.
2. The hook waits for `document.fonts.ready`, disables CSS
   animations/transitions/caret, applies story-level masking, and retakes
   screenshots until two consecutive ones hash identically (anti-flake).
3. The PNG is saved as
   `.vrt/actual/<stories-file-path>/<story-name>.png`, e.g.
   `src/components/button/button.stories.tsx/Primary.png`.
4. `svrt compare` walks `.vrt/expected` and `.vrt/actual`, pixel-compares
   pairs with [pixelmatch](https://github.com/mapbox/pixelmatch), and writes
   diff images, `report.json` and `report.html` into `.vrt/`.

A failing story test is never captured, and a screenshot that does not
stabilize logs a warning instead of failing your test run.

## Story parameters

Per-story overrides via `parameters.vrt`:

```ts
export const Dashboard: Story = {
  parameters: {
    vrt: {
      mask: ['[data-timestamp]', '.avatar'], // cover dynamic elements
      remove: '.ads', // drop elements from layout
      delay: 250, // extra ms before capturing
      capture: '#main-panel', // capture an element, not the viewport
    },
  },
};

export const Flaky: Story = {
  parameters: { vrt: { skip: true } }, // test still runs, no screenshot
};
```

| Parameter | Type                   | Description                                                   |
| --------- | ---------------------- | ------------------------------------------------------------- |
| `skip`    | `boolean`              | Skip capturing this story.                                    |
| `delay`   | `number`               | Extra milliseconds to wait before the stability checks.       |
| `mask`    | `string \| string[]`   | CSS selector(s) covered by an opaque overlay.                 |
| `remove`  | `string \| string[]`   | CSS selector(s) removed from layout (`display: none`).        |
| `capture` | `'viewport' \| string` | Capture the viewport (default) or the first matching element. |

The viewport size follows Storybook's own `parameters.viewport`
(addon-vitest applies it before the test runs).

## Options

Options can be set inline (`vrt({ ... })`), in a `vrt.config.json` next to
the Vitest project root, or as CLI flags. Precedence:
**CLI flags > inline plugin options > `vrt.config.json` > defaults**.

| Option                                  | Default                             | Description                                                        |
| --------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| `enabled`                               | `!!process.env.VRT`                 | Inject the capture hook.                                           |
| `baseDir`                               | `.vrt`                              | Root for all VRT artifacts.                                        |
| `expectedDir` / `actualDir` / `diffDir` | `${baseDir}/{expected,actual,diff}` | Individual directory overrides.                                    |
| `threshold`                             | `0.1`                               | pixelmatch per-pixel color threshold (0–1).                        |
| `allowedMismatchedPixels`               | —                                   | Tolerated mismatched pixel count.                                  |
| `allowedMismatchedPixelRatio`           | —                                   | Tolerated mismatched pixel ratio (0–1). Stricter limit wins.       |
| `failOn`                                | `['changed','added','deleted']`     | Categories that make `svrt compare` exit 1.                        |
| `browserNameSuffix`                     | `false`                             | Append `.chromium` etc. to keys (required for multiple instances). |
| `stability.retries`                     | `5`                                 | Max screenshots taken while waiting for a stable image.            |
| `stability.interval`                    | `100`                               | Milliseconds between stability screenshots.                        |
| `stability.disableAnimations`           | `true`                              | Inject animation/transition/caret-killing CSS.                     |

### CLI

```
svrt compare [--threshold <n>] [--allowed-mismatched-pixels <n>]
             [--allowed-mismatched-pixel-ratio <n>] [--fail-on changed,added]
             [--open]
svrt approve [--filter <glob>] [--prune] [--dry-run]
svrt report
```

All commands accept `--config <file>`, `--base-dir`, `--expected-dir`,
`--actual-dir` and `--diff-dir`. The CLI has no dependency on Vitest or
Storybook, so it also runs in lightweight CI containers.

### Optional preview annotation

The capture hook reads `parameters.vrt` from the test context provided by
addon-vitest. If an addon-vitest update ever changes those internals, add
the bundled decorator as a version-proof fallback:

```ts
// .storybook/preview.ts
import vrtPreview from 'storybook-addon-vrt/preview';

export default {
  decorators: [...vrtPreview.decorators],
};
```

## Baseline management

Screenshots only match when they were rendered in the same environment —
**macOS and Linux render fonts differently**, so never compare images
captured on different OSes. Two proven workflows; pick what fits your
project:

### Workflow A — commit baselines, capture in one environment

Commit `.vrt/expected/` to git (add `.vrt/actual/`, `.vrt/diff/`,
`.vrt/report.*` and `.vrt/run.json` to `.gitignore`). Every capture —
locally and in CI — must then run on the same platform. The simplest way is
the Playwright Docker image:

```sh
docker run --rm -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  sh -c "corepack enable pnpm && pnpm install && VRT=1 pnpm vitest run --project=storybook"
npx svrt compare   # compare/approve run anywhere — they only read PNGs
```

- ✅ Instant local comparison, diffs reviewable in the PR itself
- ⚠️ Repository grows with the screenshot count; Docker required for capture

### Workflow B — no committed baselines, compare CI artifacts

Keep `.vrt/` fully ignored. CI captures screenshots on every run; a PR job
downloads the latest `main` artifact as `.vrt/expected` and compares:

```yaml
# capture (every push to main): VRT=1 vitest run → upload .vrt/actual as "vrt-baseline"
# PR job:
- run: VRT=1 pnpm vitest run --project=storybook
- uses: actions/download-artifact@v4 # vrt-baseline from main → .vrt/expected
- run: npx svrt compare
- if: failure()
  uses: actions/upload-artifact@v4 # upload the whole .vrt dir
  with: { name: vrt-report, path: .vrt }
```

`report.html` references images relatively, so the uploaded `.vrt` artifact
opens as a working report after download.

- ✅ Lean repository, environments always match (same CI image)
- ⚠️ Local comparison needs two captures (before/after your change)

## Caveats

- **Partial test runs**: `vitest run --project=storybook some.stories.tsx`
  captures only a subset, so `svrt compare` reports the missing stories as
  `deleted`. `svrt approve` never deletes baselines by default — it keeps
  orphans and warns about them. Pass `--prune` only after a FULL vitest
  run (optionally scoped with `--filter`).
- **Watch mode**: capture is meant for `vitest run`; repeated watch-mode
  reruns thrash the actual directory.
- **Browser updates**: a new Chromium version can shift rendering by a few
  pixels. Pin Playwright and re-approve baselines when bumping it.
- **Multiple browser instances**: enable `browserNameSuffix` so each browser
  writes its own key.

## License

MIT

# storybook-addon-vrt

Self-contained visual regression testing for Storybook stories running on
[Vitest browser mode](https://vitest.dev/guide/browser/) via
[`@storybook/addon-vitest`](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon).

- 📸 **Per-story screenshots** — captured automatically after each story test
  (including play functions), no extra test code.
- 🚀 **One command** — `svrt run` captures with Vitest and compares against
  baselines in a single step; no env var, no ordering to get wrong.
- 🔍 **Honest compare engine** — classifies every screenshot as `passed`,
  `changed` (with a pixel diff image), `added`, `removed`, `skipped`, or
  `carried`, each with a machine-readable reason. "Not verified" is never
  reported as a failure.
- ⚡ **Incremental runs** — opt into `--changed` to capture only the stories a
  PR affects, with a git guard that refuses to pass green on a broken diff.
- 📊 **Reports** — console summary, `report.json`, and a self-contained
  `report.html` with side-by-side / slider / blink viewers.
- 🪶 **Minimal coupling** — no dependency on Storybook packages and no
  third-party VRT services, so major upgrades of Storybook or Vitest are
  unlikely to break it.

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

Commit the baselines, ignore everything else — add to `.gitignore`:

```gitignore
.vrt/
!.vrt/expected/
```

Capture is off unless `svrt run` (or `VRT=1`) turns it on, so a plain
`vitest run` keeps zero overhead.

## Quickstart

```sh
npx svrt run        # capture every story with Vitest, then compare
npx svrt report     # open the HTML diff report
npx svrt approve    # promote the changes to baselines → git add .vrt/expected
```

The first run has no baselines yet, so every story is `added` — run
`svrt approve` once to seed them.

## Commands

`svrt run` is the front door and does the whole loop. The rest are primitives
for split CI jobs, review, and debugging. Every command accepts the global
flags `--config <file>`, `--base-dir`, `--expected-dir`, `--actual-dir`,
`--diff-dir`.

### `svrt run [--changed [ref]] [--strict] [--fail-on <list>] [--open] [-- <vitest args>]`

Resolves the run plan, wipes the actual slate, spawns Vitest with capture
enabled (it sets the env var for you), then compares and writes the report.
Anything after `--` is forwarded verbatim to Vitest.

| Flag                                                                                           | Effect                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--changed [ref]`                                                                              | Incremental: capture only stories affected since `ref` (git). Bare `--changed` uses the uncommitted working tree. See [Incremental runs](#incremental-runs). |
| `--strict`                                                                                     | With `--changed`, exit 3 instead of falling back to a full run when git cannot produce a trustworthy diff.                                                   |
| `--fail-on <list>`                                                                             | Which categories fail the run (default `changed,added,removed`).                                                                                             |
| `--threshold <n>` · `--allowed-mismatched-pixels <n>` · `--allowed-mismatched-pixel-ratio <n>` | Tune the pixel comparison.                                                                                                                                   |
| `--open`                                                                                       | Open the HTML report when there are findings.                                                                                                                |

### `svrt compare [--partial] [--fail-on <list>] [--threshold <n>] [--open]`

Compares `.vrt/actual` against `.vrt/expected` **without** running Vitest —
for split CI (capture in a browser container, compare in a lean one) or
re-tuning a threshold. Reads the run mode from `.vrt/run.json`.

- `--partial` — treat as a `--changed` run: baselines with no capture are
  `carried`, never a failing `removed`.

### `svrt approve [--filter <glob>] [--prune] [--dry-run]`

Copies each actual over its baseline. A story that ran but wasn't captured
(a `vrt.skip`, a failed test) is never treated as an orphan.

- `--filter <glob>` — only act on screenshot keys matching the glob.
- `--prune` — also delete baselines with no capture. Only safe after a
  **full** run.
- `--dry-run` — print the operations without touching files.

### `svrt report`

Opens the self-contained `.vrt/report.html` — a review UI with side-by-side,
slider, and blink diff viewers, filterable by status.

### `svrt plan [--changed [ref]] [--json]`

Shows exactly what `svrt run` would do — full or incremental, the resolved
base SHA, which files changed, which `fullRunTriggers` matched, and the exact
Vitest args — **without** launching a browser. `--json` for scripts.

## Statuses

Every screenshot key lands in exactly one status. Three fail a run; three mean
"not verified this time" and never do.

| Status    | Fails? | Meaning                                                                                          |
| --------- | ------ | ------------------------------------------------------------------------------------------------ |
| `passed`  | no     | Actual matches the baseline within tolerance.                                                    |
| `changed` | yes    | Pixels or dimensions differ; a diff image is written.                                            |
| `added`   | yes    | A capture with no baseline — a new story.                                                        |
| `removed` | yes    | A baseline with no capture in a **full** run — the story is gone.                                |
| `skipped` | no     | The story ran but wasn't captured on purpose (`vrt.skip`, a skipped/failed test). Baseline kept. |
| `carried` | no     | Not selected by `--changed`; carried forward unverified. A full run re-checks it.                |

`removed` vs `carried` is what the run mode decides: in a full run a missing
capture means the story is gone (`removed`); in a `--changed` run it just
means "not selected this time" (`carried`). Non-`passed` items carry a
machine-readable `reason` in `report.json`.

## Exit codes

| Code | Meaning                                                                 | Commands         |
| ---- | ----------------------------------------------------------------------- | ---------------- |
| `0`  | Success — nothing in `failOn`.                                          | all              |
| `1`  | Visual findings (changed / added / removed).                            | `run`, `compare` |
| `2`  | Usage or config error, git guard message, no report.                    | all              |
| `3`  | Could not verify — `--strict` guard refusal, or Vitest exited non-zero. | `run`            |

## How it works

1. The plugin injects a setup file into the Vitest project. Its `afterEach`
   hook runs after every story test — i.e. after rendering **and** the play
   function.
2. The hook waits for `document.fonts.ready`, disables CSS
   animations/transitions/caret, applies story-level masking, and retakes
   screenshots until two consecutive ones hash identically (anti-flake).
3. The PNG is saved as
   `.vrt/actual/<stories-file-path>/<story-name>.png`, e.g.
   `src/components/button/button.stories.tsx/Primary.png`. A story that ran
   but wasn't captured leaves a marker in `.vrt/uncaptured/` with the reason.
4. Compare walks `.vrt/expected` and `.vrt/actual`, pixel-compares pairs with
   [pixelmatch](https://github.com/mapbox/pixelmatch), and writes diff images,
   `report.json` and `report.html` into `.vrt/`.

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

| Parameter | Type                   | Description                                                    |
| --------- | ---------------------- | -------------------------------------------------------------- |
| `skip`    | `boolean`              | Skip capturing this story (shows as `skipped`, baseline kept). |
| `delay`   | `number`               | Extra milliseconds to wait before the stability checks.        |
| `mask`    | `string \| string[]`   | CSS selector(s) covered by an opaque overlay.                  |
| `remove`  | `string \| string[]`   | CSS selector(s) removed from layout (`display: none`).         |
| `capture` | `'viewport' \| string` | Capture the viewport (default) or the first matching element.  |

The viewport size follows Storybook's own `parameters.viewport`
(addon-vitest applies it before the test runs).

## Options

Options can be set inline (`vrt({ ... })`), in a `vrt.config.json` next to
the Vitest project root, or as CLI flags. Precedence:
**CLI flags > inline plugin options > `vrt.config.json` > defaults**.

| Option                                  | Default                             | Description                                                                |
| --------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| `enabled`                               | `!!process.env.VRT`                 | Inject the capture hook (`svrt run` sets this for you).                    |
| `baseDir`                               | `.vrt`                              | Root for all VRT artifacts.                                                |
| `expectedDir` / `actualDir` / `diffDir` | `${baseDir}/{expected,actual,diff}` | Individual directory overrides.                                            |
| `threshold`                             | `0.1`                               | pixelmatch per-pixel color threshold (0–1).                                |
| `allowedMismatchedPixels`               | —                                   | Tolerated mismatched pixel count.                                          |
| `allowedMismatchedPixelRatio`           | —                                   | Tolerated mismatched pixel ratio (0–1). Stricter limit wins.               |
| `failOn`                                | `['changed','added','removed']`     | Categories that make a run exit 1. `skipped`/`carried` are never accepted. |
| `fullRunTriggers`                       | `['**/.storybook/**']`              | Globs whose change forces a full run under `--changed`. See below.         |
| `project`                               | `'storybook'`                       | Vitest `--project` name `svrt run` passes (`false` = no filter).           |
| `browserNameSuffix`                     | `false`                             | Append `.chromium` etc. to keys (required for multiple instances).         |
| `stability.retries`                     | `5`                                 | Max screenshots taken while waiting for a stable image.                    |
| `stability.interval`                    | `100`                               | Milliseconds between stability screenshots.                                |
| `stability.disableAnimations`           | `true`                              | Inject animation/transition/caret-killing CSS.                             |

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
captured on different OSes. Commit `.vrt/expected/` and capture in one pinned
environment. The simplest way is the Playwright Docker image:

```sh
docker run --rm -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.60.0-noble \
  sh -c "corepack enable pnpm && pnpm install && pnpm exec svrt run"
```

`svrt approve` / `svrt compare` run anywhere — they only read PNGs.

## CI

Default to a **full run on every PR** — correctness first. One step captures,
compares, and fails the job on visual findings. Pin the capture environment so
baselines don't drift with fonts.

```yaml
# .github/workflows/vrt.yml
jobs:
  vrt:
    runs-on: ubuntu-latest
    container: mcr.microsoft.com/playwright:v1.60.0-noble
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec svrt run
      - if: failure()
        uses: actions/upload-artifact@v4
        with: { name: vrt-report, path: .vrt } # open report.html locally
```

`report.html` references images relatively, so the uploaded `.vrt` artifact
opens as a working report after download.

Package-manager variants of the run step: `npx svrt run` (npm),
`pnpm exec svrt run` (pnpm), `yarn svrt run` (yarn), `bunx svrt run` (bun).

## Incremental runs

When the suite gets slow, opt into **incremental** runs. `--changed` hands
story selection to Vitest's own git + module-graph analysis, so only stories
affected by a PR are captured. Baselines that weren't selected are `carried`,
never failed — a full run on `main` (or nightly) is the backstop that catches
real deletions.

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 } # REQUIRED — a shallow clone trips the guard
- run: pnpm exec svrt run --changed "origin/${{ github.base_ref }}"
```

Keep the full `svrt run` on push to `main` and/or a nightly schedule.

**The silent-green trap, guarded.** On a shallow clone `vitest --changed`
would see an empty diff and pass green having tested nothing. `svrt` checks
the git merge-base itself first: on failure it **falls back to a full run**
(loud), or exits 3 under `--strict`. It never passes green without verifying.

**`fullRunTriggers`** closes the gap for changes Vitest's module graph can't
see. A change to `.storybook/preview.ts` selects zero story tests (it reaches
stories through a virtual module), so it forces a full run by default. Add your
global CSS, design tokens, lockfiles, and `public/` assets — anything that
affects rendering without being imported by a component:

```json
{ "fullRunTriggers": ["**/.storybook/**", "src/styles/**", "pnpm-lock.yaml", "public/**"] }
```

Run `svrt plan --changed origin/main` to see the decision — full or
incremental, and _why_ — before spending a browser run on it.

## Caveats

- **Watch mode**: capture is meant for `svrt run` / `vitest run`; repeated
  watch-mode reruns thrash the actual directory.
- **Browser updates**: a new Chromium version can shift rendering by a few
  pixels. Pin Playwright and re-approve baselines when bumping it.
- **Multiple browser instances**: enable `browserNameSuffix` so each browser
  writes its own key.
- **Artifact baselines**: comparing against a downloaded `main` artifact
  instead of committed baselines means a regression merged to `main` silently
  becomes the new baseline. Commit `.vrt/expected/` so the backstop works.

## License

MIT

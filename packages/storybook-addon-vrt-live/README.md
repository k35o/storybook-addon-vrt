# storybook-addon-vrt-live

**"What did my edit just change?"** — a Storybook panel that freezes how a story
looks right now, and shows you the pixel diff after you edit it.

No baselines to commit, no config, no test run. Two buttons.

```
1. Set baseline   ← freeze this story's current render   (~1s)
2. …edit your component, save                            (HMR)
3. Compare        ← see exactly what moved               (~1s)
```

This is the **dev-loop** companion to
[`storybook-addon-vrt`](../storybook-addon-vrt), which is the **CI gate**.
They do not overlap:

|               | `storybook-addon-vrt`           | this addon                   |
| ------------- | ------------------------------- | ---------------------------- |
| Answers       | "did this PR change the UI?"    | "what did my last edit do?"  |
| Compares with | committed baselines / a git ref | the render you just froze    |
| Runs          | Vitest, whole suite, seconds+   | one story, in the dev server |
| Lives in      | `report.html`, CI logs          | a panel next to the story    |
| Setup         | commit `.vrt/expected`          | none                         |

Comparing against `main`, checking every story, gating a PR — that is
`storybook-addon-vrt`'s job. Reach for this one while you are actually editing.

## Requirements

- Storybook 10+ (React/Vite)
- Playwright installed (a peer dependency)

## Setup

```sh
npm install --save-dev storybook-addon-vrt-live
```

```ts
// .storybook/main.ts
export default {
  addons: ['storybook-addon-vrt-live'],
};
```

Optional — lets the capture honor per-story `parameters.vrt`
(`skip` / `mask` / `remove` / `delay` / `capture`):

```ts
// .storybook/preview.ts
import vrtLive from 'storybook-addon-vrt-live/preview';

export default {
  decorators: [...vrtLive.decorators],
};
```

## How it works

The panel runs in the browser; the screenshot is taken in Node. Storybook's
server channel connects them.

1. The panel sends the selected story id to the addon's preset (Node side).
2. The preset drives a **warm headless Playwright browser** to that story's own
   URL (`iframe.html?id=…`) — a **fresh context per capture**, with the HTTP
   cache disabled, so an HMR edit is always re-fetched.
3. It waits for the story to render and for `document.fonts.ready`, disables
   animations/transitions/caret, applies the story's mask/remove/delay, then
   re-shoots until two consecutive frames hash identically (anti-flake).
4. Baseline and current are compared with
   [pixelmatch](https://github.com/mapbox/pixelmatch); the images come back as
   base64 data URLs and render as side-by-side, diff, or slider.

Because the baseline was captured through the _same_ pipeline, an unchanged
story compares byte-identical — there are no rendering-engine false positives.

> **The preview iframe you are looking at is not what gets captured.** Taking a
> screenshot inside the browser (html2canvas and friends) does not reproduce the
> real rendering, so an unchanged story would still show differences. The
> capture always goes through Playwright.

## Baselines

Baselines live **in memory, for the dev-server session**. Nothing is written to
your repo: no directory to `.gitignore`, no binary files in review, and no
environment-specific images to share (macOS and Linux render fonts
differently — a committed baseline is only valid on the machine that made it).

Restarting the dev server clears them; press **Set baseline** again.

## Story parameters

Read from `parameters.vrt` (same shape as the CI addon):

| Parameter | Type                   | Description                                     |
| --------- | ---------------------- | ----------------------------------------------- |
| `skip`    | `boolean`              | Never capture this story.                       |
| `delay`   | `number`               | Extra milliseconds before the stability checks. |
| `mask`    | `string \| string[]`   | Selector(s) covered by an opaque overlay.       |
| `remove`  | `string \| string[]`   | Selector(s) removed from layout.                |
| `capture` | `'viewport' \| string` | Capture the viewport (default) or one element.  |

## Caveats

- **Subtle colour changes can read as "passed."** pixelmatch's default
  `threshold` (0.1) ignores near-identical colours — a white → pale-pastel
  background change measures zero differing pixels. Saturated changes and any
  layout shift are caught.
- **Viewport is fixed at 1280×720.** Storybook's own `parameters.viewport` is
  not applied to the capture (the CI addon gets that from addon-vitest).
- **One story at a time.** Sweeping every story is the CI addon's job.

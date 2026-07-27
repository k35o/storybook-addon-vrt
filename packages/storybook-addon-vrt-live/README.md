# storybook-addon-vrt-live

Live, in-Storybook visual diffing against a point in time — the **dev-loop**
companion to [`storybook-addon-vrt`](../storybook-addon-vrt) (which is the
**CI gate**). While you edit a component, a panel shows how the story you are
looking at differs from a baseline, captured by a real headless browser so an
unchanged story compares byte-for-byte.

- 🔍 **A panel in Storybook** — pick a story, hit **Compare**, see baseline /
  current / diff side-by-side, as a slider, or the diff alone.
- ⏱️ **Two baselines** — compare against a **git ref** (the committed baseline
  at `HEAD`, `main`, a tag…) or a **snapshot** you freeze in the session
  ("mark now, edit, watch what moves").
- 📸 **Faithful capture** — the current render is screenshotted through Node-side
  Playwright at the story's own URL, the same pipeline that makes the baseline,
  so there is no browser/renderer mismatch. HMR edits are always re-fetched.
- 🪶 **Opt-in** — nothing runs until you open the panel or run the CLI; the
  capture never touches your test run.

> **Not a regression gate.** This is for the edit loop. Keep
> `storybook-addon-vrt` as the thing that fails PRs.

## Requirements

- Storybook 10+ (React/Vite framework)
- Playwright installed (a peer dependency; you already have it if you use
  `storybook-addon-vrt`)

## Setup

```sh
npm install --save-dev storybook-addon-vrt-live
```

Register the addon in `.storybook/main.ts`:

```ts
export default {
  addons: ['storybook-addon-vrt-live'],
};
```

Publish each story's `parameters.vrt` (mask / remove / delay / skip) to the
capturer by adding the preview annotation in `.storybook/preview.ts`:

```ts
import vrtLive from 'storybook-addon-vrt-live/preview';

export default {
  decorators: [...vrtLive.decorators],
};
```

## Usage

### The panel

Open the **VRT Live** panel on any story.

- **Git ref** — type a ref (`HEAD`, `main`, `v1.0`…) and **Compare**. The
  current render is captured and diffed against the committed baseline at that
  ref. No baseline there yet → `added`.
- **Snapshot** — **Set baseline** freezes the current render in memory, then
  edit your component and **Compare** to see what moved. No git needed.

Results are `passed` / `changed` (with a pixel-diff image) / `added`.

**Scan all** captures every story and lists the ones that differ (changed /
added), with a per-status summary. Click a row to jump to that story and see
its diff. Stories with `parameters.vrt.skip` are counted as skipped, never
shown as a difference.

**Scan changed** captures only the stories Storybook flags as new / modified /
affected — it reads Storybook 10's own change-detection status store (git +
module graph), so editing a shared component scans just the stories that use
it. When change detection is unavailable it says so and you fall back to
**Scan all**.

### Baselines for git-ref mode

Baselines live in `.vrt-live/baseline/<storyId>.png`, committed to git. Generate
them from a running Storybook and commit:

```sh
svrt-live snapshot --url http://localhost:6006
git add .vrt-live/baseline
```

`svrt-live snapshot [--url <origin>] [--base-dir <dir>] [--clean]` captures every
story with the same pipeline the panel uses.

## How it works

1. The panel (manager) sends the selected story id + mode over Storybook's
   server channel.
2. The preset (Node) drives a warm, headless Playwright browser to
   `iframe.html?id=<storyId>&viewMode=story` in a **fresh context per capture**
   (empty cache, so live edits are always re-fetched), waits for a stable
   frame, applies the story's mask/remove/animation-disable, and screenshots.
3. The baseline is read from git (`git show <ref>:.vrt-live/baseline/<id>.png`)
   or the in-session snapshot, compared with
   [pixelmatch](https://github.com/mapbox/pixelmatch), and the images travel
   back as base64 data URLs (the channel is JSON-only).

## Caveats

- **Same environment.** Screenshots only match when rendered in the same OS —
  macOS and Linux render fonts differently. Compare a render against a baseline
  captured on the same machine (or capture both in one pinned environment).
- **Separate lineage from `storybook-addon-vrt`.** This addon owns its own
  capture pipeline and `.vrt-live/baseline`; it does not read the CI addon's
  `.vrt/expected`.
- **Per-story scope.** The panel compares the story you are on. To re-baseline
  everything (e.g. after intended changes), run `svrt-live snapshot` and commit.

## License

MIT

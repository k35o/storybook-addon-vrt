import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { DEFAULT_STABILITY, type StabilityOptions, type VrtStoryParameters } from './types';

const ANIMATION_STYLE = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;scroll-behavior:auto!important;}`;

/** fnv1a over the PNG bytes, used only to detect a stable (unchanging) frame. */
function fnv1a(buf: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    hash ^= buf[i] as number;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function toSelectorList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export type CaptureOptions = {
  /** Storybook origin, e.g. `http://localhost:6006`. */
  sbUrl: string;
  storyId: string;
  parameters?: VrtStoryParameters;
  stability?: Partial<StabilityOptions>;
  /** Viewport used for the capture page. */
  viewport?: { width: number; height: number };
};

export type CaptureOutcome =
  | { captured: true; png: Buffer; stabilized: boolean }
  | { captured: false; reason: 'skip' };

/**
 * Drives a warm, headless Playwright browser to a Storybook story URL and
 * captures a stabilized screenshot — the same rendering pipeline that produces
 * the baseline, so an unchanged story compares byte-identical. Keeps the
 * browser alive across captures (launch is the expensive part); pages are
 * cheap and created per capture so concurrent calls never fight over one page.
 */
export type LiveCapturerOptions = {
  viewport?: { width: number; height: number };
  /**
   * Close the browser after this long without a capture, so a day-long dev
   * session does not hold a Chromium process open forever. Set 0 to disable.
   * @default 300_000
   */
  idleTimeoutMs?: number;
  /** Test seam: how the browser is launched. */
  launch?: () => Promise<Browser>;
};

export class LiveCapturer {
  // The *promise*, not the resolved browser: two overlapping captures both see
  // an unset field before the first launch resolves, and would each start a
  // Chromium — the second overwriting (and orphaning) the first.
  #browser: Promise<Browser> | undefined;
  #idleTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #viewport: { width: number; height: number };
  readonly #idleTimeoutMs: number;
  readonly #launch: () => Promise<Browser>;

  constructor(options: LiveCapturerOptions = {}) {
    this.#viewport = options.viewport ?? { width: 1280, height: 720 };
    this.#idleTimeoutMs = options.idleTimeoutMs ?? 300_000;
    this.#launch = options.launch ?? (() => chromium.launch({ headless: true }));
  }

  async #getBrowser(): Promise<Browser> {
    if (!this.#browser) {
      this.#browser = this.#launch().catch((error: unknown) => {
        this.#browser = undefined; // never cache a failed launch
        throw error;
      });
    }
    return this.#browser;
  }

  #restartIdleTimer(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    if (this.#idleTimeoutMs <= 0) return;
    this.#idleTimer = setTimeout(() => void this.close(), this.#idleTimeoutMs);
    // Must not hold the dev server open.
    this.#idleTimer.unref?.();
  }

  async capture(options: CaptureOptions): Promise<CaptureOutcome> {
    const passed = options.parameters ?? {};
    // Explicit skip is honored before spending a page load.
    if (passed.skip) return { captured: false, reason: 'skip' };

    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    const stability: StabilityOptions = { ...DEFAULT_STABILITY, ...options.stability };
    const browser = await this.#getBrowser();
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
      viewport: options.viewport ?? this.#viewport,
    });
    const page = await context.newPage();
    // Disable the HTTP cache for this page. The browser is long-lived across a
    // dev session; disabling the cache guarantees every capture re-fetches the
    // current source, so an HMR edit is always reflected.
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    } catch {
      // Non-Chromium or a CDP change: fall back to normal caching.
    }
    try {
      const url = `${options.sbUrl.replace(/\/$/, '')}/iframe.html?id=${encodeURIComponent(
        options.storyId,
      )}&viewMode=story`;
      await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
      await waitStoryReady(page);

      // Merge the story's own `parameters.vrt` (published to a global by the
      // preview annotation) with any explicit override, so the baseline and the
      // live capture apply identical mask/remove/delay.
      const parameters = { ...(await readStoryParameters(page)), ...passed };
      if (parameters.skip) return { captured: false, reason: 'skip' };

      if (stability.disableAnimations) await page.addStyleTag({ content: ANIMATION_STYLE });
      await applyRemove(page, toSelectorList(parameters.remove));
      await applyMask(page, toSelectorList(parameters.mask));
      if (parameters.delay !== undefined && parameters.delay > 0) {
        await page.waitForTimeout(parameters.delay);
      }

      const target =
        parameters.capture && parameters.capture !== 'viewport' ? parameters.capture : undefined;
      const { png, stabilized } = await stableScreenshot(page, target, stability);
      return { captured: true, png, stabilized };
    } finally {
      await context.close();
      this.#restartIdleTimer();
    }
  }

  async close(): Promise<void> {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = undefined;
    const pending = this.#browser;
    this.#browser = undefined;
    if (!pending) return;
    try {
      await (await pending).close();
    } catch {
      // Already gone, or the launch itself failed — nothing to clean up.
    }
  }
}

/**
 * Reads the story's `parameters.vrt`, published to a window global by the
 * bundled preview annotation. Returns `{}` when the annotation is not
 * installed, so capture still works with explicitly-passed parameters.
 */
async function readStoryParameters(page: Page): Promise<VrtStoryParameters> {
  try {
    const params = await page.evaluate(
      () => (window as { __VRT_LIVE_PARAMS__?: unknown }).__VRT_LIVE_PARAMS__ ?? null,
    );
    return (params ?? {}) as VrtStoryParameters;
  } catch {
    return {};
  }
}

async function waitStoryReady(page: Page): Promise<void> {
  await page.waitForSelector('#storybook-root, #root', { state: 'attached', timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('#storybook-root') ?? document.querySelector('#root');
      return (
        !!root && root.childElementCount > 0 && !document.querySelector('.sb-show-errordisplay')
      );
    },
    undefined,
    { timeout: 15_000 },
  );
  await page.evaluate(() => document.fonts?.ready);
}

/** Covers matched elements with opaque overlays (dynamic content masking). */
async function applyMask(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  await page.evaluate((sels) => {
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        const o = document.createElement('div');
        o.style.cssText = `position:fixed;top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;background:#ff00ff;z-index:2147483647;pointer-events:none;`;
        document.body.append(o);
      }
    }
  }, selectors);
}

/** Removes matched elements from layout (`display:none`). */
async function applyRemove(page: Page, selectors: string[]): Promise<void> {
  if (selectors.length === 0) return;
  await page.evaluate((sels) => {
    for (const sel of sels) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        el.style.display = 'none';
      }
    }
  }, selectors);
}

/**
 * Retakes the screenshot until two consecutive frames hash identically, so
 * late layout/animation never yields a flaky capture. Never throws on
 * instability — returns the last frame with `stabilized: false`.
 */
async function stableScreenshot(
  page: Page,
  target: string | undefined,
  stability: StabilityOptions,
): Promise<{ png: Buffer; stabilized: boolean }> {
  const shoot = (): Promise<Buffer> =>
    target ? page.locator(target).first().screenshot() : page.screenshot();

  let previous: string | undefined;
  let last: Buffer | undefined;
  for (let attempt = 0; attempt < Math.max(stability.retries, 2); attempt++) {
    last = await shoot();
    const hash = fnv1a(last);
    if (previous === hash) return { png: last, stabilized: true };
    previous = hash;
    await page.waitForTimeout(stability.interval);
  }
  return { png: last as Buffer, stabilized: false };
}

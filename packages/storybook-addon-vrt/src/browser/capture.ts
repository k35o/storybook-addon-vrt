import { page, server } from 'vitest/browser';
import type { VrtRuntimeOptions, VrtStoryParameters, VrtUncapturedReason } from '../types';
import { deriveKey } from './key';
import { clearGlobalStoryContext, getStoryContext } from './story-context';

// The browser context can write to disk through Vitest's built-in fs command
// (paths resolve against the project root, so absolute paths land verbatim).
type BrowserServerLike = {
  browser: string;
  commands?: { writeFile?: (path: string, content: string) => Promise<void> };
};

/**
 * Records that a story ran but produced no screenshot, so `svrt compare` can
 * tell an intentional skip / failed test apart from a genuinely deleted
 * baseline. Best-effort: a marker write must never fail the user's test.
 */
async function writeUncapturedMarker(
  options: VrtRuntimeOptions,
  key: string,
  reason: VrtUncapturedReason,
): Promise<void> {
  const writeFile = (server as unknown as BrowserServerLike).commands?.writeFile;
  if (typeof writeFile !== 'function') return;
  try {
    await writeFile(`${options.uncapturedDir}/${key}.json`, JSON.stringify({ reason }));
  } catch (error) {
    console.warn(`[vrt] Could not write uncaptured marker for ${key}: ${String(error)}`);
  }
}

type TaskLike = {
  name: string;
  mode?: string;
  result?: { state?: string; errors?: readonly unknown[] };
  file?: { filepath?: string };
  meta?: { storyId?: string };
};

type HookContextLike = {
  task: TaskLike;
};

const ANIMATION_STYLE_ID = '__vrt-disable-animations__';

function disableAnimations(): void {
  if (document.getElementById(ANIMATION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ANIMATION_STYLE_ID;
  style.textContent = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}`;
  document.head.append(style);
}

function toSelectorList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Covers matched elements with opaque overlays; returns the undo function. */
function applyMask(selectors: string[]): () => void {
  const overlays: HTMLElement[] = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position: fixed',
        `top: ${rect.top}px`,
        `left: ${rect.left}px`,
        `width: ${rect.width}px`,
        `height: ${rect.height}px`,
        'background: #ff00ff',
        'z-index: 2147483647',
        'pointer-events: none',
      ].join('; ');
      document.body.append(overlay);
      overlays.push(overlay);
    }
  }
  return () => {
    for (const overlay of overlays) overlay.remove();
  };
}

/** Removes matched elements from layout; returns the undo function. */
function applyRemove(selectors: string[]): () => void {
  const restores: Array<() => void> = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const previous = element.style.display;
      element.style.display = 'none';
      restores.push(() => {
        element.style.display = previous;
      });
    }
  }
  return () => {
    for (const restore of restores) restore();
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function resolveCaptureTarget(parameters: VrtStoryParameters): Element | undefined {
  const target = parameters.capture ?? 'viewport';
  if (target === 'viewport') return undefined;
  const element = document.querySelector(target);
  if (!element) {
    throw new Error(
      `[vrt] The capture selector "${target}" matched no element. ` +
        'Fix `parameters.vrt.capture` of the story.',
    );
  }
  return element;
}

async function takeBase64(element: Element | undefined): Promise<string> {
  if (element) {
    const { base64 } = await page.elementLocator(element).screenshot({ save: false, base64: true });
    return base64;
  }
  // With `save: false`, `page.screenshot` returns the base64 string itself.
  return page.screenshot({ save: false });
}

async function saveScreenshot(element: Element | undefined, path: string): Promise<void> {
  // `page.screenshot` resolves absolute paths as-is, so the PNG lands in
  // actualDir. Isolated here so a future Vitest change only needs one swap
  // (e.g. to a custom browser command).
  if (element) {
    await page.elementLocator(element).screenshot({ path });
  } else {
    await page.screenshot({ path });
  }
}

/**
 * Waits until two consecutive screenshots hash identically, so animations
 * or late-loading content do not produce flaky captures. Never fails the
 * user's test on instability — it warns and captures anyway.
 */
async function waitForStableScreenshot(
  element: Element | undefined,
  options: VrtRuntimeOptions,
  key: string,
): Promise<void> {
  let previous: string | undefined;
  for (let attempt = 0; attempt < Math.max(options.stability.retries, 2); attempt++) {
    const hash = fnv1a(await takeBase64(element));
    if (previous === hash) return;
    previous = hash;
    await sleep(options.stability.interval);
  }
  console.warn(
    `[vrt] Screenshot did not stabilize after ${options.stability.retries} attempts: ${key}`,
  );
}

export async function captureStory(
  ctx: unknown,
  options: VrtRuntimeOptions,
  usedKeys: Set<string>,
): Promise<void> {
  const story = getStoryContext(ctx);
  try {
    if (!story.isStory) return;
    const task = (ctx as HookContextLike).task;

    const key = deriveKey({
      filePath: task.file?.filepath ?? '',
      testName: task.name,
      root: options.root,
      ...(options.browserNameSuffix ? { browserName: server.browser } : {}),
    });
    if (usedKeys.has(key)) {
      throw new Error(
        `[vrt] Screenshot key collision: two stories resolve to "${key}" ` +
          `(story id: ${story.storyId ?? 'unknown'}). Rename one of the stories.`,
      );
    }
    usedKeys.add(key);

    // Stories that ran but are not captured get a marker with the reason, so
    // compare keeps their baseline (never "removed") instead of failing.
    if (task.mode !== undefined && task.mode !== 'run') {
      await writeUncapturedMarker(options, key, 'test-skipped');
      return;
    }
    // A failing story would otherwise pollute the actual screenshots and
    // show up as a bogus visual change.
    if (task.result?.state === 'fail' || (task.result?.errors?.length ?? 0) > 0) {
      await writeUncapturedMarker(options, key, 'test-failed');
      return;
    }
    const parameters = story.parameters;
    if (parameters.skip) {
      await writeUncapturedMarker(options, key, 'vrt-skip');
      return;
    }

    await document.fonts.ready;
    if (options.stability.disableAnimations) disableAnimations();

    const restoreRemove = applyRemove(toSelectorList(parameters.remove));
    const restoreMask = applyMask(toSelectorList(parameters.mask));
    try {
      if (parameters.delay !== undefined && parameters.delay > 0) {
        await sleep(parameters.delay);
      }
      const element = resolveCaptureTarget(parameters);
      await waitForStableScreenshot(element, options, key);
      await saveScreenshot(element, `${options.actualDir}/${key}`);
    } finally {
      restoreMask();
      restoreRemove();
    }
  } finally {
    clearGlobalStoryContext();
  }
}

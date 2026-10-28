import { FIT_VIEWPORT_COMMAND, RESTORE_VIEWPORT_COMMAND, type ViewportSize } from '../viewport';

type Box = { x: number; y: number; width: number; height: number };

// Loose view of the command context that @vitest/browser-playwright provides;
// typed structurally so this package does not depend on playwright.
type CommandContextLike = {
  provider: { name: string; browserName?: string };
  page?: {
    viewportSize(): ViewportSize | null;
    setViewportSize(size: ViewportSize): Promise<void>;
  };
  iframe?: {
    locator(selector: string): { boundingBox(): Promise<Box | null> };
  };
};

/**
 * Returns a viewport large enough to hold `box` in the same orientation, or
 * `undefined` when the current one already holds it by Playwright's measure
 * (size only).
 */
export function viewportToFit(viewport: ViewportSize, box: Box): ViewportSize | undefined {
  if (box.width <= viewport.width && box.height <= viewport.height) return undefined;
  let width = Math.max(viewport.width, Math.ceil(Math.max(box.x, 0) + box.width));
  let height = Math.max(viewport.height, Math.ceil(Math.max(box.y, 0) + box.height));
  // In an `isMobile` context Playwright derives the screen orientation from
  // this size (a square counts as portrait), and flipping it would fire an
  // orientation change in the story.
  if (viewport.width > viewport.height) width = Math.max(width, height + 1);
  else height = Math.max(height, width);
  return { width, height };
}

/**
 * Grows the page so the capture target fits, and returns the size to restore.
 *
 * Playwright captures an element that does not fit the viewport with
 * Chromium's `captureBeyondViewport`, which resets the generic font families
 * (`monospace` etc.) Playwright set through `Page.setFontFamilies` to
 * Chromium's defaults until the page closes. Vitest runs many story files on
 * one page, so every later story would render those fonts differently.
 */
async function fitViewport(context: unknown, selector: string): Promise<ViewportSize | null> {
  const { provider, page, iframe } = context as CommandContextLike;
  if (provider.name !== 'playwright' || provider.browserName !== 'chromium') return null;
  const viewport = page?.viewportSize();
  if (!page || !iframe || !viewport) return null;
  const box = await iframe.locator(selector).boundingBox();
  const size = box ? viewportToFit(viewport, box) : undefined;
  if (!size) return null;
  await page.setViewportSize(size);
  return viewport;
}

async function restoreViewport(context: unknown, size: ViewportSize): Promise<void> {
  await (context as CommandContextLike).page?.setViewportSize(size);
}

export const viewportCommands = {
  [FIT_VIEWPORT_COMMAND]: fitViewport,
  [RESTORE_VIEWPORT_COMMAND]: restoreViewport,
};

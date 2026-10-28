import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VrtRuntimeOptions } from '../types';
import { FIT_VIEWPORT_COMMAND, RESTORE_VIEWPORT_COMMAND } from '../viewport';

const browser = vi.hoisted(() => ({
  screenshot: vi.fn<(options: { save: boolean }) => Promise<string>>(),
  writeFile: vi.fn<(path: string, content: string, encoding?: string) => Promise<void>>(),
  fitViewport: vi.fn<(selector: string) => Promise<{ width: number; height: number } | null>>(),
  restoreViewport: vi.fn<(size: { width: number; height: number }) => Promise<void>>(),
}));

vi.mock('vitest/browser', () => ({
  page: { screenshot: browser.screenshot },
  server: {
    browser: 'chromium',
    commands: {
      writeFile: browser.writeFile,
      [FIT_VIEWPORT_COMMAND]: browser.fitViewport,
      [RESTORE_VIEWPORT_COMMAND]: browser.restoreViewport,
    },
  },
}));

const options: VrtRuntimeOptions = {
  root: '/project',
  baseDir: '/project/.vrt',
  actualDir: '/project/.vrt/actual',
  diffDir: '/project/.vrt/diff',
  uncapturedDir: '/project/.vrt/uncaptured',
  browserNameSuffix: false,
  stability: { retries: 5, interval: 0, disableAnimations: false },
};

function storyContext(): unknown {
  return {
    story: { id: 'tall--default', parameters: {} },
    task: {
      name: 'Default',
      mode: 'run',
      result: { state: 'pass' },
      file: { filepath: '/project/src/tall.stories.tsx' },
    },
  };
}

async function capture(): Promise<void> {
  const { captureStory } = await import('./capture');
  await captureStory(storyContext(), options, new Set());
}

describe('captureStory', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
    browser.screenshot.mockResolvedValue('same-shot');
    browser.writeFile.mockResolvedValue(undefined);
    browser.restoreViewport.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('restores the viewport from before the first fit, once', async () => {
    browser.fitViewport
      .mockResolvedValueOnce({ width: 1200, height: 900 })
      .mockResolvedValue({ width: 1200, height: 1704 });

    await capture();

    expect(browser.fitViewport).toHaveBeenCalledTimes(2);
    expect(browser.restoreViewport).toHaveBeenCalledExactlyOnceWith({ width: 1200, height: 900 });
  });

  it('restores the viewport when a screenshot fails', async () => {
    browser.fitViewport.mockResolvedValue({ width: 1200, height: 900 });
    const error = new Error('screenshot failed');
    browser.screenshot.mockRejectedValue(error);

    await expect(capture()).rejects.toBe(error);

    expect(browser.restoreViewport).toHaveBeenCalledExactlyOnceWith({ width: 1200, height: 900 });
  });

  it('leaves the viewport alone when the target already fits', async () => {
    browser.fitViewport.mockResolvedValue(null);

    await capture();

    expect(browser.restoreViewport).not.toHaveBeenCalled();
    expect(browser.writeFile).toHaveBeenCalledOnce();
  });
});

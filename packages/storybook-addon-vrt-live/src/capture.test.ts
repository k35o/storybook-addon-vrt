import type { Browser } from 'playwright';
import { describe, expect, it } from 'vitest';
import { LiveCapturer } from './capture';

/**
 * A browser stub that fails at `newContext`. Capture cannot complete, which is
 * fine: these tests are about how many browsers get launched and closed, not
 * about screenshots.
 */
function fakeBrowser(closed: { count: number }): Browser {
  return {
    newContext: () => Promise.reject(new Error('stub: no context')),
    close: () => {
      closed.count++;
      return Promise.resolve();
    },
  } as unknown as Browser;
}

const CAPTURE = { sbUrl: 'http://localhost:6006', storyId: 'card--default' };

describe('LiveCapturer browser lifecycle', () => {
  it('launches one browser for concurrent captures', async () => {
    let launches = 0;
    const closed = { count: 0 };
    const capturer = new LiveCapturer({
      idleTimeoutMs: 0,
      launch: async () => {
        launches++;
        // Yield so both captures reach the launch before either resolves —
        // exactly the interleaving that used to start two browsers.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return fakeBrowser(closed);
      },
    });

    const results = await Promise.allSettled([
      capturer.capture(CAPTURE),
      capturer.capture(CAPTURE),
      capturer.capture(CAPTURE),
    ]);

    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(launches).toBe(1);

    await capturer.close();
    expect(closed.count).toBe(1);
  });

  it('does not cache a failed launch', async () => {
    let launches = 0;
    const capturer = new LiveCapturer({
      idleTimeoutMs: 0,
      launch: () => {
        launches++;
        return Promise.reject(new Error('launch failed'));
      },
    });

    await expect(capturer.capture(CAPTURE)).rejects.toThrow('launch failed');
    await expect(capturer.capture(CAPTURE)).rejects.toThrow('launch failed');
    expect(launches).toBe(2);
  });

  it('closes at most once and tolerates being closed while idle', async () => {
    const closed = { count: 0 };
    const capturer = new LiveCapturer({
      idleTimeoutMs: 0,
      launch: () => Promise.resolve(fakeBrowser(closed)),
    });

    await capturer.close(); // never launched
    expect(closed.count).toBe(0);

    await capturer.capture(CAPTURE).catch(() => undefined);
    await capturer.close();
    await capturer.close();
    expect(closed.count).toBe(1);
  });

  it('skips the browser entirely for a skipped story', async () => {
    let launches = 0;
    const capturer = new LiveCapturer({
      idleTimeoutMs: 0,
      launch: () => {
        launches++;
        return Promise.reject(new Error('should not launch'));
      },
    });

    await expect(capturer.capture({ ...CAPTURE, parameters: { skip: true } })).resolves.toEqual({
      captured: false,
      reason: 'skip',
    });
    expect(launches).toBe(0);
  });
});

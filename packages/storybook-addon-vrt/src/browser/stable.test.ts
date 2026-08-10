import { describe, expect, it, vi } from 'vitest';
import { takeStableScreenshot } from './stable';

function shotSequence(shots: string[]): () => Promise<string> {
  let index = 0;
  return () => {
    const shot = shots[Math.min(index, shots.length - 1)] as string;
    index += 1;
    return Promise.resolve(shot);
  };
}

describe('takeStableScreenshot', () => {
  it('returns the capture whose stability was verified, not an extra one', async () => {
    const takeShot = vi.fn(shotSequence(['moving', 'settled', 'settled', 'late-change']));
    const onUnstable = vi.fn();

    const result = await takeStableScreenshot(takeShot, { retries: 5, interval: 0 }, onUnstable);

    // The third shot matched the second; a hypothetical fourth ("late-change")
    // must never be taken or returned.
    expect(result).toBe('settled');
    expect(takeShot).toHaveBeenCalledTimes(3);
    expect(onUnstable).not.toHaveBeenCalled();
  });

  it('returns immediately after two identical captures', async () => {
    const takeShot = vi.fn(shotSequence(['same', 'same']));

    const result = await takeStableScreenshot(takeShot, { retries: 5, interval: 0 }, () => {});

    expect(result).toBe('same');
    expect(takeShot).toHaveBeenCalledTimes(2);
  });

  it('reports instability and still returns the last capture when retries run out', async () => {
    const takeShot = vi.fn(shotSequence(['a', 'b', 'c', 'd']));
    const onUnstable = vi.fn();

    const result = await takeStableScreenshot(takeShot, { retries: 3, interval: 0 }, onUnstable);

    expect(result).toBe('c');
    expect(takeShot).toHaveBeenCalledTimes(3);
    expect(onUnstable).toHaveBeenCalledTimes(1);
  });

  it('takes at least two captures even when retries is lower', async () => {
    const takeShot = vi.fn(shotSequence(['same', 'same']));

    const result = await takeStableScreenshot(takeShot, { retries: 1, interval: 0 }, () => {});

    expect(result).toBe('same');
    expect(takeShot).toHaveBeenCalledTimes(2);
  });
});

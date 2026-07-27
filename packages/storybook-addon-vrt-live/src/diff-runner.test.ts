import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildDiffPayload, toDataUrl } from './diff-runner';

function solid(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const WHITE = solid(6, 6, [255, 255, 255]);

describe('toDataUrl', () => {
  it('encodes a PNG buffer as a data URL', () => {
    expect(toDataUrl(WHITE)).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });
});

describe('buildDiffPayload', () => {
  it('marks a missing baseline as added with only the current image', () => {
    const payload = buildDiffPayload({
      storyId: 'card--default',
      baseline: null,
      current: WHITE,
      stabilized: true,
    });
    expect(payload.status).toBe('added');
    expect(payload.baseline).toBeNull();
    expect(payload.diff).toBeNull();
    expect(payload.current).toMatch(/^data:image\/png;base64,/);
    expect(payload.storyId).toBe('card--default');
  });

  it('passes identical images with no diff image', () => {
    const payload = buildDiffPayload({
      storyId: 's',
      baseline: WHITE,
      current: solid(6, 6, [255, 255, 255]),
      stabilized: true,
    });
    expect(payload.status).toBe('passed');
    expect(payload.baseline).toMatch(/^data:image\/png;base64,/);
    expect(payload.diff).toBeNull();
  });

  it('returns a diff image data URL when the images differ', () => {
    const payload = buildDiffPayload({
      storyId: 's',
      baseline: WHITE,
      current: solid(6, 6, [0, 0, 0]),
      stabilized: true,
    });
    expect(payload.status).toBe('changed');
    expect(payload.diff).toMatch(/^data:image\/png;base64,/);
    expect(payload.mismatchedPixels).toBeGreaterThan(0);
  });
});

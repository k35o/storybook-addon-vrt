import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { comparePng } from './compare';

type Rgba = [number, number, number, number];
const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];

function pngBuffer(
  width: number,
  height: number,
  paint: (x: number, y: number) => Rgba = () => WHITE,
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (width * y + x) << 2;
      const [r, g, b, a] = paint(x, y);
      png.data[index] = r;
      png.data[index + 1] = g;
      png.data[index + 2] = b;
      png.data[index + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

describe('comparePng', () => {
  it('reports a null baseline as added, with no diff', () => {
    const result = comparePng(null, pngBuffer(4, 4));
    expect(result.status).toBe('added');
    expect(result.reason).toBe('no-baseline');
    expect(result.diff).toBeNull();
  });

  it('passes byte-identical buffers without decoding', () => {
    const png = pngBuffer(8, 8);
    const result = comparePng(png, Buffer.from(png));
    expect(result.status).toBe('passed');
    expect(result.mismatchedPixels).toBe(0);
    expect(result.diff).toBeNull();
  });

  it('passes visually-identical buffers re-encoded separately', () => {
    const result = comparePng(pngBuffer(8, 8), pngBuffer(8, 8));
    expect(result.status).toBe('passed');
    expect(result.mismatchedPixels).toBe(0);
  });

  it('flags a pixel change and emits a diff PNG', () => {
    const baseline = pngBuffer(10, 10);
    const current = pngBuffer(10, 10, (x, y) => (x < 3 && y < 3 ? BLACK : WHITE));
    const result = comparePng(baseline, current);
    expect(result.status).toBe('changed');
    expect(result.reason).toBe('pixel-diff');
    expect(result.mismatchedPixels).toBeGreaterThan(0);
    expect(result.diff).toBeInstanceOf(Buffer);
  });

  it('classifies a size change as a dimension diff and records both sizes', () => {
    const result = comparePng(pngBuffer(10, 10), pngBuffer(12, 10));
    expect(result.status).toBe('changed');
    expect(result.reason).toBe('dimension-diff');
    expect(result.dimensions).toEqual({ baseline: [10, 10], current: [12, 10] });
  });

  it('stays passed while the mismatch is within the allowed pixel count', () => {
    const baseline = pngBuffer(10, 10);
    const current = pngBuffer(10, 10, (x, y) => (x === 0 && y === 0 ? BLACK : WHITE));
    expect(comparePng(baseline, current).status).toBe('changed');
    expect(comparePng(baseline, current, { allowedMismatchedPixels: 5 }).status).toBe('passed');
  });

  it('a dimension change fails even when pixel tolerance is generous', () => {
    const result = comparePng(pngBuffer(10, 10), pngBuffer(20, 20), {
      allowedMismatchedPixelRatio: 1,
    });
    expect(result.status).toBe('changed');
    expect(result.reason).toBe('dimension-diff');
  });
});

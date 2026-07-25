import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type DiffPixelsOptions = {
  /** pixelmatch per-pixel color threshold (0-1). */
  threshold?: number;
  /** Tolerated mismatched pixel count. */
  allowedMismatchedPixels?: number;
  /** Tolerated mismatched pixel ratio (0-1). The stricter of the two wins. */
  allowedMismatchedPixelRatio?: number;
};

export type DiffPixelsResult = {
  passed: boolean;
  mismatchedPixels: number;
  mismatchRatio: number;
  dimensionMismatch: boolean;
  dimensions?: {
    expected: [width: number, height: number];
    actual: [width: number, height: number];
  };
  /** Diff PNG bytes, present only when the pair does not pass. */
  diff: Buffer | null;
};

/** Copies `source` onto a transparent canvas of `width`×`height`. */
function pad(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) return source;
  const padded = new PNG({ width, height });
  PNG.bitblt(source, padded, 0, 0, source.width, source.height, 0, 0);
  return padded;
}

/**
 * The shared pixel-comparison primitive both addons build on. Takes two PNG
 * buffers and returns the verdict plus the diff image as bytes; a byte-identical
 * pair short-circuits with no decode. Callers decide what to do with the diff
 * (write to disk, or hand back as a data URL) and how to classify a missing
 * baseline.
 */
export function diffPixels(
  expected: Buffer,
  actual: Buffer,
  options: DiffPixelsOptions = {},
): DiffPixelsResult {
  if (expected.equals(actual)) {
    return {
      passed: true,
      mismatchedPixels: 0,
      mismatchRatio: 0,
      dimensionMismatch: false,
      diff: null,
    };
  }

  const a = PNG.sync.read(expected);
  const b = PNG.sync.read(actual);
  const dimensionMismatch = a.width !== b.width || a.height !== b.height;
  const width = Math.max(a.width, b.width);
  const height = Math.max(a.height, b.height);
  const diffPng = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(
    pad(a, width, height).data,
    pad(b, width, height).data,
    diffPng.data,
    width,
    height,
    { threshold: options.threshold ?? 0.1, includeAA: false, alpha: 0.5 },
  );
  const totalPixels = width * height;
  const mismatchRatio = mismatchedPixels / totalPixels;

  const limits: number[] = [];
  if (options.allowedMismatchedPixels !== undefined) {
    limits.push(options.allowedMismatchedPixels);
  }
  if (options.allowedMismatchedPixelRatio !== undefined) {
    limits.push(options.allowedMismatchedPixelRatio * totalPixels);
  }
  const allowedPixels = limits.length > 0 ? Math.min(...limits) : 0;
  const passed = !dimensionMismatch && mismatchedPixels <= allowedPixels;

  return {
    passed,
    mismatchedPixels,
    mismatchRatio,
    dimensionMismatch,
    ...(dimensionMismatch
      ? {
          dimensions: {
            expected: [a.width, a.height] as [number, number],
            actual: [b.width, b.height] as [number, number],
          },
        }
      : {}),
    diff: passed ? null : PNG.sync.write(diffPng),
  };
}

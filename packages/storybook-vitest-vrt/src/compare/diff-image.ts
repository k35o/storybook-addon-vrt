import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export type ComparePairInput = {
  expectedPath: string;
  actualPath: string;
  /** Where the diff PNG is written when the pair does not pass. */
  diffPath: string;
  threshold: number;
  allowedMismatchedPixels: number | undefined;
  allowedMismatchedPixelRatio: number | undefined;
};

export type ComparePairResult = {
  passed: boolean;
  mismatchedPixels: number;
  mismatchRatio: number;
  dimensions?: {
    expected: [width: number, height: number];
    actual: [width: number, height: number];
  };
};

/** Copies `source` onto a transparent canvas of `width`×`height`. */
function pad(source: PNG, width: number, height: number): PNG {
  if (source.width === width && source.height === height) return source;
  const padded = new PNG({ width, height });
  PNG.bitblt(source, padded, 0, 0, source.width, source.height, 0, 0);
  return padded;
}

export async function comparePair(input: ComparePairInput): Promise<ComparePairResult> {
  const [expectedBuffer, actualBuffer] = await Promise.all([
    readFile(input.expectedPath),
    readFile(input.actualPath),
  ]);
  if (expectedBuffer.equals(actualBuffer)) {
    return { passed: true, mismatchedPixels: 0, mismatchRatio: 0 };
  }

  const expected = PNG.sync.read(expectedBuffer);
  const actual = PNG.sync.read(actualBuffer);
  const dimensionMismatch = expected.width !== actual.width || expected.height !== actual.height;
  const width = Math.max(expected.width, actual.width);
  const height = Math.max(expected.height, actual.height);
  const diff = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(
    pad(expected, width, height).data,
    pad(actual, width, height).data,
    diff.data,
    width,
    height,
    { threshold: input.threshold, includeAA: false, alpha: 0.5 },
  );
  const totalPixels = width * height;
  const mismatchRatio = mismatchedPixels / totalPixels;

  // When both limits are set the stricter one wins; when none is set the
  // comparison is exact (limit 0). A dimension change is always a real
  // change, regardless of tolerances.
  const limits: number[] = [];
  if (input.allowedMismatchedPixels !== undefined) {
    limits.push(input.allowedMismatchedPixels);
  }
  if (input.allowedMismatchedPixelRatio !== undefined) {
    limits.push(input.allowedMismatchedPixelRatio * totalPixels);
  }
  const allowedPixels = limits.length > 0 ? Math.min(...limits) : 0;
  const passed = !dimensionMismatch && mismatchedPixels <= allowedPixels;

  if (!passed) {
    await mkdir(path.dirname(input.diffPath), { recursive: true });
    await writeFile(input.diffPath, PNG.sync.write(diff));
  }

  return {
    passed,
    mismatchedPixels,
    mismatchRatio,
    ...(dimensionMismatch
      ? {
          dimensions: {
            expected: [expected.width, expected.height] as [number, number],
            actual: [actual.width, actual.height] as [number, number],
          },
        }
      : {}),
  };
}

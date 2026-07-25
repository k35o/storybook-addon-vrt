import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { diffPixels } from 'vrt-core';

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

/**
 * Compares two screenshots on disk with vrt-core's `diffPixels`, writing the
 * diff image next to the others only when the pair does not pass.
 */
export async function comparePair(input: ComparePairInput): Promise<ComparePairResult> {
  const [expectedBuffer, actualBuffer] = await Promise.all([
    readFile(input.expectedPath),
    readFile(input.actualPath),
  ]);
  const result = diffPixels(expectedBuffer, actualBuffer, {
    threshold: input.threshold,
    allowedMismatchedPixels: input.allowedMismatchedPixels,
    allowedMismatchedPixelRatio: input.allowedMismatchedPixelRatio,
  });

  if (!result.passed && result.diff !== null) {
    await mkdir(path.dirname(input.diffPath), { recursive: true });
    await writeFile(input.diffPath, result.diff);
  }

  return {
    passed: result.passed,
    mismatchedPixels: result.mismatchedPixels,
    mismatchRatio: result.mismatchRatio,
    ...(result.dimensions ? { dimensions: result.dimensions } : {}),
  };
}

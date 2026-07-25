import { diffPixels } from 'vrt-core';
import type { CompareResult } from './types';

export type CompareOptions = {
  /** pixelmatch per-pixel color threshold (0-1). */
  threshold?: number;
  /** Tolerated mismatched pixel count. */
  allowedMismatchedPixels?: number;
  /** Tolerated mismatched pixel ratio (0-1). Stricter of the two wins. */
  allowedMismatchedPixelRatio?: number;
};

export type ComparePngResult = CompareResult & {
  /** The diff visualization PNG, present only when the pair does not pass. */
  diff: Buffer | null;
};

/**
 * Compares a current capture against a baseline, both as PNG buffers, and
 * returns the diff image as a buffer so a server can stream it straight back to
 * the panel. Wraps vrt-core's `diffPixels`, adding the "no baseline → added"
 * classification the live panel needs.
 */
export function comparePng(
  baseline: Buffer | null,
  current: Buffer,
  options: CompareOptions = {},
): ComparePngResult {
  if (baseline === null) {
    return {
      status: 'added',
      reason: 'no-baseline',
      mismatchedPixels: 0,
      mismatchRatio: 0,
      diff: null,
    };
  }

  const result = diffPixels(baseline, current, options);
  if (result.passed) {
    return {
      status: 'passed',
      mismatchedPixels: result.mismatchedPixels,
      mismatchRatio: result.mismatchRatio,
      diff: null,
    };
  }
  return {
    status: 'changed',
    reason: result.dimensionMismatch ? 'dimension-diff' : 'pixel-diff',
    mismatchedPixels: result.mismatchedPixels,
    mismatchRatio: result.mismatchRatio,
    ...(result.dimensions
      ? { dimensions: { baseline: result.dimensions.expected, current: result.dimensions.actual } }
      : {}),
    diff: result.diff,
  };
}

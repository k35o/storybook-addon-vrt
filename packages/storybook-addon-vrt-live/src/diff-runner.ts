import { comparePng, type CompareOptions } from './compare';
import type { CompareResult } from './types';

export function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * What the panel renders: the verdict plus the images as data URLs. The
 * manager↔server channel is JSON-only, so PNG bytes travel as base64.
 * `baseline`/`diff` are null when there is nothing to show.
 */
export type DiffPayload = CompareResult & {
  storyId: string;
  /** Whether the current capture reached a stable frame. */
  stabilized: boolean;
  baseline: string | null;
  current: string;
  diff: string | null;
};

/**
 * Compares an already-captured render against the story's baseline and packages
 * the result for the panel. Pure over its inputs so it is trivially testable;
 * the caller owns capture and baseline lookup.
 */
export function buildDiffPayload(input: {
  storyId: string;
  baseline: Buffer | null;
  current: Buffer;
  stabilized: boolean;
  compare?: CompareOptions;
}): DiffPayload {
  const result = comparePng(input.baseline, input.current, input.compare);
  return {
    ...result,
    storyId: input.storyId,
    stabilized: input.stabilized,
    baseline: input.baseline === null ? null : toDataUrl(input.baseline),
    current: toDataUrl(input.current),
    diff: result.diff === null ? null : toDataUrl(result.diff),
  };
}

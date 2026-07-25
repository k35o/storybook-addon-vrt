import { comparePng, type CompareOptions } from './compare';
import type { CompareResult } from './types';

export function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * The result the panel renders: the compare verdict plus the three images as
 * data URLs (the manager↔server channel is JSON-only, so PNG bytes travel as
 * base64). `baseline`/`diff` are null when there is nothing to show.
 */
export type DiffPayload = CompareResult & {
  storyId: string;
  /** How the baseline was obtained, for the panel's provenance line. */
  source: { mode: 'snapshot'; capturedAt?: string } | { mode: 'ref'; ref: string };
  /** Whether the current capture reached a stable frame. */
  stabilized: boolean;
  baseline: string | null;
  current: string;
  diff: string | null;
};

/**
 * Compares an already-captured current image against an already-resolved
 * baseline and packages the result for the panel. Pure over its inputs so it
 * is trivially testable; the caller owns capture and baseline resolution.
 */
export function buildDiffPayload(input: {
  storyId: string;
  baseline: Buffer | null;
  current: Buffer;
  stabilized: boolean;
  source: DiffPayload['source'];
  compare?: CompareOptions;
}): DiffPayload {
  const result = comparePng(input.baseline, input.current, input.compare);
  return {
    ...result,
    storyId: input.storyId,
    source: input.source,
    stabilized: input.stabilized,
    baseline: input.baseline === null ? null : toDataUrl(input.baseline),
    current: toDataUrl(input.current),
    diff: result.diff === null ? null : toDataUrl(result.diff),
  };
}

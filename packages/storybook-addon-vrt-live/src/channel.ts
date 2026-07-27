import type { DiffPayload } from './diff-runner';
import type { VrtStoryParameters } from './types';

// Event names on the Storybook manager↔server channel (WebSocket, JSON-only —
// PNGs travel as base64 data URLs).
export const VRT_LIVE_REQUEST = 'vrt-live/request';
export const VRT_LIVE_RESPONSE = 'vrt-live/response';
export const VRT_LIVE_SNAPSHOT_SET = 'vrt-live/snapshot-set';
export const VRT_LIVE_SNAPSHOT_SET_DONE = 'vrt-live/snapshot-set-done';

/** Manager → server: freeze the story's current render as the baseline. */
export type SnapshotSetRequest = {
  requestId: string;
  storyId: string;
  /** The running Storybook origin, taken from the manager's own location. */
  sbUrl: string;
  parameters?: VrtStoryParameters;
};

export type SnapshotSetResponse = {
  requestId: string;
  storyId: string;
  ok: boolean;
  error?: string;
};

/** Manager → server: capture the story now and compare it to its baseline. */
export type DiffRequest = {
  requestId: string;
  storyId: string;
  sbUrl: string;
  parameters?: VrtStoryParameters;
};

/** Server → manager: the diff, or a skip/error, correlated by requestId. */
export type DiffResponse =
  | ({ requestId: string; ok: true } & DiffPayload)
  | { requestId: string; ok: false; storyId: string; skipped?: boolean; error?: string };

import type { DiffPayload } from './diff-runner';
import type { CompareResult, VrtStoryParameters } from './types';

// Event names on the Storybook manager↔server channel (WebSocket, JSON-only).
export const VRT_LIVE_REQUEST = 'vrt-live/request';
export const VRT_LIVE_RESPONSE = 'vrt-live/response';
export const VRT_LIVE_SNAPSHOT_SET = 'vrt-live/snapshot-set';
export const VRT_LIVE_SNAPSHOT_SET_DONE = 'vrt-live/snapshot-set-done';
export const VRT_LIVE_SCAN_REQUEST = 'vrt-live/scan-request';
export const VRT_LIVE_SCAN_PROGRESS = 'vrt-live/scan-progress';
export const VRT_LIVE_SCAN_RESPONSE = 'vrt-live/scan-response';

export type DiffMode = 'snapshot' | 'ref';

/** Manager → server: capture the story now and compare it to the baseline. */
export type DiffRequest = {
  requestId: string;
  storyId: string;
  /** The running Storybook origin, taken from the manager's own location. */
  sbUrl: string;
  mode: DiffMode;
  /** Git ref for `mode: 'ref'` (defaults to HEAD server-side). */
  ref?: string;
  parameters?: VrtStoryParameters;
};

/** Server → manager: the diff result, or a skip/error, correlated by requestId. */
export type DiffResponse =
  | ({ requestId: string; ok: true } & DiffPayload)
  | { requestId: string; ok: false; storyId: string; skipped?: boolean; error?: string };

/** Manager → server: freeze the current render as the snapshot baseline. */
export type SnapshotSetRequest = {
  requestId: string;
  storyId: string;
  sbUrl: string;
  parameters?: VrtStoryParameters;
};

export type SnapshotSetResponse = {
  requestId: string;
  storyId: string;
  ok: boolean;
};

/** `all` scans every story; `changed` scans only Storybook's changed set. */
export type ScanScope = 'all' | 'changed';

/** Manager → server: capture and compare stories to surface which differ. */
export type ScanRequest = {
  requestId: string;
  sbUrl: string;
  mode: DiffMode;
  ref?: string;
  /** @default 'all' */
  scope?: ScanScope;
};

export type ScanRowStatus = CompareResult['status'] | 'skipped';

export type ScanRow = {
  storyId: string;
  title: string;
  name: string;
  status: ScanRowStatus;
  mismatchedPixels: number;
};

/** Server → manager: incremental progress while a scan runs. */
export type ScanProgress = {
  requestId: string;
  done: number;
  total: number;
  storyId: string;
};

export type ScanResponse = {
  requestId: string;
  rows: ScanRow[];
  /** Scope actually scanned (echoed for the panel's summary). */
  scope?: ScanScope;
  /** Non-fatal note, e.g. change detection unavailable or nothing changed. */
  note?: string;
  error?: string;
};

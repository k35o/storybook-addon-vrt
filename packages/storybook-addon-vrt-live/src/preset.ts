import type { Channel } from 'storybook/internal/channels';
import { refBaseline, SnapshotStore } from './baseline';
import { LiveCapturer } from './capture';
import {
  type DiffRequest,
  type ScanRequest,
  type ScanRow,
  type SnapshotSetRequest,
  VRT_LIVE_REQUEST,
  VRT_LIVE_RESPONSE,
  VRT_LIVE_SCAN_PROGRESS,
  VRT_LIVE_SCAN_REQUEST,
  VRT_LIVE_SCAN_RESPONSE,
  VRT_LIVE_SNAPSHOT_SET,
  VRT_LIVE_SNAPSHOT_SET_DONE,
} from './channel';
import { comparePng } from './compare';
import { buildDiffPayload } from './diff-runner';
import { repoRoot } from './git';
import { fetchStoryIndex } from './stories';

/** Baseline directory (repo-root-relative) that `svrt-live snapshot` commits to. */
const BASELINE_DIR = '.vrt-live/baseline';

/**
 * Storybook preset entry (Node side). Owns one warm Playwright browser for the
 * dev-server session and answers the panel's capture/compare requests over the
 * manager↔server channel. PNGs travel as base64 data URLs (built by
 * buildDiffPayload) because the channel is JSON-only.
 */
export const experimental_serverChannel = async (channel: Channel): Promise<Channel> => {
  const capturer = new LiveCapturer();
  const snapshots = new SnapshotStore();
  const root = repoRoot(process.cwd());

  channel.on(VRT_LIVE_SNAPSHOT_SET, async (req: SnapshotSetRequest) => {
    let ok = false;
    try {
      const shot = await capturer.capture({
        sbUrl: req.sbUrl,
        storyId: req.storyId,
        ...(req.parameters ? { parameters: req.parameters } : {}),
      });
      if (shot.captured) {
        snapshots.set(req.storyId, shot.png);
        ok = true;
      }
    } catch {
      ok = false;
    }
    channel.emit(VRT_LIVE_SNAPSHOT_SET_DONE, {
      requestId: req.requestId,
      storyId: req.storyId,
      ok,
    });
  });

  channel.on(VRT_LIVE_REQUEST, async (req: DiffRequest) => {
    try {
      const shot = await capturer.capture({
        sbUrl: req.sbUrl,
        storyId: req.storyId,
        ...(req.parameters ? { parameters: req.parameters } : {}),
      });
      if (!shot.captured) {
        channel.emit(VRT_LIVE_RESPONSE, {
          requestId: req.requestId,
          ok: false,
          storyId: req.storyId,
          skipped: true,
        });
        return;
      }

      let baseline: Buffer | null;
      let source: { mode: 'snapshot' } | { mode: 'ref'; ref: string };
      if (req.mode === 'ref') {
        const ref = req.ref ?? 'HEAD';
        baseline = root ? refBaseline(root, ref, BASELINE_DIR, req.storyId) : null;
        source = { mode: 'ref', ref };
      } else {
        baseline = snapshots.get(req.storyId);
        source = { mode: 'snapshot' };
      }

      const payload = buildDiffPayload({
        storyId: req.storyId,
        baseline,
        current: shot.png,
        stabilized: shot.stabilized,
        source,
      });
      channel.emit(VRT_LIVE_RESPONSE, { requestId: req.requestId, ok: true, ...payload });
    } catch (error) {
      channel.emit(VRT_LIVE_RESPONSE, {
        requestId: req.requestId,
        ok: false,
        storyId: req.storyId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  channel.on(VRT_LIVE_SCAN_REQUEST, async (req: ScanRequest) => {
    try {
      const stories = await fetchStoryIndex(req.sbUrl);
      const rows: ScanRow[] = [];
      let done = 0;
      for (const story of stories) {
        let row: ScanRow;
        try {
          const shot = await capturer.capture({ sbUrl: req.sbUrl, storyId: story.id });
          if (!shot.captured) {
            row = {
              storyId: story.id,
              title: story.title,
              name: story.name,
              status: 'skipped',
              mismatchedPixels: 0,
            };
          } else {
            const baseline =
              req.mode === 'ref'
                ? root
                  ? refBaseline(root, req.ref ?? 'HEAD', BASELINE_DIR, story.id)
                  : null
                : snapshots.get(story.id);
            const result = comparePng(baseline, shot.png);
            row = {
              storyId: story.id,
              title: story.title,
              name: story.name,
              status: result.status,
              mismatchedPixels: result.mismatchedPixels,
            };
          }
        } catch {
          row = {
            storyId: story.id,
            title: story.title,
            name: story.name,
            status: 'skipped',
            mismatchedPixels: 0,
          };
        }
        rows.push(row);
        done++;
        channel.emit(VRT_LIVE_SCAN_PROGRESS, {
          requestId: req.requestId,
          done,
          total: stories.length,
          storyId: story.id,
        });
      }
      channel.emit(VRT_LIVE_SCAN_RESPONSE, { requestId: req.requestId, rows });
    } catch (error) {
      channel.emit(VRT_LIVE_SCAN_RESPONSE, {
        requestId: req.requestId,
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return channel;
};

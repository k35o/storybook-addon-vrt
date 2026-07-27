import type { Channel } from 'storybook/internal/channels';
import { LiveCapturer } from './capture';
import {
  type DiffRequest,
  type SnapshotSetRequest,
  VRT_LIVE_REQUEST,
  VRT_LIVE_RESPONSE,
  VRT_LIVE_SNAPSHOT_SET,
  VRT_LIVE_SNAPSHOT_SET_DONE,
} from './channel';
import { buildDiffPayload } from './diff-runner';
import { SnapshotStore } from './snapshot-store';

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Storybook preset entry (Node side). Owns one warm Playwright browser for the
 * dev-server session and answers the panel's two requests: freeze a baseline,
 * and compare the current render against it. PNGs travel as base64 data URLs
 * because the manager↔server channel is JSON-only.
 */
export const experimental_serverChannel = async (channel: Channel): Promise<Channel> => {
  const capturer = new LiveCapturer();
  const snapshots = new SnapshotStore();

  channel.on(VRT_LIVE_SNAPSHOT_SET, async (req: SnapshotSetRequest) => {
    try {
      const shot = await capturer.capture({
        sbUrl: req.sbUrl,
        storyId: req.storyId,
        ...(req.parameters ? { parameters: req.parameters } : {}),
      });
      if (shot.captured) snapshots.set(req.storyId, shot.png);
      channel.emit(VRT_LIVE_SNAPSHOT_SET_DONE, {
        requestId: req.requestId,
        storyId: req.storyId,
        ok: shot.captured,
      });
    } catch (error) {
      channel.emit(VRT_LIVE_SNAPSHOT_SET_DONE, {
        requestId: req.requestId,
        storyId: req.storyId,
        ok: false,
        error: message(error),
      });
    }
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
      const payload = buildDiffPayload({
        storyId: req.storyId,
        baseline: snapshots.get(req.storyId),
        current: shot.png,
        stabilized: shot.stabilized,
      });
      channel.emit(VRT_LIVE_RESPONSE, { requestId: req.requestId, ok: true, ...payload });
    } catch (error) {
      channel.emit(VRT_LIVE_RESPONSE, {
        requestId: req.requestId,
        ok: false,
        storyId: req.storyId,
        error: message(error),
      });
    }
  });

  return channel;
};

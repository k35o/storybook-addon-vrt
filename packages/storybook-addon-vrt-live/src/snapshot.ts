import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LiveCapturer } from './capture';
import type { StoryEntry } from './stories';
import type { VrtStoryParameters } from './types';

export type SnapshotSummary = {
  written: string[];
  skipped: string[];
  failed: Array<{ id: string; error: string }>;
};

/**
 * Captures every story into `<baselineDirAbs>/<storyId>.png` using the same
 * pipeline the live panel uses, so a later ref comparison is noise-free.
 * Meant to be committed; the CLI wraps this as `svrt-live snapshot`.
 */
export async function captureBaseline(input: {
  capturer: LiveCapturer;
  sbUrl: string;
  stories: StoryEntry[];
  baselineDirAbs: string;
  /** Per-story `parameters.vrt`, keyed by story id (else read in-iframe). */
  parameters?: Record<string, VrtStoryParameters>;
  /** Wipe the baseline directory before capturing (a full re-snapshot). */
  clean?: boolean;
  onProgress?: (event: {
    done: number;
    total: number;
    id: string;
    status: 'written' | 'skipped' | 'failed';
  }) => void;
}): Promise<SnapshotSummary> {
  if (input.clean) await rm(input.baselineDirAbs, { recursive: true, force: true });
  await mkdir(input.baselineDirAbs, { recursive: true });

  const summary: SnapshotSummary = { written: [], skipped: [], failed: [] };
  let done = 0;
  for (const story of input.stories) {
    let status: 'written' | 'skipped' | 'failed' = 'written';
    try {
      const outcome = await input.capturer.capture({
        sbUrl: input.sbUrl,
        storyId: story.id,
        ...(input.parameters?.[story.id] ? { parameters: input.parameters[story.id] } : {}),
      });
      if (!outcome.captured) {
        summary.skipped.push(story.id);
        status = 'skipped';
      } else {
        await writeFile(path.join(input.baselineDirAbs, `${story.id}.png`), outcome.png);
        summary.written.push(story.id);
      }
    } catch (error) {
      summary.failed.push({
        id: story.id,
        error: error instanceof Error ? error.message : String(error),
      });
      status = 'failed';
    }
    done++;
    input.onProgress?.({ done, total: input.stories.length, id: story.id, status });
  }
  return summary;
}

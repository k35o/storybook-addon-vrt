import type { StoryEntry } from './stories';

// Storybook 10 ships a core ChangeDetectionService that watches git-changed
// files, maps them to stories via the module graph, and publishes new /
// modified / affected statuses to this status store. We only read it — the
// detection is Storybook's, not ours. These are experimental core-server APIs,
// so everything here is loaded lazily and guarded; the feature degrades to
// "unavailable" rather than breaking the preset on a Storybook that lacks them.

const CHANGE_DETECTION_TYPE = 'storybook/change-detection';
const CHANGED_STATUS_VALUES = new Set([
  'status-value:new',
  'status-value:modified',
  'status-value:affected',
]);

type Status = { value?: string; storyId?: string };
type StatusesByStory = Record<string, Record<string, Status>>;

type CoreServer = {
  experimental_getStatusStore?: (typeId: string) => { getAll?: () => StatusesByStory };
  experimental_getChangeDetectionReadiness?: () => Promise<{ status?: string; reason?: string }>;
};

async function coreServer(): Promise<CoreServer | null> {
  try {
    return (await import('storybook/internal/core-server')) as CoreServer;
  } catch {
    return null;
  }
}

export type ChangedResult = { ready: true; ids: Set<string> } | { ready: false; reason: string };

/**
 * The story ids Storybook flags as new / modified / affected, or a reason the
 * change-detection status store could not be read (API absent, detection not
 * enabled, builder unsupported).
 */
export async function getChangedStoryIds(): Promise<ChangedResult> {
  const core = await coreServer();
  if (!core?.experimental_getStatusStore) {
    return { ready: false, reason: 'change detection is unavailable in this Storybook.' };
  }
  try {
    const readiness = core.experimental_getChangeDetectionReadiness
      ? await core.experimental_getChangeDetectionReadiness()
      : { status: 'ready' };
    if (readiness?.status && readiness.status !== 'ready') {
      return {
        ready: false,
        reason: readiness.reason ?? `change detection is ${readiness.status}.`,
      };
    }
    const store = core.experimental_getStatusStore(CHANGE_DETECTION_TYPE);
    const all = store.getAll?.() ?? {};
    const ids = new Set<string>();
    for (const [storyId, byType] of Object.entries(all)) {
      const status = byType?.[CHANGE_DETECTION_TYPE];
      if (status?.value && CHANGED_STATUS_VALUES.has(status.value)) ids.add(storyId);
    }
    return { ready: true, ids };
  } catch (error) {
    return { ready: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

type IndexEntry = { id: string; type?: string; title: string; name: string; importPath: string };

/**
 * Resolves the story list in-process via the memoised `storyIndexGenerator`
 * preset — no loopback HTTP and in lock-step with HMR. Returns null when the
 * generator is unavailable (the caller falls back to fetching `/index.json`).
 */
export async function resolveStoryIndexInProcess(options: unknown): Promise<StoryEntry[] | null> {
  const opts = options as { presets?: { apply?: (key: string) => Promise<unknown> } } | undefined;
  try {
    const generator = (await opts?.presets?.apply?.('storyIndexGenerator')) as
      | { getIndex?: () => Promise<{ entries?: Record<string, IndexEntry> }> }
      | undefined;
    if (!generator?.getIndex) return null;
    const index = await generator.getIndex();
    return Object.values(index.entries ?? {})
      .filter((entry) => entry.type === undefined || entry.type === 'story')
      .map(({ id, title, name, importPath }) => ({ id, title, name, importPath }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return null;
  }
}

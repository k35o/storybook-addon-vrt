import type { VrtStoryParameters } from '../types';

export const GLOBAL_STORY_CONTEXT_KEY = '__VRT_STORY_CONTEXT__';

export type VrtGlobalStoryContext = {
  storyId?: string;
  parameters?: VrtStoryParameters;
};

// Duck-typed view of what `@storybook/addon-vitest` puts on the test
// context (`context.story = composedStory`, `task.meta.storyId = ...`).
// These are internals, hence the fallback to the global context that our
// optional `storybook-vitest-vrt/preview` decorator maintains.
type StoryLike = {
  id?: string;
  parameters?: { vrt?: VrtStoryParameters };
};

type TestContextLike = {
  story?: StoryLike;
  task?: { meta?: { storyId?: string } };
};

export type StoryContextResult = {
  isStory: boolean;
  storyId: string | undefined;
  parameters: VrtStoryParameters;
};

function globalContext(): VrtGlobalStoryContext | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_STORY_CONTEXT_KEY] as
    | VrtGlobalStoryContext
    | undefined;
}

export function getStoryContext(ctx: unknown): StoryContextResult {
  const context = ctx as TestContextLike;
  const fromGlobal = globalContext();
  const story = context.story;
  const isStory =
    story !== undefined || context.task?.meta?.storyId !== undefined || fromGlobal !== undefined;
  return {
    isStory,
    storyId: story?.id ?? context.task?.meta?.storyId ?? fromGlobal?.storyId,
    parameters: story?.parameters?.vrt ?? fromGlobal?.parameters ?? {},
  };
}

/**
 * The global context must not leak into the next test: a non-story test
 * following a story in the same file would otherwise be captured too.
 */
export function clearGlobalStoryContext(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_STORY_CONTEXT_KEY];
}

import { GLOBAL_STORY_CONTEXT_KEY, type VrtGlobalStoryContext } from './browser/story-context';
import type { VrtStoryParameters } from './types';

// Intentionally untyped against Storybook: the decorator signature is the
// only (very stable) contract this module relies on, which keeps the
// library independent from Storybook major upgrades.
type StoryContextLike = {
  id?: string;
  parameters?: Record<string, unknown>;
};

/**
 * Optional preview annotation. The capture hook primarily reads the story
 * from the test context that `@storybook/addon-vitest` provides; add this
 * to `.storybook/preview.ts` as a fallback that survives addon-internal
 * changes:
 *
 * ```ts
 * import vrtPreview from 'storybook-addon-vrt/preview';
 * export default { decorators: [...vrtPreview.decorators] };
 * ```
 */
const preview = {
  decorators: [
    <T>(storyFn: () => T, context: StoryContextLike): T => {
      const value: VrtGlobalStoryContext = {
        ...(context.id !== undefined ? { storyId: context.id } : {}),
        parameters: (context.parameters?.['vrt'] ?? {}) as VrtStoryParameters,
      };
      (globalThis as Record<string, unknown>)[GLOBAL_STORY_CONTEXT_KEY] = value;
      return storyFn();
    },
  ],
};

export default preview;

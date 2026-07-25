import type { VrtStoryParameters } from './types';

// Untyped against Storybook on purpose: the decorator signature is the only
// (stable) contract, which keeps this addon independent of Storybook majors.
type StoryContextLike = {
  parameters?: Record<string, unknown>;
};

/**
 * Preview annotation that publishes the rendered story's `parameters.vrt` to a
 * window global, so the Node-side capturer applies the same mask/remove/delay
 * as the story declares — for both the live panel and the `snapshot` baseline.
 *
 * ```ts
 * // .storybook/preview.ts
 * import vrtLive from 'storybook-addon-vrt-live/preview';
 * export default { decorators: [...vrtLive.decorators] };
 * ```
 */
const preview = {
  decorators: [
    <T>(storyFn: () => T, context: StoryContextLike): T => {
      (window as { __VRT_LIVE_PARAMS__?: VrtStoryParameters }).__VRT_LIVE_PARAMS__ = (context
        .parameters?.['vrt'] ?? {}) as VrtStoryParameters;
      return storyFn();
    },
  ],
};

export default preview;

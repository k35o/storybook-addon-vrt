import type { Preview } from '@storybook/react-vite';
import vrtPreview from 'storybook-addon-vrt/preview';
import vrtLivePreview from 'storybook-addon-vrt-live/preview';

// The vrt decorator is optional: it exposes `parameters.vrt` to the capture
// hook through a global, as a fallback that does not rely on addon-vitest
// internals. This example uses it to exercise that path.
// vrtLivePreview publishes the same parameters for the live-diff addon's
// Node-side capturer (skip/mask/remove/delay), so its snapshots and live
// captures honor per-story settings.
export default {
  decorators: [...vrtPreview.decorators, ...vrtLivePreview.decorators],
} satisfies Preview;

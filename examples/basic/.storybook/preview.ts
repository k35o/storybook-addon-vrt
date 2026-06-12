import type { Preview } from '@storybook/react-vite';
import vrtPreview from 'storybook-addon-vrt/preview';

// The vrt decorator is optional: it exposes `parameters.vrt` to the capture
// hook through a global, as a fallback that does not rely on addon-vitest
// internals. This example uses it to exercise that path.
export default {
  decorators: [...vrtPreview.decorators],
} satisfies Preview;

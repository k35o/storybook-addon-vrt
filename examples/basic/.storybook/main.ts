import type { StorybookConfig } from '@storybook/react-vite';

export default {
  addons: ['@storybook/addon-vitest'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  stories: ['../src/**/*.stories.tsx'],
} satisfies StorybookConfig;

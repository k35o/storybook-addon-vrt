import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    ignorePatterns: ['**/dist/**', '**/storybook-static/**', '**/CHANGELOG.md', '**/.vrt/**'],
    singleQuote: true,
    overrides: [
      {
        // The Storybook addon catalog requires `storybook-addon` to be the
        // first keyword, but sortPackageJson orders keywords alphabetically.
        files: ['packages/storybook-addon-vrt/package.json'],
        options: {
          sortPackageJson: false,
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/storybook-static/**', '**/CHANGELOG.md', '**/.vrt/**'],
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc,yaml,yml,md}': 'vp check --fix',
  },
});

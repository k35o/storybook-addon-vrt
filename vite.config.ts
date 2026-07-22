import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    // .changeset (ledger.yaml etc.) is generated and owned by pnpm, so our
    // formatting rules must not apply to it.
    ignorePatterns: [
      '**/dist/**',
      '**/storybook-static/**',
      '**/CHANGELOG.md',
      '**/.vrt/**',
      '.changeset',
    ],
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
    ignorePatterns: [
      '**/dist/**',
      '**/storybook-static/**',
      '**/CHANGELOG.md',
      '**/.vrt/**',
      '.changeset',
    ],
  },
  staged: {
    '*.{js,ts,cjs,mjs,jsx,tsx,json,jsonc,yaml,yml,md}': 'vp check --fix',
  },
});

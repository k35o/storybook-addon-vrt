import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  pack: {
    dts: true,
    entry: ['src/**/*.ts', 'src/**/*.tsx', '!src/**/*.test.ts'],
    format: 'esm',
    outDir: 'dist',
    unbundle: true,
  },
});

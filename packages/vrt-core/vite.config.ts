import { defineConfig } from 'vite-plus';

export default defineConfig({
  fmt: {
    singleQuote: true,
  },
  pack: {
    dts: true,
    entry: ['src/**/*.ts'],
    format: 'esm',
    outDir: 'dist',
    unbundle: true,
  },
});

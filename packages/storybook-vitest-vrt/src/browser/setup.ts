import { afterEach } from 'vitest';
import type { VrtRuntimeOptions } from '../types';
import { captureStory } from './capture';

// Serialized by the vitest plugin into `test.env`; Vitest exposes that as
// `import.meta.env` inside the browser runtime.
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const raw = env?.['__VRT_OPTIONS__'];

if (raw !== undefined && raw !== '') {
  const options = JSON.parse(raw) as VrtRuntimeOptions;
  const usedKeys = new Set<string>();
  afterEach(async (ctx) => {
    await captureStory(ctx, options, usedKeys);
  });
}

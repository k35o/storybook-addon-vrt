import { describe, expect, it } from 'vitest';
import { deriveKey, sanitizeStoryName } from './key';

describe('sanitizeStoryName', () => {
  it('keeps plain story names untouched', () => {
    expect(sanitizeStoryName('Primary')).toBe('Primary');
  });

  it('replaces path separators and reserved characters with hyphens', () => {
    expect(sanitizeStoryName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('replaces spaces and collapses consecutive replacements', () => {
    expect(sanitizeStoryName('With  Play / Function')).toBe('With-Play-Function');
  });

  it('strips control characters', () => {
    const name = 'a' + String.fromCharCode(0) + 'b' + String.fromCharCode(31) + 'c';
    expect(sanitizeStoryName(name)).toBe('a-b-c');
  });

  it('removes trailing dots, spaces and hyphens (Windows-invalid endings)', () => {
    expect(sanitizeStoryName('Story...')).toBe('Story');
    expect(sanitizeStoryName('Story / ')).toBe('Story');
  });

  it('falls back to "story" when nothing survives', () => {
    expect(sanitizeStoryName('///')).toBe('story');
    expect(sanitizeStoryName('')).toBe('story');
  });
});

describe('deriveKey', () => {
  it('builds the key from the root-relative stories path and the story name', () => {
    expect(
      deriveKey({
        filePath: '/repo/src/components/button/button.stories.tsx',
        testName: 'Primary',
        root: '/repo',
      }),
    ).toBe('src/components/button/button.stories.tsx/Primary.png');
  });

  it('normalizes Windows separators', () => {
    expect(
      deriveKey({
        filePath: 'C:\\repo\\src\\button.stories.tsx',
        testName: 'Primary',
        root: 'C:\\repo',
      }),
    ).toBe('src/button.stories.tsx/Primary.png');
  });

  it('appends the browser name before the extension when provided', () => {
    expect(
      deriveKey({
        filePath: '/repo/src/button.stories.tsx',
        testName: 'Primary',
        root: '/repo',
        browserName: 'chromium',
      }),
    ).toBe('src/button.stories.tsx/Primary.chromium.png');
  });

  it('keeps a file outside the root usable by stripping leading slashes', () => {
    expect(
      deriveKey({
        filePath: '/elsewhere/button.stories.tsx',
        testName: 'Primary',
        root: '/repo',
      }),
    ).toBe('elsewhere/button.stories.tsx/Primary.png');
  });

  it('falls back to "unknown" when the file path is missing', () => {
    expect(deriveKey({ filePath: '', testName: 'Primary', root: '/repo' })).toBe(
      'unknown/Primary.png',
    );
  });
});

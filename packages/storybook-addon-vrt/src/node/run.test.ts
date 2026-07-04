import { describe, expect, it } from 'vitest';
import { isReservedPassthrough } from './run';

describe('isReservedPassthrough', () => {
  it('rejects flags that steer selection, project, or watch', () => {
    for (const arg of ['--changed', '--watch', '-w', '--project', '--project=storybook', '--ui']) {
      expect(isReservedPassthrough(arg)).toBe(true);
    }
  });

  it('rejects bundled short clusters that contain watch (-uw would hang the run)', () => {
    expect(isReservedPassthrough('-uw')).toBe(true);
    expect(isReservedPassthrough('-wu')).toBe(true);
    expect(isReservedPassthrough('-abw')).toBe(true);
  });

  it('allows harmless passthrough args', () => {
    for (const arg of [
      '-u',
      '-t',
      '--headless',
      '--browser.headless',
      '--reporter=dot',
      'src/button.stories.tsx',
    ]) {
      expect(isReservedPassthrough(arg)).toBe(false);
    }
  });
});

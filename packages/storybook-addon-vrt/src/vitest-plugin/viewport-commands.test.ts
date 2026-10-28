import { describe, expect, it } from 'vitest';
import { viewportToFit } from './viewport-commands';

const landscape = { width: 1200, height: 900 };
const portrait = { width: 414, height: 896 };

describe('viewportToFit', () => {
  it('keeps the viewport when the box fits', () => {
    expect(viewportToFit(landscape, { x: 0, y: 0, width: 1200, height: 900 })).toBeUndefined();
  });

  it('keeps the viewport when a box no larger than it sits partly outside it', () => {
    expect(viewportToFit(landscape, { x: 0, y: 600, width: 300, height: 600 })).toBeUndefined();
  });

  it('grows the height down to the bottom edge of a taller box', () => {
    expect(viewportToFit(portrait, { x: 0, y: 200, width: 300, height: 1500 })).toEqual({
      width: 414,
      height: 1700,
    });
  });

  it('grows the width out to the right edge of a wider box', () => {
    expect(viewportToFit(landscape, { x: 20, y: 20, width: 2000, height: 100 })).toEqual({
      width: 2020,
      height: 900,
    });
  });

  it('rounds fractional edges up', () => {
    expect(viewportToFit(landscape, { x: 0, y: 0.5, width: 1200, height: 900.25 })).toEqual({
      width: 1200,
      height: 901,
    });
  });

  it('grows to at least the box size when the box starts above or left of the page', () => {
    expect(viewportToFit(portrait, { x: -10, y: -300, width: 1300, height: 2000 })).toEqual({
      width: 1300,
      height: 2000,
    });
  });

  it('keeps a landscape viewport wider than tall when a taller box needs room', () => {
    expect(viewportToFit(landscape, { x: 0, y: 0, width: 1200, height: 2000 })).toEqual({
      width: 2001,
      height: 2000,
    });
  });

  it('keeps a portrait viewport at least as tall as wide when a wider box needs room', () => {
    expect(viewportToFit(portrait, { x: 0, y: 0, width: 1000, height: 100 })).toEqual({
      width: 1000,
      height: 1000,
    });
  });

  it('keeps a square viewport no wider than tall, since Chromium counts a square as portrait', () => {
    expect(
      viewportToFit({ width: 800, height: 800 }, { x: 0, y: 0, width: 1000, height: 100 }),
    ).toEqual({
      width: 1000,
      height: 1000,
    });
  });
});

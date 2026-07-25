/** Per-story capture overrides, read from `parameters.vrt` of a story. */
export type VrtStoryParameters = {
  /** Skip capturing this story. */
  skip?: boolean;
  /** Extra milliseconds to wait before the stability checks. */
  delay?: number;
  /** CSS selector(s) whose elements are covered by an opaque overlay. */
  mask?: string | string[];
  /** CSS selector(s) whose elements are removed from layout (`display: none`). */
  remove?: string | string[];
  /**
   * What to capture: the whole viewport (default) or the first element
   * matching a CSS selector.
   * @default 'viewport'
   */
  capture?: 'viewport' | (string & {});
};

export type StabilityOptions = {
  /** Max screenshots taken while waiting for two consecutive equal hashes. */
  retries: number;
  /** Milliseconds between two stability screenshots. */
  interval: number;
  /** Inject CSS that disables animations, transitions and the caret. */
  disableAnimations: boolean;
};

export const DEFAULT_STABILITY: StabilityOptions = {
  retries: 5,
  interval: 100,
  disableAnimations: true,
};

/** Outcome of comparing a current capture against a baseline image. */
export type CompareResult = {
  status: 'passed' | 'changed' | 'added';
  reason?: 'pixel-diff' | 'dimension-diff' | 'no-baseline';
  mismatchedPixels: number;
  mismatchRatio: number;
  dimensions?: {
    baseline: [width: number, height: number];
    current: [width: number, height: number];
  };
};

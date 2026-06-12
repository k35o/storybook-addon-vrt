export type VrtStatus = 'passed' | 'changed' | 'added' | 'deleted';

export type VrtFailOn = Exclude<VrtStatus, 'passed'>;

export type VrtStabilityOptions = {
  /**
   * How many screenshots are taken at most until two consecutive ones
   * have the same hash.
   * @default 5
   */
  retries?: number;
  /**
   * Milliseconds to wait between two stability screenshots.
   * @default 100
   */
  interval?: number;
  /**
   * Inject a stylesheet that disables CSS animations, transitions and the
   * text caret while capturing.
   * @default true
   */
  disableAnimations?: boolean;
};

export type VrtOptions = {
  /**
   * Whether the capture hook is injected into the Vitest project.
   * Disabled runs add zero overhead to a normal `vitest run`.
   * @default !!process.env.VRT
   */
  enabled?: boolean;
  /**
   * Base directory for all VRT artifacts, relative to the Vitest project
   * root. `expectedDir`, `actualDir` and `diffDir` are derived from it
   * unless set explicitly.
   * @default '.vrt'
   */
  baseDir?: string;
  /** @default `${baseDir}/expected` */
  expectedDir?: string;
  /** @default `${baseDir}/actual` */
  actualDir?: string;
  /** @default `${baseDir}/diff` */
  diffDir?: string;
  /**
   * Append the browser name (e.g. `.chromium`) to every screenshot key.
   * Required when the Vitest project runs multiple browser instances,
   * otherwise they would overwrite each other.
   * @default false
   */
  browserNameSuffix?: boolean;
  stability?: VrtStabilityOptions;
  /**
   * Per-pixel color difference threshold passed to pixelmatch (0-1).
   * @default 0.1
   */
  threshold?: number;
  /**
   * Number of mismatched pixels tolerated before a pair counts as changed.
   * @default 0
   */
  allowedMismatchedPixels?: number;
  /**
   * Ratio (0-1) of mismatched pixels tolerated before a pair counts as
   * changed. When both limits are set the stricter one wins.
   * @default 0
   */
  allowedMismatchedPixelRatio?: number;
  /**
   * Which categories make `svrt compare` exit with code 1.
   * @default ['changed', 'added', 'deleted']
   */
  failOn?: VrtFailOn[];
};

/** Story-level overrides, read from `parameters.vrt` of a story. */
export type VrtStoryParameters = {
  /** Skip capturing this story (the Vitest test itself still runs). */
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

export type ResolvedVrtConfig = {
  enabled: boolean;
  root: string;
  baseDir: string;
  expectedDir: string;
  actualDir: string;
  diffDir: string;
  browserNameSuffix: boolean;
  stability: Required<VrtStabilityOptions>;
  threshold: number;
  allowedMismatchedPixels: number | undefined;
  allowedMismatchedPixelRatio: number | undefined;
  failOn: VrtFailOn[];
};

/** Options serialized into `test.env` for the browser-side capture hook. */
export type VrtRuntimeOptions = {
  root: string;
  baseDir: string;
  actualDir: string;
  diffDir: string;
  browserNameSuffix: boolean;
  stability: Required<VrtStabilityOptions>;
};

export type VrtReportItem = {
  key: string;
  status: VrtStatus;
  paths: {
    expected: string | null;
    actual: string | null;
    diff: string | null;
  };
  mismatchedPixels?: number;
  mismatchRatio?: number;
  dimensions?: {
    expected: [width: number, height: number];
    actual: [width: number, height: number];
  };
};

export type VrtReportSummary = {
  total: number;
  passed: number;
  changed: number;
  added: number;
  deleted: number;
  failed: boolean;
};

export type VrtReport = {
  version: 1;
  createdAt: string;
  options: {
    threshold: number;
    allowedMismatchedPixels?: number;
    allowedMismatchedPixelRatio?: number;
    failOn: VrtFailOn[];
  };
  dirs: {
    expected: string;
    actual: string;
    diff: string;
  };
  summary: VrtReportSummary;
  items: VrtReportItem[];
};

// Pure string helpers shared by the browser runtime; node:path is not
// available here, so paths are handled as posix-style strings.

export function toPosixPath(p: string): string {
  return p.replaceAll('\\', '/');
}

// Windows refuses these as file name stems, even with an extension.
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com\d|lpt\d)$/iu;

/** Makes a story/test name safe to use as a file name on every platform. */
export function sanitizeStoryName(name: string): string {
  const sanitized = name
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\p{Cc} ]/gu, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/[\s.-]+$/gu, '');
  if (sanitized === '') return 'story';
  return WINDOWS_RESERVED_NAMES.test(sanitized) ? `${sanitized}-` : sanitized;
}

export type DeriveKeyInput = {
  /** Absolute path of the stories file (the Vitest test file). */
  filePath: string;
  /** Test name, which addon-vitest derives from the story name. */
  testName: string;
  /** Absolute Vitest project root. */
  root: string;
  /** Browser name appended before `.png` when multiple instances run. */
  browserName?: string;
};

/**
 * Derives the screenshot key: the stories file path relative to the project
 * root, with one PNG per story below it. Example:
 * `src/components/button/button.stories.tsx/Primary.png`
 */
export function deriveKey(input: DeriveKeyInput): string {
  const file = toPosixPath(input.filePath);
  const root = toPosixPath(input.root).replace(/\/+$/u, '');
  const relative =
    root !== '' && file.startsWith(`${root}/`)
      ? file.slice(root.length + 1)
      : file.replace(/^\/+/u, '');
  const directory = relative === '' ? 'unknown' : relative;
  const suffix = input.browserName ? `.${input.browserName}` : '';
  return `${directory}/${sanitizeStoryName(input.testName)}${suffix}.png`;
}

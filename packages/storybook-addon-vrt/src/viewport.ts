/** Size of the Playwright page that hosts Vitest's tester iframe. */
export type ViewportSize = { width: number; height: number };

/** Server commands the plugin registers for the capture hook. */
export const FIT_VIEWPORT_COMMAND = '__vrt_fitViewport';
export const RESTORE_VIEWPORT_COMMAND = '__vrt_restoreViewport';

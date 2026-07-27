/** The request the panel is currently waiting on, or null when idle. */
export type Pending = { requestId: string; storyId: string } | null;

export type ResponseVerdict =
  /** Not the response we are waiting for (stale or duplicate) — drop it. */
  | 'ignore'
  /** Ours, but the panel has moved to another story — stop waiting, show nothing. */
  | 'settle'
  /** Ours, for the story on screen — stop waiting and render it. */
  | 'apply';

/**
 * Decides what to do with a response from the server.
 *
 * Two failure modes this exists to prevent:
 *
 * 1. A response that is ours must always stop the spinner. Correlating against
 *    a counter shared with other request kinds meant an unrelated request could
 *    bump it, the real response was then dropped, and the panel stayed "busy"
 *    forever.
 * 2. A response must never render under a different story. Captures take
 *    seconds; switching stories mid-capture would otherwise show story A's
 *    diff while story B is selected.
 */
export function classifyResponse(input: {
  pending: Pending;
  response: { requestId: string; storyId: string };
  currentStoryId: string | undefined;
}): ResponseVerdict {
  const { pending, response, currentStoryId } = input;
  if (pending === null || pending.requestId !== response.requestId) return 'ignore';
  return response.storyId === currentStoryId ? 'apply' : 'settle';
}

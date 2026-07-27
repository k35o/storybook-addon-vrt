import { describe, expect, it } from 'vitest';
import { classifyResponse, type Pending } from './correlation';

const pending: Pending = { requestId: '1', storyId: 'card--default' };

describe('classifyResponse', () => {
  it('applies the response for the pending request on the current story', () => {
    expect(
      classifyResponse({
        pending,
        response: { requestId: '1', storyId: 'card--default' },
        currentStoryId: 'card--default',
      }),
    ).toBe('apply');
  });

  it('ignores a response when nothing is pending', () => {
    expect(
      classifyResponse({
        pending: null,
        response: { requestId: '1', storyId: 'card--default' },
        currentStoryId: 'card--default',
      }),
    ).toBe('ignore');
  });

  it('ignores a response for a superseded request', () => {
    expect(
      classifyResponse({
        pending: { requestId: '2', storyId: 'card--default' },
        response: { requestId: '1', storyId: 'card--default' },
        currentStoryId: 'card--default',
      }),
    ).toBe('ignore');
  });

  // Regression: another request kind used to share the correlation counter, so
  // this response was dropped and the panel stayed busy forever.
  it('still settles our request even while a different story is selected', () => {
    expect(
      classifyResponse({
        pending,
        response: { requestId: '1', storyId: 'card--default' },
        currentStoryId: 'button--primary',
      }),
    ).toBe('settle');
  });

  // Regression: a slow capture for story A must not render under story B.
  it('never applies a response belonging to another story', () => {
    const verdict = classifyResponse({
      pending: { requestId: '7', storyId: 'card--default' },
      response: { requestId: '7', storyId: 'card--default' },
      currentStoryId: undefined,
    });
    expect(verdict).toBe('settle');
    expect(verdict).not.toBe('apply');
  });
});

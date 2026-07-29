import { describe, expect, it } from 'vitest';

import { SHEET_POLL_LOG_LIMIT, visibleSheetPollRuns } from './sheet-polling';

describe('visible Sheet poll runs', () => {
  it('renders only the newest 10 entries returned in newest-first order', () => {
    const runs = Array.from({ length: 14 }, (_, index) => `poll-${index + 1}`);

    expect(visibleSheetPollRuns(runs)).toEqual(runs.slice(0, SHEET_POLL_LOG_LIMIT));
    expect(visibleSheetPollRuns(runs)).toHaveLength(10);
  });
});

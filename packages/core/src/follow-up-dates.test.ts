import { describe, expect, it } from 'vitest';

import { demoWorkspace } from './demo-data';

describe('follow-up date invariant', () => {
  it('gives every follow-up an initial instant at or before its due instant', () => {
    for (const followUp of demoWorkspace.followUps) {
      expect(new Date(followUp.initialAt).getTime()).toBeLessThanOrEqual(
        new Date(followUp.dueAt).getTime(),
      );
    }
  });
});

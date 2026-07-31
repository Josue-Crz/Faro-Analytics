import { describe, expect, it } from 'vitest';

import { demoWorkspace } from '../src';

describe('demo contact schedules', () => {
  it('gives every contact a typed future next action', () => {
    const referenceTime = new Date('2026-07-29T17:00:00.000Z').getTime();
    expect(demoWorkspace.contacts).not.toHaveLength(0);
    for (const contact of demoWorkspace.contacts) {
      expect(new Date(contact.nextActionAt).getTime()).toBeGreaterThan(referenceTime);
      expect(['INITIAL_OUTREACH', 'FOLLOW_UP', 'CONSENT_REVIEW', 'SCHEDULE_REVIEW']).toContain(
        contact.nextActionType,
      );
    }
  });
});

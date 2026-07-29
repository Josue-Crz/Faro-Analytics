import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  $transaction: vi.fn(),
  auditEvent: { create: vi.fn() },
  campaign: { findFirst: vi.fn() },
  membership: { update: vi.fn() },
}));

vi.mock('@faro/database', () => ({ prisma: database }));

import type { AuthenticatedFaroSession } from './auth';
import { setWorkspaceFocus, WorkspaceFocusError } from './workspace-focus';

const session: AuthenticatedFaroSession = {
  email: 'josue@example.test',
  expiresAt: Date.now() + 60_000,
  focusedCampaignId: null,
  name: 'Josue Cruz',
  userId: 'user-josue',
  workspaceId: 'workspace-josue',
};

beforeEach(() => {
  vi.clearAllMocks();
  database.$transaction.mockResolvedValue([]);
  database.auditEvent.create.mockReturnValue({ operation: 'audit' });
  database.membership.update.mockReturnValue({ operation: 'membership' });
});

describe('persistent workspace focus', () => {
  it('scopes a campaign lookup and membership update to the authenticated workspace', async () => {
    database.campaign.findFirst.mockResolvedValue({
      id: 'campaign-a',
      name: 'Campaign A',
    });

    const result = await setWorkspaceFocus(session, 'campaign-a');

    expect(database.campaign.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          archivedAt: null,
          id: 'campaign-a',
          workspaceId: 'workspace-josue',
        },
      }),
    );
    expect(database.membership.update).toHaveBeenCalledWith({
      data: { focusedCampaignId: 'campaign-a' },
      where: {
        workspaceId_userId: {
          userId: 'user-josue',
          workspaceId: 'workspace-josue',
        },
      },
    });
    expect(result.scope).toEqual({ campaignId: 'campaign-a', kind: 'CAMPAIGN' });
  });

  it('rejects a campaign outside the current workspace without changing focus', async () => {
    database.campaign.findFirst.mockResolvedValue(null);

    await expect(setWorkspaceFocus(session, 'campaign-other')).rejects.toEqual(
      new WorkspaceFocusError('CAMPAIGN_NOT_FOUND'),
    );
    expect(database.membership.update).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('returns to the main workspace only through an explicit persisted update', async () => {
    const focusedSession = { ...session, focusedCampaignId: 'campaign-a' };

    const result = await setWorkspaceFocus(focusedSession, null);

    expect(database.campaign.findFirst).not.toHaveBeenCalled();
    expect(database.membership.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { focusedCampaignId: null } }),
    );
    expect(database.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'MAIN_WORKSPACE_FOCUS_SELECTED',
          metadata: {
            focusedCampaignId: null,
            previousCampaignId: 'campaign-a',
          },
        }),
      }),
    );
    expect(result.scope).toEqual({ campaignId: null, kind: 'WORKSPACE' });
  });
});

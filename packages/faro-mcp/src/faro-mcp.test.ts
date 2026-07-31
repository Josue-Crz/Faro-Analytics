import { describe, expect, it, vi } from 'vitest';

import type { FaroMcpBackend } from './contracts.js';
import { InMemoryMcpAuditSink } from './development.js';
import { ScopedEnvironmentAuthorizer } from './security.js';
import { executeFaroTool } from './tools.js';

function backend(): FaroMcpBackend {
  return {
    getDueFollowups: vi.fn(async () => []),
    getGenerationRequest: vi.fn(async () => ({ id: 'request-one', status: 'AWAITING_BOB' })),
    claimGenerationRequest: vi.fn(async () => ({ id: 'request-one', status: 'PROCESSING' })),
    getContactContext: vi.fn(async () => ({
      id: 'contact-one',
      firstName: 'Avery',
      consentStatus: 'OPTED_IN',
      nextActionAt: '2026-08-03T16:30:00.000Z',
      nextActionType: 'FOLLOW_UP',
      suppressed: false,
    })),
    getOrganizationContext: vi.fn(async () => null),
    getCampaignContext: vi.fn(async () => null),
    getInteractionHistory: vi.fn(async () => []),
    saveBobDraft: vi.fn(async () => ({ id: 'draft-one', approvalStatus: 'PENDING' })),
    saveResponseAnalysis: vi.fn(async () => ({ id: 'analysis-one', humanReviewed: false })),
    markGenerationFailed: vi.fn(async () => ({ id: 'request-one', status: 'FAILED' })),
  };
}

const authorizer = () =>
  new ScopedEnvironmentAuthorizer({
    workspaceId: 'ws-one',
    actorId: 'bob-test',
    tokenConfigured: true,
  });

describe('Faro MCP tool boundary', () => {
  it('returns both required dates for each due follow-up', async () => {
    const data = backend();
    vi.mocked(data.getDueFollowups).mockResolvedValue([
      {
        campaignId: 'campaign-one',
        contactId: 'contact-one',
        dueAt: '2026-07-11T12:00:00.000Z',
        id: 'follow-up-one',
        initialAt: '2026-07-10T12:00:00.000Z',
        priority: 'MEDIUM',
        reason: 'A response needs review.',
      },
    ]);

    await expect(
      executeFaroTool(
        'faro_get_due_followups',
        {
          dueBefore: '2026-07-12T12:00:00.000Z',
          limit: 25,
          workspaceId: 'ws-one',
        },
        { authorizer: authorizer(), audit: new InMemoryMcpAuditSink(), backend: data },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        dueAt: '2026-07-11T12:00:00.000Z',
        initialAt: '2026-07-10T12:00:00.000Z',
      }),
    ]);
  });

  it('runs the deterministic outreach optimizer inside the authorized workspace', async () => {
    const audit = new InMemoryMcpAuditSink();
    const result = await executeFaroTool(
      'faro_calculate_outreach_window',
      {
        workspaceId: 'ws-one',
        optimizerInput: {
          referenceTime: '2026-07-10T12:00:00.000Z',
          contact: {
            id: 'contact-one',
            timeZone: 'America/Los_Angeles',
            consentStatus: 'OPTED_IN',
            suppressed: false,
            preferredChannel: 'EMAIL',
            quietHours: [{ start: '20:00', end: '08:00' }],
          },
          workspace: {
            id: 'ws-one',
            timeZone: 'America/Los_Angeles',
            quietHours: [{ start: '21:00', end: '07:00' }],
          },
          campaign: { id: 'campaign-one', channel: 'EMAIL', priority: 'HIGH' },
          options: { horizonDays: 2, intervalMinutes: 30, alternativeCount: 2 },
        },
      },
      {
        authorizer: authorizer(),
        audit,
        backend: backend(),
        now: () => new Date('2026-07-10T12:00:00.000Z'),
      },
    );

    expect(result).toMatchObject({
      status: 'RECOMMENDED',
      algorithmVersion: 'faro-window-v1.0.0',
    });
    expect(audit.events[0]).toMatchObject({
      toolName: 'faro_calculate_outreach_window',
      outcome: 'SUCCEEDED',
    });
  });

  it('authorizes workspace access, returns minimized context, and audits the read', async () => {
    const audit = new InMemoryMcpAuditSink();
    const result = await executeFaroTool(
      'faro_get_contact_context',
      { workspaceId: 'ws-one', requestId: 'request-one', contactId: 'contact-one' },
      {
        authorizer: authorizer(),
        audit,
        backend: backend(),
        now: () => new Date('2026-07-10T12:00:00Z'),
      },
    );

    expect(result).toEqual({
      id: 'contact-one',
      firstName: 'Avery',
      consentStatus: 'OPTED_IN',
      nextActionAt: '2026-08-03T16:30:00.000Z',
      nextActionType: 'FOLLOW_UP',
      suppressed: false,
    });
    expect(audit.events).toEqual([
      expect.objectContaining({ toolName: 'faro_get_contact_context', outcome: 'SUCCEEDED' }),
    ]);
  });

  it('denies cross-workspace access before invoking the backend and audits denial', async () => {
    const audit = new InMemoryMcpAuditSink();
    const data = backend();

    await expect(
      executeFaroTool(
        'faro_get_contact_context',
        { workspaceId: 'ws-two', requestId: 'request-one', contactId: 'contact-one' },
        { authorizer: authorizer(), audit, backend: data },
      ),
    ).rejects.toMatchObject({ code: 'MCP_WORKSPACE_ACCESS_DENIED' });
    expect(data.getContactContext).not.toHaveBeenCalled();
    expect(audit.events[0]).toMatchObject({ workspaceId: 'ws-two', outcome: 'DENIED' });
  });

  it('strictly validates IBM Bob draft writes before calling persistence', async () => {
    const data = backend();
    const audit = new InMemoryMcpAuditSink();
    await expect(
      executeFaroTool(
        'faro_save_bob_draft',
        {
          workspaceId: 'ws-one',
          requestId: 'request-one',
          generatedAt: '2026-07-10T12:00:00.000Z',
          draft: {
            subject: 'Hello',
            bodyText: 'Would you be open to a conversation?',
            rationale: 'Uses supplied facts.',
            recommendedNextAction: 'Human review',
            suggestedFollowUpAt: null,
            confidence: 2,
            riskFlags: [],
            sourceRecordIds: ['contact-one'],
          },
        },
        { authorizer: authorizer(), audit, backend: data },
      ),
    ).rejects.toThrow();
    expect(data.saveBobDraft).not.toHaveBeenCalled();
    expect(audit.events[0]).toMatchObject({ outcome: 'FAILED' });
  });
});

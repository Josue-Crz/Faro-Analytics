import { IbmBobMcpAdapter, InMemoryBobGenerationRequestStore } from '@faro/ibm-bob';
import { describe, expect, it } from 'vitest';

import { BobWorkflowFaroMcpBackend, type FaroMcpContextRepository } from './bob-backend.js';

const emptyContext: FaroMcpContextRepository = {
  getDueFollowups: async () => [],
  getContactContext: async () => null,
  getOrganizationContext: async () => null,
  getCampaignContext: async () => null,
  getInteractionHistory: async () => [],
};

describe('Bob-backed Faro MCP backend', () => {
  it('claims and saves a validated draft with IBM Bob provenance and pending human review', async () => {
    const now = () => new Date('2026-07-10T12:00:00.000Z');
    const store = new InMemoryBobGenerationRequestStore(now, () => 'request-one');
    const workflow = new IbmBobMcpAdapter(store, now);
    await workflow.requestOutreachDraft(
      {
        workspaceId: 'ws-one',
        contact: { id: 'contact-one', consentStatus: 'OPTED_IN', tags: [] },
        campaign: { id: 'campaign-one', name: 'Fictional campaign', objective: 'Invite a call' },
        interactionHistory: [],
        selectedTone: 'WARM',
        objective: 'FOLLOW_UP',
        approvedSourceRecordIds: ['contact-one', 'campaign-one'],
      },
      'user-one',
    );
    const backend = new BobWorkflowFaroMcpBackend(store, emptyContext, now);

    await backend.claimGenerationRequest('ws-one', 'request-one');
    await expect(
      backend.saveBobDraft(
        'ws-one',
        'request-one',
        {
          subject: 'A short conversation',
          bodyText: 'Would you be open to a short conversation?',
          rationale: 'Uses only the campaign objective.',
          recommendedNextAction: 'Review the draft.',
          suggestedFollowUpAt: null,
          confidence: 0.8,
          riskFlags: [],
          sourceRecordIds: ['contact-one', 'campaign-one'],
        },
        '2026-07-10T12:00:00.000Z',
        {
          resultProvenance: 'IBM_BOB',
          providerOperationId: 'bob-operation-one',
          completedBy: 'ibm-bob-test',
        },
      ),
    ).resolves.toEqual({
      requestId: 'request-one',
      status: 'COMPLETED',
      resultProvenance: 'IBM_BOB',
      approvalStatus: 'PENDING_REVIEW',
      externalOutreachSent: false,
    });
  });

  it('allows context only when its record ID is approved on the processing request', async () => {
    const now = () => new Date('2026-07-10T12:00:00.000Z');
    const store = new InMemoryBobGenerationRequestStore(now, () => 'request-one');
    const workflow = new IbmBobMcpAdapter(store, now);
    await workflow.requestOutreachDraft(
      {
        workspaceId: 'ws-one',
        contact: { id: 'contact-one', consentStatus: 'OPTED_IN', tags: [] },
        campaign: { id: 'campaign-one', name: 'Fictional campaign', objective: 'Invite a call' },
        interactionHistory: [],
        selectedTone: 'WARM',
        objective: 'FOLLOW_UP',
        approvedSourceRecordIds: ['contact-one', 'campaign-one'],
      },
      'user-one',
    );
    const backend = new BobWorkflowFaroMcpBackend(store, {
      ...emptyContext,
      getContactContext: async (_workspaceId, contactId) => ({
        id: contactId,
        consentStatus: 'OPTED_IN',
        suppressed: false,
      }),
    });
    await backend.claimGenerationRequest('ws-one', 'request-one');

    await expect(
      backend.getContactContext('ws-one', 'request-one', 'contact-one'),
    ).resolves.toMatchObject({ id: 'contact-one' });
    await expect(
      backend.getContactContext('ws-one', 'request-one', 'contact-not-approved'),
    ).rejects.toThrow(/not approved/i);
  });
});

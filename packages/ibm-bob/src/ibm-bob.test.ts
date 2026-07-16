import { describe, expect, it } from 'vitest';

import { IbmBobMcpAdapter } from './adapters/mcp';
import {
  IbmBobRuntimeUnavailableError,
  UnavailableIbmBobRuntimeAdapter,
} from './adapters/unavailable';
import type { OutreachDraftInput } from './contracts/outreach';
import { validateOutreachDraftResult } from './validation/output';
import { InMemoryBobGenerationRequestStore } from './workflows/request-store';

const input: OutreachDraftInput = {
  workspaceId: 'ws-one',
  contact: {
    id: 'contact-one',
    firstName: 'Avery',
    consentStatus: 'OPTED_IN',
    tags: [],
  },
  campaign: {
    id: 'campaign-one',
    name: 'Community partners',
    objective: 'Invite a conversation about a fictional community program.',
  },
  interactionHistory: [],
  selectedTone: 'WARM',
  objective: 'INITIAL_INTRODUCTION',
  approvedSourceRecordIds: ['contact-one', 'campaign-one'],
};

const output = {
  subject: 'A conversation about the community program',
  bodyText: 'Hello Avery, would you be open to a short conversation?',
  rationale: 'The draft uses only the supplied campaign objective.',
  recommendedNextAction: 'Review and approve or edit the draft.',
  suggestedFollowUpAt: null,
  confidence: 0.72,
  riskFlags: [],
  sourceRecordIds: ['contact-one', 'campaign-one'],
};

describe('IBM Bob boundary', () => {
  it('keeps unavailable runtimes explicit instead of returning a fixture result', async () => {
    const adapter = new UnavailableIbmBobRuntimeAdapter();

    await expect(adapter.generateOutreachDraft(input)).rejects.toBeInstanceOf(
      IbmBobRuntimeUnavailableError,
    );
  });

  it('creates an awaiting request and validates the MCP result before completion', async () => {
    const store = new InMemoryBobGenerationRequestStore(
      () => new Date('2026-03-01T12:00:00.000Z'),
      () => 'request-one',
    );
    const adapter = new IbmBobMcpAdapter(store, () => new Date('2026-03-01T12:00:00.000Z'));

    const awaiting = await adapter.requestOutreachDraft(input, 'user-one');
    expect(awaiting.status).toBe('AWAITING_BOB');
    expect(awaiting.request.promptVersion).toBe('outreach-draft.v1');
    expect(awaiting.request.promptText).toContain('untrusted data');
    expect(awaiting.request.promptText).toContain('selected tone');
    expect(awaiting.request.promptText).toContain('approvedSourceRecordIds');
    expect(awaiting.request.promptText).toContain('requires human review');

    await adapter.claimRequest('ws-one', awaiting.request.id);
    const completed = await adapter.saveOutreachDraft('ws-one', awaiting.request.id, output, {
      resultProvenance: 'IBM_BOB',
      providerOperationId: 'bob-operation-one',
      completedBy: 'ibm-bob-test',
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.result).toEqual(output);
    expect(completed.resultProvenance).toBe('IBM_BOB');
  });

  it('rejects extra output keys and cross-workspace request access', async () => {
    expect(() => validateOutreachDraftResult({ ...output, ungoverned: true })).toThrow();

    const store = new InMemoryBobGenerationRequestStore(
      () => new Date('2026-03-01T12:00:00.000Z'),
      () => 'request-one',
    );
    const adapter = new IbmBobMcpAdapter(store);
    const awaiting = await adapter.requestOutreachDraft(input, 'user-one');
    await expect(adapter.claimRequest('ws-two', awaiting.request.id)).rejects.toMatchObject({
      code: 'BOB_REQUEST_NOT_FOUND',
    });
  });

  it('rejects source citations that were not approved for the request', async () => {
    const store = new InMemoryBobGenerationRequestStore(
      () => new Date('2026-03-01T12:00:00.000Z'),
      () => 'request-one',
    );
    const adapter = new IbmBobMcpAdapter(store);
    await adapter.requestOutreachDraft(input, 'user-one');
    await adapter.claimRequest('ws-one', 'request-one');

    await expect(
      adapter.saveOutreachDraft(
        'ws-one',
        'request-one',
        {
          ...output,
          sourceRecordIds: ['record-not-approved'],
        },
        {
          resultProvenance: 'IBM_BOB',
          providerOperationId: 'bob-operation-one',
          completedBy: 'ibm-bob-test',
        },
      ),
    ).rejects.toThrow(/not approved/i);
  });

  it('blocks drafting for suppressed contacts before a request is created', async () => {
    const adapter = new IbmBobMcpAdapter(new InMemoryBobGenerationRequestStore());

    await expect(
      adapter.requestOutreachDraft(
        {
          ...input,
          contact: { ...input.contact, consentStatus: 'SUPPRESSED' },
        },
        'user-one',
      ),
    ).rejects.toThrow(/suppressed/i);
  });

  it('blocks drafting when consent is unknown', async () => {
    const adapter = new IbmBobMcpAdapter(new InMemoryBobGenerationRequestStore());
    await expect(
      adapter.requestOutreachDraft(
        { ...input, contact: { ...input.contact, consentStatus: 'UNKNOWN' } },
        'user-one',
      ),
    ).rejects.toThrow(/requires opted-in or implied consent/i);
  });

  it('rejects governed context that exceeds the bounded prompt budget', async () => {
    const adapter = new IbmBobMcpAdapter(new InMemoryBobGenerationRequestStore());
    await expect(
      adapter.requestOutreachDraft(
        {
          ...input,
          latestResponse: 'x'.repeat(20_000),
          latestResponseSourceRecordId: 'response-one',
          approvedSourceRecordIds: [
            ...input.approvedSourceRecordIds,
            'response-one',
            ...Array.from({ length: 20 }, (_, index) => `interaction-${index}`),
          ],
          interactionHistory: Array.from({ length: 20 }, (_, index) => ({
            id: `interaction-${index}`,
            direction: 'INBOUND' as const,
            channel: 'EMAIL' as const,
            occurredAt: '2026-03-01T12:00:00.000Z',
            bodyText: 'x'.repeat(12_000),
          })),
        },
        'user-one',
      ),
    ).rejects.toThrow(/prompt budget/i);
  });

  it('binds idempotency to the complete governed prompt and detects explicit-key conflicts', async () => {
    const ids = ['request-one', 'request-two'];
    const store = new InMemoryBobGenerationRequestStore(
      () => new Date('2026-03-01T12:00:00.000Z'),
      () => ids.shift() ?? 'unexpected-request',
    );
    const adapter = new IbmBobMcpAdapter(store);

    const first = await adapter.requestOutreachDraft(input, 'user-one');
    const duplicate = await adapter.requestOutreachDraft(input, 'user-one');
    const changedTone = await adapter.requestOutreachDraft(
      { ...input, selectedTone: 'PROFESSIONAL' },
      'user-one',
    );
    expect(duplicate.request.id).toBe(first.request.id);
    expect(changedTone.request.id).not.toBe(first.request.id);

    await expect(
      adapter.requestOutreachDraft({ ...input, selectedTone: 'CONCISE' }, 'user-one', {
        idempotencyKey: first.request.idempotencyKey,
      }),
    ).rejects.toThrow(/different input/i);
  });
});

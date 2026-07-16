import { randomUUID } from 'node:crypto';

import { prisma } from '@faro/database';
import { afterAll, describe, expect, it } from 'vitest';

import { PrismaBobGenerationRequestStore } from './prisma-backend.js';

describe('Prisma IBM Bob request lifecycle', () => {
  afterAll(async () => prisma.$disconnect());

  it('shares an idempotent request and verified draft across store instances', async () => {
    const requestId = `test-bob-request-${randomUUID()}`;
    const idempotencyKey = `test-bob-idempotency-${randomUUID()}`;
    const createdIds = [requestId, `test-audit-${randomUUID()}`, `test-draft-${randomUUID()}`];
    const createId = () => createdIds.shift() ?? randomUUID();
    const store = new PrismaBobGenerationRequestStore(prisma, { createId });
    const input = {
      workspaceId: 'ws-beacon-lab',
      contactId: 'contact-elena-ruiz',
      campaignId: 'campaign-pacific-summit',
      followUpTaskId: 'followup-elena-proposal',
      type: 'OUTREACH_DRAFT' as const,
      promptVersion: 'outreach-draft.v1',
      promptText: 'Governed integration-test prompt.',
      approvedSourceRecordIds: [
        'contact-elena-ruiz',
        'campaign-pacific-summit',
        'followup-elena-proposal',
      ],
      contextVersion: 1,
      idempotencyKey,
      requestedBy: 'user_jordan_lee',
    };

    try {
      const created = await store.create(input);
      expect(created).toMatchObject({ id: requestId, status: 'AWAITING_BOB' });
      await expect(store.create(input)).resolves.toMatchObject({ id: requestId });

      const secondProcessStore = new PrismaBobGenerationRequestStore(prisma);
      await expect(secondProcessStore.get('ws-beacon-lab', requestId)).resolves.toMatchObject({
        promptText: input.promptText,
        approvedSourceRecordIds: input.approvedSourceRecordIds,
      });
      await expect(secondProcessStore.get('another-workspace', requestId)).resolves.toBeNull();

      await secondProcessStore.markProcessing(
        'ws-beacon-lab',
        requestId,
        '2026-07-10T18:00:00.000Z',
      );
      const completed = await secondProcessStore.complete(
        'ws-beacon-lab',
        requestId,
        {
          subject: 'Requested information',
          bodyText: 'Here is the concise follow-up for human review.',
          rationale: 'Uses only approved test sources.',
          recommendedNextAction: 'Review before any delivery.',
          suggestedFollowUpAt: null,
          confidence: 0.8,
          riskFlags: [],
          sourceRecordIds: ['contact-elena-ruiz', 'campaign-pacific-summit'],
        },
        '2026-07-10T18:01:00.000Z',
        {
          resultProvenance: 'IBM_BOB',
          providerOperationId: 'bob-operation-integration-test',
          completedBy: 'ibm-bob-stdio',
        },
      );
      expect(completed).toMatchObject({
        status: 'COMPLETED',
        resultProvenance: 'IBM_BOB',
        providerOperationId: 'bob-operation-integration-test',
      });
      await expect(
        secondProcessStore.complete(
          'ws-beacon-lab',
          requestId,
          completed.result!,
          '2026-07-10T18:01:00.000Z',
          {
            resultProvenance: 'IBM_BOB',
            providerOperationId: 'bob-operation-integration-test',
            completedBy: 'ibm-bob-stdio',
          },
        ),
      ).resolves.toMatchObject({ id: requestId, status: 'COMPLETED' });
    } finally {
      await prisma.bobDraft.deleteMany({ where: { generationRequestId: requestId } });
      await prisma.bobGenerationRequest.deleteMany({ where: { id: requestId } });
      await prisma.auditEvent.deleteMany({
        where: { entityType: 'BobGenerationRequest', entityId: requestId },
      });
    }
  });
});

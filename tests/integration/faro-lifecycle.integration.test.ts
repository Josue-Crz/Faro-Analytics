import { assertWorkspaceMembership, demoWorkspace } from '@faro/core';
import {
  InMemoryBobGenerationRequestStore,
  OUTREACH_DRAFT_PROMPT_VERSION,
  outreachDraftResultSchema,
} from '@faro/ibm-bob';
import { previewContactImport, type SheetFieldMapping } from '@faro/google-sheets';
import {
  InMemoryNotificationAuditSink,
  InMemoryNotificationDeduplicator,
  NotificationDispatcher,
  PreviewNotificationAdapter,
} from '@faro/notifications';
import { optimizeOutreachWindow } from '@faro/optimizer';
import { describe, expect, it } from 'vitest';

describe('Faro governed follow-up lifecycle', () => {
  it('authorizes a workspace, calculates timing, validates context, persists a Bob result, and deduplicates a reminder', async () => {
    const workspaceId = demoWorkspace.workspace.id;
    const member = demoWorkspace.memberships[0]!;
    const scope = assertWorkspaceMembership(demoWorkspace.memberships, workspaceId, member.userId);
    expect(scope.workspaceId).toBe(workspaceId);

    const recommendation = optimizeOutreachWindow({
      referenceTime: '2026-07-10T15:00:00Z',
      campaign: { channel: 'EMAIL', id: 'cmp-test', priority: 'HIGH', sequenceStage: 2 },
      contact: {
        consentStatus: 'OPTED_IN',
        id: 'ct-test',
        preferredChannel: 'EMAIL',
        quietHours: [{ start: '18:00', end: '08:00' }],
        suppressed: false,
        timeZone: 'America/Chicago',
      },
      workspace: {
        id: workspaceId,
        quietHours: [{ start: '18:00', end: '08:00' }],
        timeZone: 'America/Los_Angeles',
      },
      historicalOutcomes: [
        {
          campaignId: 'cmp-test',
          channel: 'EMAIL',
          contactId: 'ct-test',
          respondedAt: '2026-06-24T16:30:00Z',
          sentAt: '2026-06-24T15:30:00Z',
          timeZone: 'America/Chicago',
        },
      ],
    });
    expect(recommendation.status).toBe('RECOMMENDED');
    if (recommendation.status !== 'RECOMMENDED') throw new Error('Expected a recommendation');
    expect(recommendation.primary.reasonCodes).toContain('QUIET_HOURS_RESPECTED');

    const mappings: SheetFieldMapping[] = [
      { sourceColumn: 'Email', targetField: 'email', required: true, transformation: 'LOWERCASE' },
      {
        sourceColumn: 'External ID',
        targetField: 'externalId',
        required: true,
        transformation: 'TRIM',
      },
      {
        sourceColumn: 'Organization',
        targetField: 'organizationName',
        required: false,
        transformation: 'TRIM',
      },
    ];
    const preview = previewContactImport({
      conflictBehavior: 'UPDATE',
      existingContacts: [{ id: 'ct-test', email: 'contact@example.org' }],
      headers: ['Email', 'External ID', 'Organization'],
      mappings,
      rows: [
        { Email: ' Contact@Example.org ', 'External ID': 'EXT-7', Organization: 'Beacon Works' },
        { Email: 'invalid', 'External ID': 'EXT-8', Organization: 'Safe Harbor Co.' },
      ],
    });
    expect(preview.summary).toMatchObject({ rowsRead: 2, rowsUpdate: 1, rowsError: 1 });

    const requestStore = new InMemoryBobGenerationRequestStore(
      () => new Date('2026-07-10T15:05:00Z'),
      () => 'bgr-integration-1',
    );
    const request = await requestStore.create({
      approvedSourceRecordIds: ['ct-test', 'cmp-test'],
      campaignId: 'cmp-test',
      contactId: 'ct-test',
      contextVersion: 1,
      followUpTaskId: 'fu-test',
      idempotencyKey: 'integration:bob:request:1',
      promptText: 'governed prompt context',
      promptVersion: OUTREACH_DRAFT_PROMPT_VERSION,
      requestedBy: member.userId,
      type: 'OUTREACH_DRAFT',
      workspaceId,
    });
    expect(request.status).toBe('AWAITING_BOB');
    await requestStore.markProcessing(workspaceId, request.id, '2026-07-10T15:06:00Z');
    const validatedDraft = outreachDraftResultSchema.parse({
      bodyText: 'A concise, factual follow-up.',
      confidence: 0.8,
      rationale: 'Responds to the recorded request.',
      recommendedNextAction: 'Human review',
      riskFlags: [],
      sourceRecordIds: ['ct-test', 'cmp-test'],
      subject: 'Requested follow-up',
      suggestedFollowUpAt: null,
    });
    const completed = await requestStore.complete(
      workspaceId,
      request.id,
      validatedDraft,
      '2026-07-10T15:07:00Z',
      {
        completedBy: 'ibm-bob-mcp-integration-test',
        providerOperationId: 'bob-operation-integration-1',
        resultProvenance: 'IBM_BOB',
      },
    );
    expect(completed.status).toBe('COMPLETED');

    const clock = () => new Date('2026-07-10T15:08:00Z');
    const adapter = new PreviewNotificationAdapter(clock, () => 'notice-preview-1');
    const audit = new InMemoryNotificationAuditSink();
    const dispatcher = new NotificationDispatcher(
      adapter,
      new InMemoryNotificationDeduplicator(),
      audit,
      clock,
    );
    const reminder = {
      actionUrl: '/follow-ups?task=fu-test',
      bodyText: 'Review the approved timing and draft.',
      channel: 'SMS' as const,
      deduplicationKey: 'fu-test:sms:2026-07-10',
      followUpTaskId: 'fu-test',
      id: 'notice-1',
      kind: 'FOLLOW_UP' as const,
      purpose: 'INTERNAL_REMINDER' as const,
      recipientPhone: '+14155550123',
      scheduledFor: '2026-07-10T15:08:00Z',
      title: 'Follow-up due',
      userId: member.userId,
      workspaceId,
    };
    expect((await dispatcher.dispatch(reminder)).status).toBe('PREVIEWED');
    expect((await dispatcher.dispatch(reminder)).status).toBe('DUPLICATE');
    expect(audit.events).toHaveLength(2);
  });
});

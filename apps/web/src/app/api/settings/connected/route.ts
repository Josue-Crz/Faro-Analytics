import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import { maskPhoneNumber, notificationPreferences } from '@/lib/server/notification-preferences';
import { smsProviderState } from '@/lib/server/twilio';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const [
    workspace,
    membership,
    memberCounts,
    google,
    sheet,
    bobRequests,
    notifications,
    userRecord,
  ] = await Promise.all([
    prisma.workspace.findUnique({
      select: {
        defaultTimezone: true,
        id: true,
        name: true,
        quietHoursEnd: true,
        quietHoursStart: true,
        slug: true,
      },
      where: { id: session.workspaceId },
    }),
    prisma.membership.findUnique({
      select: { role: true },
      where: {
        workspaceId_userId: { userId: session.userId, workspaceId: session.workspaceId },
      },
    }),
    prisma.membership.groupBy({
      _count: { _all: true },
      by: ['role'],
      where: { workspaceId: session.workspaceId },
    }),
    prisma.googleCredential.findUnique({
      select: { grantedScopes: true, updatedAt: true },
      where: { userId: session.userId },
    }),
    prisma.sheetConnection.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { displayName: true, lastSyncedAt: true, status: true, worksheetId: true },
      where: { workspaceId: session.workspaceId },
    }),
    prisma.bobGenerationRequest.findMany({
      orderBy: { requestedAt: 'desc' },
      select: {
        campaign: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
        draft: { select: { approvalStatus: true, provenance: true } },
        id: true,
        promptVersion: true,
        requestedAt: true,
        status: true,
      },
      take: 20,
      where: { workspaceId: session.workspaceId },
    }),
    prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        channel: true,
        createdAt: true,
        deduplicationKey: true,
        errorCode: true,
        id: true,
        message: true,
        provider: true,
        readAt: true,
        scheduledFor: true,
        status: true,
        title: true,
      },
      take: 20,
      where: { userId: session.userId, workspaceId: session.workspaceId },
    }),
    prisma.user.findFirst({
      select: {
        notificationPreferences: true,
        smsConsentAt: true,
        smsOptedOutAt: true,
        smsPhone: true,
        smsVerifiedAt: true,
      },
      where: {
        id: session.userId,
        memberships: { some: { workspaceId: session.workspaceId } },
      },
    }),
  ]);
  if (!workspace || !membership || !userRecord)
    return NextResponse.json({ error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  const providerState = smsProviderState();
  const preferences = notificationPreferences(userRecord.notificationPreferences, workspace);
  return NextResponse.json({
    data: {
      bob: {
        mcpConfigured: Boolean(process.env.FARO_MCP_TOKEN?.trim()),
        requests: bobRequests,
        runtimeAdapter: process.env.BOB_RUNTIME_ADAPTER ?? 'unavailable',
      },
      google: {
        connected: Boolean(google),
        grantedScopes: google?.grantedScopes.split(' ').filter(Boolean) ?? [],
        sheet,
        updatedAt: google?.updatedAt ?? null,
      },
      membership: { counts: memberCounts, role: membership.role },
      notifications,
      notificationAdapter: providerState.adapter,
      notificationPreferences: {
        ...preferences,
        sms: Boolean(
          userRecord.smsPhone &&
          userRecord.smsVerifiedAt &&
          userRecord.smsConsentAt &&
          !userRecord.smsOptedOutAt,
        ),
      },
      sms: {
        consentAt: userRecord.smsConsentAt,
        optedOutAt: userRecord.smsOptedOutAt,
        phoneMasked: maskPhoneNumber(userRecord.smsPhone),
        providerConfigured: providerState.configured,
        verificationConfigured: providerState.verificationConfigured,
        verifiedAt: userRecord.smsVerifiedAt,
      },
      user: { email: session.email, name: session.name },
      workspace,
    },
  });
}

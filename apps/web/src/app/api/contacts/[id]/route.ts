import { prisma } from '@faro/database';
import type { Prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import {
  contactEditableFieldsSchema,
  withContactManualOverrides,
} from '@/lib/server/contact-manual-overrides';
import {
  ContactSheetWritebackError,
  writeContactEditsToGoogleSheet,
} from '@/lib/server/contact-sheet-writeback';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });

  const parsed = contactEditableFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_CONTACT', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const contact = await prisma.contact.findFirst({
    select: {
      customFields: true,
      email: true,
      firstName: true,
      id: true,
      lastName: true,
      phone: true,
      preferredChannel: true,
      source: true,
      timezone: true,
      title: true,
      type: true,
    },
    where: {
      campaignContacts: session.focusedCampaignId
        ? {
            some: {
              campaignId: session.focusedCampaignId,
              workspaceId: session.workspaceId,
            },
          }
        : undefined,
      deletedAt: null,
      id,
      workspaceId: session.workspaceId,
    },
  });
  if (!contact) return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 });

  if (parsed.data.email) {
    const duplicate = await prisma.contact.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        email: parsed.data.email,
        id: { not: id },
        workspaceId: session.workspaceId,
      },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'CONTACT_EMAIL_CONFLICT' }, { status: 409 });
    }
  }

  const changedFields = (
    [
      'email',
      'firstName',
      'lastName',
      'phone',
      'preferredChannel',
      'timezone',
      'title',
      'type',
    ] as const
  ).filter((field) => contact[field] !== parsed.data[field]);
  const updatedAt = new Date().toISOString();
  let sheetWriteBack;
  try {
    sheetWriteBack = await writeContactEditsToGoogleSheet({
      actorUserId: session.userId,
      changedFields,
      contact,
      fields: parsed.data,
      workspaceId: session.workspaceId,
    });
  } catch (error) {
    if (error instanceof ContactSheetWritebackError) {
      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const safeReturnTo =
        returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/contacts';
      if (error.code === 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED') {
        return NextResponse.json(
          {
            error: error.code,
            message:
              'Reconnect Google once to grant Sheets edit access. The contact was not changed.',
            reconnect: `/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo)}`,
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error: error.code,
          message:
            error.code === 'GOOGLE_SHEETS_WRITE_OWNER_REQUIRED'
              ? 'The Google account that connected this source must edit or reconnect it. The contact was not changed.'
              : 'Faro could not update the contact’s source row, so the contact was not changed.',
        },
        {
          status:
            error.code === 'GOOGLE_SHEETS_WRITE_FAILED' ||
            error.code === 'SHEET_CONNECTION_NOT_FOUND'
              ? 502
              : 409,
        },
      );
    }
    throw error;
  }

  try {
    const updated = await prisma.$transaction(async (database) => {
      const saved = await database.contact.update({
        data: {
          ...parsed.data,
          customFields: withContactManualOverrides(
            contact.customFields,
            parsed.data,
            updatedAt,
          ) as Prisma.InputJsonValue,
        },
        select: {
          consentStatus: true,
          email: true,
          firstName: true,
          id: true,
          lastName: true,
          phone: true,
          preferredChannel: true,
          source: true,
          timezone: true,
          title: true,
          type: true,
          updatedAt: true,
        },
        where: { id_workspaceId: { id, workspaceId: session.workspaceId } },
      });
      await database.auditEvent.create({
        data: {
          action: 'CONTACT_UPDATED',
          actorId: session.userId,
          actorType: 'USER',
          entityId: id,
          entityType: 'Contact',
          id: randomUUID(),
          metadata: {
            changedFields,
            manualOverride: true,
            sheetWriteBack: {
              cellsWritten: sheetWriteBack.cellsWritten,
              status: sheetWriteBack.status,
              ...('connectionId' in sheetWriteBack
                ? { connectionId: sheetWriteBack.connectionId }
                : {}),
            },
          },
          workspaceId: session.workspaceId,
        },
      });
      if (sheetWriteBack.status === 'WRITTEN') {
        await database.auditEvent.create({
          data: {
            action: 'GOOGLE_SHEET_CONTACT_UPDATED',
            actorId: session.userId,
            actorType: 'USER',
            entityId: id,
            entityType: 'Contact',
            id: randomUUID(),
            metadata: {
              cellsWritten: sheetWriteBack.cellsWritten,
              changedFields,
              sheetConnectionId: sheetWriteBack.connectionId,
            },
            workspaceId: session.workspaceId,
          },
        });
      }
      return saved;
    });
    return NextResponse.json({ data: updated, sheetWriteBack });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json({ error: 'CONTACT_EMAIL_CONFLICT' }, { status: 409 });
    }
    throw error;
  }
}

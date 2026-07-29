import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const actionSchema = z.object({ action: z.enum(['trash', 'restore']) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  if (session.focusedCampaignId) {
    return NextResponse.json({ error: 'MAIN_WORKSPACE_REQUIRED' }, { status: 409 });
  }
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_ORGANIZATION_ACTION' }, { status: 400 });

  const { id } = await context.params;
  const organization = await prisma.organization.findFirst({
    select: { customFields: true, id: true, name: true },
    where: { id, workspaceId: session.workspaceId },
  });
  if (!organization) return NextResponse.json({ error: 'ORGANIZATION_NOT_FOUND' }, { status: 404 });

  const restoring = parsed.data.action === 'restore';
  const deletedAt = restoring ? null : new Date();
  const customFields =
    organization.customFields &&
    typeof organization.customFields === 'object' &&
    !Array.isArray(organization.customFields)
      ? organization.customFields
      : {};
  await prisma.$transaction(async (database) => {
    await database.organization.update({
      data: {
        customFields: { ...customFields, manuallyTrashed: !restoring },
        deletedAt,
      },
      where: { id_workspaceId: { id, workspaceId: session.workspaceId } },
    });
    await database.contact.updateMany({
      data: { deletedAt },
      where: {
        organizationId: id,
        workspaceId: session.workspaceId,
        ...(restoring ? { deletedAt: { not: null } } : { deletedAt: null }),
      },
    });
    await database.auditEvent.create({
      data: {
        action: restoring ? 'ORGANIZATION_RESTORED' : 'ORGANIZATION_TRASHED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: id,
        entityType: 'Organization',
        id: randomUUID(),
        metadata: { organizationName: organization.name },
        workspaceId: session.workspaceId,
      },
    });
  });

  return NextResponse.json({ data: { id, status: restoring ? 'active' : 'trashed' } });
}

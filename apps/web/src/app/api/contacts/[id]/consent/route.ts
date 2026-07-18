import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';

const consentSchema = z.object({ status: z.enum(['IMPLIED', 'OPTED_IN', 'OPTED_OUT']) }).strict();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = consentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_CONSENT_STATUS' }, { status: 400 });
  const { id } = await context.params;
  const contact = await prisma.contact.findFirst({
    select: { id: true },
    where: { deletedAt: null, id, workspaceId: session.workspaceId },
  });
  if (!contact) return NextResponse.json({ error: 'CONTACT_NOT_FOUND' }, { status: 404 });
  await prisma.$transaction([
    prisma.contact.update({
      data: {
        consentStatus: parsed.data.status,
        suppressedAt: parsed.data.status === 'OPTED_OUT' ? new Date() : null,
      },
      where: { id },
    }),
    prisma.auditEvent.create({
      data: {
        action: 'CONTACT_CONSENT_REVIEWED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: id,
        entityType: 'Contact',
        id: randomUUID(),
        metadata: { status: parsed.data.status },
        workspaceId: session.workspaceId,
      },
    }),
  ]);
  return NextResponse.json({ data: { id, status: parsed.data.status } });
}

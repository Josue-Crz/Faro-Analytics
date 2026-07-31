import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { recalculateContactNextAction } from '@/lib/server/contact-next-action';
import { googleAccessToken } from '@/lib/server/google';

const listSchema = z.object({ messages: z.array(z.object({ id: z.string() })).default([]) });
const partSchema: z.ZodType<{
  body?: { data?: string };
  headers?: Array<{ name: string; value: string }>;
  mimeType?: string;
  parts?: Array<unknown>;
}> = z.lazy(() =>
  z.object({
    body: z.object({ data: z.string().optional() }).optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    mimeType: z.string().optional(),
    parts: z.array(partSchema).optional(),
  }),
);
const messageSchema = z.object({
  id: z.string(),
  internalDate: z.string().optional(),
  payload: partSchema,
  snippet: z.string().default(''),
});

function header(message: z.infer<typeof messageSchema>, name: string) {
  return message.payload.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? '';
}

function addresses(value: string) {
  return [...value.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map((match) =>
    match[0]!.toLowerCase(),
  );
}

function plainText(part: z.infer<typeof partSchema>): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }
  return (part.parts ?? [])
    .map((child) => plainText(partSchema.parse(child)))
    .filter(Boolean)
    .join('\n');
}

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });

  const credential = await prisma.googleCredential.findUnique({
    select: { grantedScopes: true },
    where: { userId: session.userId },
  });
  if (!credential?.grantedScopes.includes('https://www.googleapis.com/auth/gmail.readonly')) {
    return NextResponse.json(
      { error: 'GMAIL_SCOPE_REQUIRED', reconnect: '/api/auth/google/start?returnTo=/outreach' },
      { status: 409 },
    );
  }

  try {
    const accessToken = await googleAccessToken(session.userId);
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '100');
    listUrl.searchParams.set('q', 'newer_than:2y');
    const listResponse = await fetch(listUrl, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!listResponse.ok) return NextResponse.json({ error: 'GMAIL_READ_FAILED' }, { status: 502 });
    const listed = listSchema.parse(await listResponse.json());
    const contacts = await prisma.contact.findMany({
      select: { email: true, id: true },
      where: { deletedAt: null, email: { not: null }, workspaceId: session.workspaceId },
    });
    const contactsByEmail = new Map(
      contacts.flatMap((contact) =>
        contact.email ? [[contact.email.toLowerCase(), contact] as const] : [],
      ),
    );

    let imported = 0;
    let skipped = 0;
    const touchedContactIds = new Set<string>();
    for (const listedMessage of listed.messages) {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(listedMessage.id)}?format=full`,
        { cache: 'no-store', headers: { authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      const message = messageSchema.parse(await response.json());
      const from = addresses(header(message, 'from'));
      const to = addresses(header(message, 'to'));
      const outbound = from.includes(session.email.toLowerCase());
      const contact = [...(outbound ? to : from), ...to, ...from]
        .map((email) => contactsByEmail.get(email))
        .find(Boolean);
      if (!contact) {
        skipped += 1;
        continue;
      }
      const campaignContact = await prisma.campaignContact.findFirst({
        orderBy: { updatedAt: 'desc' },
        select: { campaignId: true },
        where: { contactId: contact.id, workspaceId: session.workspaceId },
      });
      const bodyText = (plainText(message.payload).trim() || message.snippet).slice(0, 12_000);
      const occurredAt = message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date(header(message, 'date'));
      await prisma.interaction.upsert({
        create: {
          bodyText,
          campaignId: campaignContact?.campaignId ?? null,
          channel: 'EMAIL',
          contactId: contact.id,
          deliveryStatus: outbound ? 'SENT' : 'RECEIVED',
          direction: outbound ? 'OUTBOUND' : 'INBOUND',
          externalMessageId: `gmail:${message.id}`,
          id: randomUUID(),
          occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
          subject: header(message, 'subject').slice(0, 998) || null,
          workspaceId: session.workspaceId,
        },
        update: {
          bodyText,
          campaignId: campaignContact?.campaignId ?? null,
          deliveryStatus: outbound ? 'SENT' : 'RECEIVED',
          subject: header(message, 'subject').slice(0, 998) || null,
        },
        where: {
          workspaceId_externalMessageId: {
            externalMessageId: `gmail:${message.id}`,
            workspaceId: session.workspaceId,
          },
        },
      });
      touchedContactIds.add(contact.id);
      imported += 1;
    }
    const scheduleReferenceTime = new Date();
    for (const contactId of touchedContactIds) {
      await recalculateContactNextAction(session.workspaceId, contactId, scheduleReferenceTime, {
        actorId: session.userId,
        actorType: 'USER',
      });
    }
    await prisma.auditEvent.create({
      data: {
        action: 'GMAIL_INTERACTIONS_SYNCED',
        actorId: session.userId,
        actorType: 'USER',
        entityId: session.userId,
        entityType: 'GoogleCredential',
        id: randomUUID(),
        metadata: {
          imported,
          listed: listed.messages.length,
          rescheduledContacts: touchedContactIds.size,
          skipped,
        },
        workspaceId: session.workspaceId,
      },
    });
    return NextResponse.json({
      data: {
        imported,
        listed: listed.messages.length,
        rescheduledContacts: touchedContactIds.size,
        skipped,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GMAIL_SYNC_FAILED';
    return NextResponse.json(
      { error: code },
      { status: code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 502 },
    );
  }
}

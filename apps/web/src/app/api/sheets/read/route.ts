import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { inferHeaderMappings } from '@faro/google-sheets';
import { prisma } from '@faro/database';
import { randomUUID } from 'node:crypto';

import { sessionFromRequest } from '@/lib/server/auth';
import { googleAccessToken } from '@/lib/server/google';
import { checkRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z
  .object({
    range: z.string().trim().min(1).max(200).default('A1:ZZ1001'),
    spreadsheetId: z
      .string()
      .trim()
      .regex(/^[\w-]{10,200}$/),
    worksheetTitle: z.string().trim().min(1).max(200),
  })
  .strict();
const valuesSchema = z.object({
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))).default([]),
});

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sheet-read:${session.userId}`, 10, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_SHEET_REFERENCE' }, { status: 400 });
  try {
    const token = await googleAccessToken(session.userId);
    const range = parsed.data.range.includes('!')
      ? parsed.data.range
      : `'${parsed.data.worksheetTitle.replaceAll("'", "''")}'!${parsed.data.range}`;
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(parsed.data.spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
    url.searchParams.set('majorDimension', 'ROWS');
    url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: response.status === 404 ? 'SHEET_NOT_FOUND' : 'GOOGLE_SHEETS_READ_FAILED' },
        { status: 502 },
      );
    }
    const { values } = valuesSchema.parse(await response.json());
    const headers = (values[0] ?? []).map(String).slice(0, 200);
    const rows = values
      .slice(1, 1001)
      .map((valuesRow) =>
        Object.fromEntries(
          headers.map((header, column) => [header, String(valuesRow[column] ?? '')]),
        ),
      );
    await prisma.auditEvent.create({
      data: {
        action: 'GOOGLE_SHEET_READ',
        actorId: session.userId,
        actorType: 'USER',
        entityId: parsed.data.spreadsheetId,
        entityType: 'GoogleSheet',
        id: randomUUID(),
        metadata: {
          canonicalWrite: false,
          range: parsed.data.range,
          rowsRead: rows.length,
          trigger: 'USER_PREVIEW',
          worksheetTitle: parsed.data.worksheetTitle,
        },
        workspaceId: session.workspaceId,
      },
    });
    return NextResponse.json({
      data: { headers, inferredMappings: inferHeaderMappings(headers), rows },
      mode: 'GOOGLE_OAUTH',
      canonicalWrite: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GOOGLE_SHEETS_READ_FAILED';
    return NextResponse.json(
      { error: code },
      { status: code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 502 },
    );
  }
}

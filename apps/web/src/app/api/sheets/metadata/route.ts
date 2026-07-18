import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { googleAccessToken } from '@/lib/server/google';
import { checkRateLimit } from '@/lib/server/rate-limit';

const requestSchema = z.object({
  spreadsheetId: z
    .string()
    .trim()
    .regex(/^[\w-]{10,200}$/),
});
const metadataSchema = z.object({
  properties: z.object({ title: z.string() }),
  sheets: z.array(z.object({ properties: z.object({ sheetId: z.number(), title: z.string() }) })),
});

export async function POST(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const limit = checkRateLimit(`sheet-metadata:${session.userId}`, 15, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_SHEET_REFERENCE' }, { status: 400 });
  try {
    const token = await googleAccessToken(session.userId);
    const url = new URL(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(parsed.data.spreadsheetId)}`,
    );
    url.searchParams.set('fields', 'properties.title,sheets.properties(sheetId,title)');
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: response.status === 404 ? 'SHEET_NOT_FOUND' : 'GOOGLE_SHEETS_READ_FAILED' },
        { status: 502 },
      );
    }
    const metadata = metadataSchema.parse(await response.json());
    return NextResponse.json({
      data: {
        spreadsheetTitle: metadata.properties.title,
        worksheets: metadata.sheets.map(({ properties }) => properties),
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'GOOGLE_SHEETS_READ_FAILED';
    return NextResponse.json(
      { error: code },
      { status: code === 'GOOGLE_REAUTH_REQUIRED' ? 401 : 502 },
    );
  }
}

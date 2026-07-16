import { previewContactImport, sheetFieldMappingSchema, sheetRowSchema } from '@faro/google-sheets';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { contacts } from '@/lib/demo-data';
import { isDemoApiAccessAllowed } from '@/lib/server/demo-boundary';
import { checkRateLimit } from '@/lib/server/rate-limit';

const previewSchema = z
  .object({
    headers: z.array(z.string().min(1).max(300)).min(1).max(200),
    mappings: z.array(sheetFieldMappingSchema).min(1).max(200),
    rows: z.array(sheetRowSchema).max(1_000),
  })
  .strict();

export async function POST(request: NextRequest) {
  if (!isDemoApiAccessAllowed()) {
    return NextResponse.json(
      {
        error: 'PRODUCTION_AUTH_REQUIRED',
        message: 'Database mode requires a verified application session before previewing data.',
      },
      { status: 503 },
    );
  }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const limit = checkRateLimit(`sheet-preview:${forwarded}`, 20, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'RATE_LIMITED' }, { status: 429 });
  }
  const parsed = previewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_PREVIEW', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const preview = previewContactImport({
    conflictBehavior: 'UPDATE',
    existingContacts: contacts.map((contact) => ({ id: contact.id, email: contact.email })),
    ...parsed.data,
  });
  const minimizedPreview = {
    ...preview,
    rows: preview.rows.map(({ action, contact, issues, rowNumber }) => ({
      action,
      contact,
      issues,
      rowNumber,
    })),
  };
  return NextResponse.json({ data: minimizedPreview, canonicalWrite: false, mode: 'DRY_RUN' });
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';
import {
  ContactOutreachScheduleError,
  contactOutreachScheduleRequestSchema,
  saveContactOutreachSchedule,
} from '@/lib/server/contact-outreach-schedule';
import { ContactSheetWritebackError } from '@/lib/server/contact-sheet-writeback';

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = contactOutreachScheduleRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'INVALID_OUTREACH_SCHEDULE', issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  try {
    return NextResponse.json(
      await saveContactOutreachSchedule({
        actorId: session.userId,
        contactId: id,
        focusedCampaignId: session.focusedCampaignId,
        request: parsed.data,
        workspaceId: session.workspaceId,
      }),
    );
  } catch (error) {
    if (error instanceof ContactOutreachScheduleError) {
      const status =
        error.code === 'CONTACT_NOT_FOUND' || error.code === 'CAMPAIGN_NOT_FOUND'
          ? 404
          : error.code === 'OUTREACH_NOT_ALLOWED'
            ? 409
            : 422;
      return NextResponse.json(
        {
          details: error.details,
          error: error.code,
          message:
            error.code === 'OUTREACH_NOT_ALLOWED'
              ? 'Grant consent and remove suppression before scheduling outreach.'
              : error.code === 'OPTIMIZER_COULD_NOT_SCHEDULE'
                ? 'The optimizer could not find two safe windows before the campaign deadline.'
                : error.code === 'FOLLOW_UP_MUST_BE_FUTURE'
                  ? 'The follow-up date must be in the future.'
                  : error.code === 'FOLLOW_UP_MUST_FOLLOW_INITIAL'
                    ? 'The follow-up date must be after the initial contact date.'
                    : error.code === 'FOLLOW_UP_AFTER_CAMPAIGN'
                      ? 'The follow-up date must be on or before the campaign end date.'
                      : 'The contact or campaign is not available in this workspace.',
        },
        { status },
      );
    }
    if (error instanceof ContactSheetWritebackError) {
      const returnTo = request.nextUrl.searchParams.get('returnTo');
      const safeReturnTo =
        returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/outreach';
      return NextResponse.json(
        {
          error: error.code,
          message:
            error.code === 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
              ? 'Reconnect Google once to grant Sheets edit access. The schedule was not changed.'
              : error.code === 'GOOGLE_SHEETS_WRITE_OWNER_REQUIRED'
                ? 'The Google account that connected this source must edit or reconnect it. The schedule was not changed.'
                : 'Faro could not update this contact’s exact source row, so the schedule was not changed.',
          ...(error.code === 'GOOGLE_SHEETS_WRITE_SCOPE_REQUIRED'
            ? {
                reconnect: `/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo)}`,
              }
            : {}),
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
}

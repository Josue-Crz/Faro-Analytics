import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { sessionFromRequest } from '@/lib/server/auth';
import { setWorkspaceFocus, WorkspaceFocusError } from '@/lib/server/workspace-focus';

const campaignIdSchema = z.string().trim().min(1).max(160);
const focusSchema = z
  .object({
    campaignId: campaignIdSchema.nullable(),
  })
  .strict();

function pollingIntervalMs(): number {
  const requested = Number(process.env.FARO_SHEET_POLL_INTERVAL_MS ?? 30_000);
  return Number.isFinite(requested) ? Math.min(Math.max(requested, 15_000), 900_000) : 30_000;
}

const sourceSelect = {
  displayName: true,
  id: true,
  lastErrorAt: true,
  lastErrorCode: true,
  lastSyncedAt: true,
  readRange: true,
  schedule: true,
  status: true,
  worksheetId: true,
} as const;

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });

  const rawCampaignId = request.nextUrl.searchParams.get('campaignId');
  const parsedCampaignId = rawCampaignId ? campaignIdSchema.safeParse(rawCampaignId) : null;
  if (parsedCampaignId && !parsedCampaignId.success) {
    return NextResponse.json({ error: 'INVALID_CAMPAIGN_ID' }, { status: 400 });
  }
  const campaignId = parsedCampaignId?.success ? parsedCampaignId.data : session.focusedCampaignId;

  const [workspace, campaign, defaultSource, sourceCount] = await Promise.all([
    prisma.workspace.findUnique({
      select: { id: true, name: true, slug: true },
      where: { id: session.workspaceId },
    }),
    campaignId
      ? prisma.campaign.findFirst({
          select: {
            id: true,
            name: true,
            sheetConnection: { select: sourceSelect },
          },
          where: {
            archivedAt: null,
            id: campaignId,
            workspaceId: session.workspaceId,
          },
        })
      : null,
    prisma.sheetConnection.findFirst({
      orderBy: [{ lastSyncedAt: 'desc' }, { updatedAt: 'desc' }],
      select: sourceSelect,
      where: { workspaceId: session.workspaceId },
    }),
    prisma.sheetConnection.count({ where: { workspaceId: session.workspaceId } }),
  ]);
  if (!workspace) return NextResponse.json({ error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  if (campaignId && !campaign) {
    return NextResponse.json({ error: 'CAMPAIGN_NOT_FOUND' }, { status: 404 });
  }

  const source = campaign?.sheetConnection ?? (campaignId ? null : defaultSource);
  const automaticPolling = Boolean(
    source &&
    process.env.FARO_SYNC_CRON_SECRET?.trim() &&
    ['ATTEMPTING', 'CONNECTED', 'SYNC_ISSUE'].includes(source.status),
  );

  return NextResponse.json({
    data: {
      campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
      canonicalDatabase: {
        label: 'Faro workspace database',
        technology: 'PostgreSQL',
      },
      polling: {
        automatic: automaticPolling,
        intervalMs: automaticPolling ? pollingIntervalMs() : null,
      },
      scope: {
        campaignId: campaign?.id ?? null,
        kind: campaign ? 'CAMPAIGN' : 'WORKSPACE',
      },
      source,
      sourceCount,
      workspace,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (!session) return NextResponse.json({ error: 'AUTHENTICATION_REQUIRED' }, { status: 401 });
  const parsed = focusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'INVALID_WORKSPACE_FOCUS' }, { status: 400 });

  try {
    return NextResponse.json({
      data: await setWorkspaceFocus(session, parsed.data.campaignId),
    });
  } catch (error) {
    if (error instanceof WorkspaceFocusError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    throw error;
  }
}

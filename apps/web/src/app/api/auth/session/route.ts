import { prisma } from '@faro/database';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  const workspace = session
    ? await prisma.workspace.findUnique({
        select: { id: true, name: true },
        where: { id: session.workspaceId },
      })
    : null;
  const oauthFailure = request.cookies.get('faro_oauth_failed')?.value;
  return NextResponse.json(
    session
      ? {
          authenticated: true,
          focus: {
            campaignId: session.focusedCampaignId,
            kind: session.focusedCampaignId ? 'CAMPAIGN' : 'WORKSPACE',
          },
          mode: 'CONNECTED',
          user: { email: session.email, name: session.name },
          workspace: workspace ?? { id: session.workspaceId, name: 'Connected workspace' },
          workspaceId: session.workspaceId,
        }
      : {
          authenticated: false,
          mode: oauthFailure ? 'FALLBACK' : 'EMPTY',
          oauthFailure: oauthFailure ?? null,
          user: oauthFailure ? { name: 'Jordan Lee' } : null,
          workspace: oauthFailure
            ? {
                id: process.env.FARO_DEMO_WORKSPACE_ID ?? 'ws-beacon-lab',
                name: 'Beacon Community Lab',
              }
            : null,
          workspaceId: oauthFailure
            ? (process.env.FARO_DEMO_WORKSPACE_ID ?? 'ws-beacon-lab')
            : null,
        },
  );
}

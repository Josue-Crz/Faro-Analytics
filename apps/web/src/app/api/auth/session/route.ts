import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { sessionFromRequest } from '@/lib/server/auth';

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  const oauthFailure = request.cookies.get('faro_oauth_failed')?.value;
  return NextResponse.json(
    session
      ? {
          authenticated: true,
          mode: 'CONNECTED',
          user: { email: session.email, name: session.name },
          workspaceId: session.workspaceId,
        }
      : {
          authenticated: false,
          mode: oauthFailure ? 'FALLBACK' : 'EMPTY',
          oauthFailure: oauthFailure ?? null,
          user: oauthFailure ? { name: 'Jordan Lee' } : null,
          workspaceId: oauthFailure
            ? (process.env.FARO_DEMO_WORKSPACE_ID ?? 'ws-beacon-lab')
            : null,
        },
  );
}

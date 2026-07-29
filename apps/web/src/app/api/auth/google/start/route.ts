import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createOAuthState, setOAuthCookie } from '@/lib/server/auth';

export function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: 'GOOGLE_OAUTH_NOT_CONFIGURED' }, { status: 503 });
  }
  const returnTo = request.nextUrl.searchParams.get('returnTo') ?? '/dashboard';
  const safeReturnTo =
    returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';
  const state = createOAuthState(safeReturnTo);
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorization.search = new URLSearchParams({
    access_type: 'offline',
    client_id: clientId,
    include_granted_scopes: 'true',
    prompt: 'consent',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/gmail.readonly',
    ].join(' '),
    state,
  }).toString();
  const response = NextResponse.redirect(authorization);
  setOAuthCookie(response, state);
  response.cookies.delete('faro_oauth_failed');
  return response;
}

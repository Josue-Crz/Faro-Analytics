import { prisma } from '@faro/database';
import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';

import {
  encryptProviderToken,
  isTesterAllowed,
  oauthCookie,
  setSessionCookie,
  verifyOAuthState,
} from '@/lib/server/auth';
import { syncGoogleSheet } from '@/lib/server/sheet-sync';

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(''),
});
const profileSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  sub: z.string().min(1).max(200),
});

function failure(request: NextRequest, code: string) {
  const url = new URL('/integrations/google-sheets', request.url);
  url.searchParams.set('oauthError', code);
  const response = NextResponse.redirect(url);
  response.cookies.set('faro_oauth_failed', code, {
    httpOnly: true,
    maxAge: 60 * 60,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export async function GET(request: NextRequest) {
  const stateValue = request.nextUrl.searchParams.get('state') ?? undefined;
  const savedState = oauthCookie(request);
  const state = verifyOAuthState(stateValue);
  if (!state || !savedState || savedState !== stateValue)
    return failure(request, 'INVALID_OAUTH_STATE');
  if (request.nextUrl.searchParams.has('error'))
    return failure(request, 'GOOGLE_AUTHORIZATION_DENIED');

  const code = request.nextUrl.searchParams.get('code');
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!code || !clientId || !clientSecret || !redirectUri) {
    return failure(request, 'GOOGLE_OAUTH_NOT_CONFIGURED');
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      method: 'POST',
      cache: 'no-store',
    });
    if (!tokenResponse.ok) return failure(request, 'GOOGLE_TOKEN_EXCHANGE_FAILED');
    const tokens = tokenSchema.parse(await tokenResponse.json());
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      cache: 'no-store',
    });
    if (!profileResponse.ok) return failure(request, 'GOOGLE_PROFILE_FAILED');
    const profile = profileSchema.parse(await profileResponse.json());
    if (!isTesterAllowed(profile.email)) return failure(request, 'TESTER_NOT_ALLOWED');

    const stableSuffix = createHash('sha256').update(profile.sub).digest('hex').slice(0, 16);
    const userId = `google_${stableSuffix}`;
    const existingMembership = await prisma.membership.findFirst({ where: { userId } });
    const workspaceId = existingMembership?.workspaceId ?? `ws_google_${stableSuffix}`;
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;

    await prisma.$transaction(async (database) => {
      await database.user.upsert({
        create: { email: profile.email, id: userId, name: profile.name, timezone: 'UTC' },
        update: { email: profile.email, name: profile.name },
        where: { id: userId },
      });
      if (!existingMembership) {
        await database.workspace.create({
          data: {
            defaultTimezone: 'UTC',
            id: workspaceId,
            name: `${profile.name}'s workspace`,
            quietHoursEnd: '08:00',
            quietHoursStart: '20:00',
            slug: `google-${stableSuffix}`,
          },
        });
        await database.membership.create({ data: { role: 'OWNER', userId, workspaceId } });
      }
      const previous = await database.googleCredential.findUnique({ where: { userId } });
      await database.googleCredential.upsert({
        create: {
          accessTokenExpiresAt: expiresAt,
          encryptedAccessToken: encryptProviderToken(tokens.access_token),
          encryptedRefreshToken: tokens.refresh_token
            ? encryptProviderToken(tokens.refresh_token)
            : null,
          grantedScopes: tokens.scope,
          id: randomUUID(),
          userId,
        },
        update: {
          accessTokenExpiresAt: expiresAt,
          encryptedAccessToken: encryptProviderToken(tokens.access_token),
          encryptedRefreshToken: tokens.refresh_token
            ? encryptProviderToken(tokens.refresh_token)
            : previous?.encryptedRefreshToken,
          grantedScopes: tokens.scope,
        },
        where: { userId },
      });
      await database.auditEvent.create({
        data: {
          action: 'GOOGLE_OAUTH_CONNECTED',
          actorId: userId,
          actorType: 'USER',
          entityId: userId,
          entityType: 'GoogleCredential',
          id: randomUUID(),
          metadata: { scopes: tokens.scope.split(' ').filter(Boolean) },
          workspaceId,
        },
      });
    });

    const savedConnections = await prisma.sheetConnection.findMany({
      take: 10,
      where: { workspaceId },
    });
    for (const connection of savedConnections) {
      try {
        await syncGoogleSheet(
          {
            email: profile.email,
            expiresAt: Date.now() + 60_000,
            name: profile.name,
            userId,
            workspaceId,
          },
          {
            displayName: connection.displayName,
            readRange: connection.readRange,
            spreadsheetId: connection.spreadsheetId,
            worksheetTitle: connection.worksheetId,
          },
          'OAUTH_RECONNECT',
        );
      } catch {
        // OAuth remains successful. The sync service records the refresh issue and preserves data.
      }
    }

    const response = NextResponse.redirect(new URL(state.returnTo, request.url));
    setSessionCookie(response, { email: profile.email, name: profile.name, userId, workspaceId });
    response.cookies.delete('faro_oauth_failed');
    return response;
  } catch (error) {
    console.error(JSON.stringify({ component: 'faro-web', error: 'GOOGLE_OAUTH_CALLBACK_FAILED' }));
    return failure(
      request,
      error instanceof z.ZodError ? 'GOOGLE_RESPONSE_INVALID' : 'OAUTH_PERSISTENCE_FAILED',
    );
  }
}

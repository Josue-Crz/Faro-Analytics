import { prisma } from '@faro/database';
import { z } from 'zod';

import { decryptProviderToken, encryptProviderToken } from './auth';

const refreshSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
});

export async function googleAccessToken(userId: string): Promise<string> {
  const credential = await prisma.googleCredential.findUnique({ where: { userId } });
  if (!credential) throw new Error('GOOGLE_NOT_CONNECTED');
  if (
    !credential.accessTokenExpiresAt ||
    credential.accessTokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptProviderToken(credential.encryptedAccessToken);
  }
  if (!credential.encryptedRefreshToken) throw new Error('GOOGLE_REAUTH_REQUIRED');
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('GOOGLE_OAUTH_NOT_CONFIGURED');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: decryptProviderToken(credential.encryptedRefreshToken),
    }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    method: 'POST',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('GOOGLE_TOKEN_REFRESH_FAILED');
  const refreshed = refreshSchema.parse(await response.json());
  await prisma.googleCredential.update({
    data: {
      accessTokenExpiresAt: refreshed.expires_in
        ? new Date(Date.now() + refreshed.expires_in * 1000)
        : null,
      encryptedAccessToken: encryptProviderToken(refreshed.access_token),
    },
    where: { userId },
  });
  return refreshed.access_token;
}

import { prisma } from '@faro/database';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'faro_session';
const OAUTH_COOKIE = 'faro_google_oauth';
const SESSION_SECONDS = 60 * 60 * 12;

export type FaroSession = {
  email: string;
  expiresAt: number;
  name: string;
  userId: string;
  workspaceId: string;
};

export type AuthenticatedFaroSession = FaroSession & {
  focusedCampaignId: string | null;
};

function secret(name: 'AUTH_SECRET' | 'TOKEN_ENCRYPTION_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('replace-with-')) {
    throw new Error(`${name} is required and must not be a placeholder`);
  }
  return value;
}

function signature(value: string): string {
  return createHmac('sha256', secret('AUTH_SECRET')).update(value).digest('base64url');
}

function encodeSigned(value: object): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

function decodeSigned<T>(value: string | undefined): T | null {
  if (!value) return null;
  const [payload, supplied] = value.split('.');
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function encryptionKey(): Buffer {
  const configured = secret('TOKEN_ENCRYPTION_KEY');
  const decoded = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, 'hex')
    : Buffer.from(configured, 'base64');
  if (decoded.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  return decoded;
}

export function encryptProviderToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptProviderToken(value: string): string {
  const [iv, tag, encrypted] = value.split('.').map((part) => Buffer.from(part ?? '', 'base64url'));
  if (!iv || !tag || !encrypted) throw new Error('Invalid encrypted provider token');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function createOAuthState(returnTo = '/dashboard') {
  return encodeSigned({
    expiresAt: Date.now() + 10 * 60_000,
    nonce: randomBytes(24).toString('hex'),
    returnTo,
  });
}

export function verifyOAuthState(value: string | undefined) {
  const state = decodeSigned<{ expiresAt: number; nonce: string; returnTo: string }>(value);
  return state && state.expiresAt > Date.now() ? state : null;
}

export function setOAuthCookie(response: NextResponse, state: string) {
  response.cookies.set(OAUTH_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

export function oauthCookie(request: NextRequest) {
  return request.cookies.get(OAUTH_COOKIE)?.value;
}

export function setSessionCookie(response: NextResponse, session: Omit<FaroSession, 'expiresAt'>) {
  response.cookies.set(
    SESSION_COOKIE,
    encodeSigned({ ...session, expiresAt: Date.now() + SESSION_SECONDS * 1000 }),
    {
      httpOnly: true,
      maxAge: SESSION_SECONDS,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
  );
  response.cookies.delete(OAUTH_COOKIE);
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.delete(SESSION_COOKIE);
}

export async function sessionFromRequest(
  request: NextRequest,
): Promise<AuthenticatedFaroSession | null> {
  const session = decodeSigned<FaroSession>(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || session.expiresAt <= Date.now()) return null;
  const membership = await prisma.membership.findUnique({
    select: { focusedCampaignId: true },
    where: { workspaceId_userId: { userId: session.userId, workspaceId: session.workspaceId } },
  });
  return membership ? { ...session, focusedCampaignId: membership.focusedCampaignId } : null;
}

export function isTesterAllowed(email: string): boolean {
  const configured = process.env.FARO_TESTER_EMAILS?.split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return process.env.NODE_ENV !== 'production' && !configured?.length
    ? true
    : Boolean(configured?.includes(email.toLowerCase()));
}

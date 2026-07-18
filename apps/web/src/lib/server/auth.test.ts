import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createOAuthState,
  decryptProviderToken,
  encryptProviderToken,
  isTesterAllowed,
  verifyOAuthState,
} from './auth';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.unstubAllEnvs();
});

describe('Google tester authentication safeguards', () => {
  it('encrypts provider tokens with authenticated encryption', () => {
    vi.stubEnv('TOKEN_ENCRYPTION_KEY', '11'.repeat(32));
    const encrypted = encryptProviderToken('google-access-token');

    expect(encrypted).not.toContain('google-access-token');
    expect(decryptProviderToken(encrypted)).toBe('google-access-token');
    const [iv, tag, ciphertext] = encrypted.split('.');
    expect(() =>
      decryptProviderToken(`${iv}.${tag === 'A' ? 'B' : 'A'}${tag?.slice(1)}.${ciphertext}`),
    ).toThrow();
  });

  it('signs OAuth state and rejects tampering', () => {
    vi.stubEnv('AUTH_SECRET', 'local-test-secret-that-is-long-and-random-enough');
    const state = createOAuthState('/integrations/google-sheets');

    expect(verifyOAuthState(state)?.returnTo).toBe('/integrations/google-sheets');
    expect(verifyOAuthState(`${state}tampered`)).toBeNull();
  });

  it('fails closed against the production tester allowlist', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FARO_TESTER_EMAILS', 'allowed@example.com');

    expect(isTesterAllowed('ALLOWED@example.com')).toBe(true);
    expect(isTesterAllowed('unknown@example.com')).toBe(false);
  });
});

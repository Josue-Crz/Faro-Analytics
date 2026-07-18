import { NextResponse } from 'next/server';

export function GET() {
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI &&
    process.env.TOKEN_ENCRYPTION_KEY,
  );
  const bobRuntime = process.env.BOB_RUNTIME_ADAPTER ?? 'unavailable';
  return NextResponse.json({
    status: 'ok',
    service: 'faro-web',
    dataSource: process.env.FARO_DATA_SOURCE === 'database' ? 'database' : 'demo',
    integrations: {
      bobMcp: 'available',
      bobRuntime,
      googleOAuth: googleConfigured ? 'configured-unverified' : 'not-configured',
      notifications: process.env.NOTIFICATION_ADAPTER ?? 'preview',
    },
    timestamp: new Date().toISOString(),
  });
}

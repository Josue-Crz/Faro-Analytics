import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'faro-web',
    dataSource: process.env.FARO_DATA_SOURCE === 'database' ? 'database' : 'demo',
    integrations: {
      bobMcp: 'available',
      bobRuntime: 'unavailable',
      googleOAuth: process.env.GOOGLE_CLIENT_ID ? 'configured-unverified' : 'not-configured',
      notifications: process.env.NOTIFICATION_ADAPTER ?? 'preview',
    },
    timestamp: new Date().toISOString(),
  });
}

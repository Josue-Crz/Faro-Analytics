import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// The web package runs with apps/web as its working directory, while Faro keeps one canonical
// ignored environment file at the monorepo root.
const rootEnvironmentPath = resolve(process.cwd(), '../..', '.env');
if (existsSync(rootEnvironmentPath)) process.loadEnvFile(rootEnvironmentPath);

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ['@carbon/icons-react', '@carbon/react'],
  },
  transpilePackages: [
    '@faro/core',
    '@faro/database',
    '@faro/google-sheets',
    '@faro/ibm-bob',
    '@faro/mcp',
    '@faro/notifications',
    '@faro/optimizer',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;

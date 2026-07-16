import type { NextConfig } from 'next';

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

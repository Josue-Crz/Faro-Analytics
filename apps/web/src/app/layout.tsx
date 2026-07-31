import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-sans/300.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@carbon/charts/styles.css';
import './carbon.scss';
import './globals.css';

import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: {
    default: 'Faro Analytics · Relationship intelligence',
    template: '%s · Faro Analytics',
  },
  description:
    'Turn governed relationship context into explainable, future-dated outreach and follow-up decisions.',
  icons: [{ rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' }],
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f4' },
    { media: '(prefers-color-scheme: dark)', color: '#161616' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

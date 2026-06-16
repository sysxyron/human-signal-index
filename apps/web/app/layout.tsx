import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'Human Signal Index — Mapping the narratives that shape humanity',
    template: '%s · Human Signal Index',
  },
  description:
    'A public-interest intelligence platform. HSI collects, traces, and explains the narratives shaping public life, with evidence and human review at every step.',
  // Marketing pages live on the www origin; canonical + Open Graph URLs resolve
  // here (the app lives on app.humansignalindex.org and is linked explicitly).
  metadataBase: new URL('https://www.humansignalindex.org'),
  openGraph: {
    type: 'website',
    siteName: 'Human Signal Index',
    url: 'https://www.humansignalindex.org',
    title: 'Human Signal Index',
    description:
      'A public-interest intelligence platform. HSI collects, traces, and explains the narratives shaping public life, with evidence and human review at every step.',
  },
  twitter: { card: 'summary_large_image', title: 'Human Signal Index' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}

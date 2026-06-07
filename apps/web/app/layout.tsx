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
    'A public-interest signal-intelligence observatory. HSI tracks, traces, and explains the narratives, ideologies, and movements shaping human behavior — with evidence-first traceability.',
  metadataBase: new URL('https://humansignalindex.org'),
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

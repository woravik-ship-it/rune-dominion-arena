import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/layout/AppShell';
import { AudioProvider } from '@/components/providers/AudioProvider';
import { OnboardingProvider } from '@/components/providers/OnboardingProvider';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Rune Dominion Arena',
  description: 'Fantasy Trading Card Game / Auto Battle / Competitive Arena',
  keywords: ['card game', 'auto battle', 'fantasy', 'arena', 'rune'],
  authors: [{ name: 'Rune Dominion Arena Team' }],
  openGraph: {
    title: 'Rune Dominion Arena',
    description: 'ค้นพบรูน สะสมการ์ด ต่อสู้ใน Arena',
    type: 'website',
    locale: 'th_TH',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0b1020',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={notoSansThai.variable}>
      <body className="font-thai">
        <AudioProvider>
          <OnboardingProvider>
            <AppShell>
              {children}
            </AppShell>
          </OnboardingProvider>
        </AudioProvider>
      </body>
    </html>
  );
}

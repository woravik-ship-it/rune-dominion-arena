'use client';

import { ReactNode } from 'react';
import TopHeader from '@/components/layout/TopHeader';
import BottomNavigation from '@/components/layout/BottomNavigation';
import OnboardingModal from '@/components/ui/OnboardingModal';
import { useOnboarding } from '@/components/providers/OnboardingProvider';
import { LocaleProvider } from '@/components/providers/LocaleProvider';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { shouldShow, dismiss } = useOnboarding();

  return (
    <LocaleProvider>
      <div className="min-h-screen flex flex-col">
        <TopHeader />
        <main className="flex-1 pb-16">
          {children}
        </main>
        <BottomNavigation />
        {shouldShow && <OnboardingModal onClose={dismiss} />}
      </div>
    </LocaleProvider>
  );
}

'use client';

import { ReactNode } from 'react';
import TopHeader from '@/components/layout/TopHeader';
import BottomNavigation from '@/components/layout/BottomNavigation';

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopHeader />
      <main className="flex-1 pb-16">
        {children}
      </main>
      <BottomNavigation />
    </div>
  );
}

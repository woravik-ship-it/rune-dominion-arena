'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function TopHeader() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/wallet?userId=temp-user')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBalance(d.data.balance);
      })
      .catch(() => undefined);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
          Rune Dominion
        </Link>
        <nav className="flex items-center gap-3 md:gap-4">
          <Link href="/discover" className="text-sm text-gray-300 hover:text-white transition-colors">
            Discover
          </Link>
          <Link href="/cards" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline">
            Cards
          </Link>
          <Link href="/decks" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline">
            Decks
          </Link>
          <Link href="/battle" className="text-sm text-gray-300 hover:text-white transition-colors">
            Battle
          </Link>
          <Link href="/wallet" className="text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors">
            🪙 {balance === null ? '...' : balance.toLocaleString('th-TH')}
          </Link>
        </nav>
      </div>
    </header>
  );
}


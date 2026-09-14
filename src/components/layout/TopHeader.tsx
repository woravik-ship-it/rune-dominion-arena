'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  role?: string;
}

export default function TopHeader() {
  const [balance, setBalance] = useState<number | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/wallet?userId=temp-user').then((r) => r.json()).catch(() => null),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([walletData, meData]) => {
      if (cancelled) return;
      if (walletData?.success) setBalance(walletData.data.balance);
      if (meData?.success) setUser(meData.data.user);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setUser(null);
    window.location.href = '/';
  };

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
          <Link href="/quests" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline">
            Quests
          </Link>
          <Link href="/cards" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline">
            Cards
          </Link>
          <Link href="/decks" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline">
            Decks
          </Link>
          <Link href="/battle" className="text-sm text-gray-300 hover:text-white transition-colors hidden md:inline">
            Battle
          </Link>
          {user && (user.role === 'ADMIN' || user.role === 'MODERATOR') && (
            <Link
              href="/admin"
              className="text-sm text-amber-300 hover:text-amber-200 transition-colors hidden sm:inline"
              title="Admin Tools"
            >
              ⚙️ Admin
            </Link>
          )}
          <Link href="/wallet" className="text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors">
            🪙 {balance === null ? '...' : balance.toLocaleString('th-TH')}
          </Link>
          {user ? (
            <div className="flex items-center gap-2">
              <Link
                href="/profile"
                className="text-sm text-gray-200 hover:text-white transition-colors max-w-[8rem] truncate"
                title={user.displayName || user.username}
              >
                👤 {user.displayName || user.username}
              </Link>
              <button
                onClick={logout}
                className="text-xs text-gray-400 hover:text-red-400 transition-colors"
                aria-label="ออกจากระบบ"
              >
                ออกจากระบบ
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-sm text-amber-400 hover:text-amber-300 transition-colors">
              เข้าสู่ระบบ
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}


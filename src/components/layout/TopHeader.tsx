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
  const [energy, setEnergy] = useState<number | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/wallet').then((r) => r.json()).catch(() => null),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      // Phase 5: แสดงพลังค้นหาในหัวเว็บ (เดิมแสดงแค่ Coin)
      fetch('/api/energy').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([walletData, meData, energyData]) => {
      if (cancelled) return;
      if (walletData?.success) setBalance(walletData.data.balance);
      if (meData?.success) setUser(meData.data.user);
      if (energyData?.success) setEnergy(energyData.energy.remaining);
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
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-4">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent sm:text-xl"
        >
          {/* มือถือ: ย่อชื่อแบรนด์ (ผู้ใช้สั่ง: UI มือถือต้องพอดี ไม่ล้นขอบ) */}
          <span className="sm:hidden">🔮 RDA</span>
          <span className="hidden sm:inline">Rune Dominion</span>
        </Link>

        {/* ลิงก์ข้อความ: จอใหญ่เท่านั้น — มือถือใช้แถบล่าง (5 เมนู + ปุ่ม "เพิ่มเติม") */}
        <nav className="hidden min-w-0 flex-1 items-center gap-3 overflow-x-auto scrollbar-hide md:flex md:gap-4">
          <Link href="/discover" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Discover
          </Link>
          <Link href="/quests" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Quests
          </Link>
          <Link href="/events" className="shrink-0 whitespace-nowrap text-sm text-purple-300 hover:text-purple-200 transition-colors">
            Events
          </Link>
          <Link href="/cards" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Cards
          </Link>
          <Link href="/decks" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Decks
          </Link>
          <Link href="/battle" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Battle
          </Link>
          <Link href="/arena" className="shrink-0 whitespace-nowrap text-sm text-gray-300 hover:text-white transition-colors">
            Arena
          </Link>
          {user && (user.role === 'ADMIN' || user.role === 'MODERATOR') && (
            <Link
              href="/admin"
              className="shrink-0 whitespace-nowrap text-sm text-amber-300 hover:text-amber-200 transition-colors"
              title="Admin Tools"
            >
              ⚙️ Admin
            </Link>
          )}
        </nav>

        {/* สถานะผู้เล่น (พลังค้นหา/Coin/ชื่อ) — โชว์ทุกจอแต่ย่อบนมือถือให้พอดี */}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/discover"
            className="shrink-0 text-sm font-bold text-sky-300 hover:text-sky-200 transition-colors"
            title="พลังค้นหา (เหลือ/วัน)"
          >
            ⚡ {energy === null ? '...' : energy}
          </Link>
          <Link
            href="/wallet"
            className="shrink-0 text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors"
            title="Coin"
          >
            🪙 {balance === null ? '...' : balance.toLocaleString('th-TH')}
          </Link>
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/profile"
                className="flex min-w-0 items-center text-sm text-gray-200 transition-colors hover:text-white"
                title={user.displayName || user.username}
              >
                <span className="shrink-0">👤</span>
                <span className="ml-1 hidden max-w-[7rem] truncate sm:inline">
                  {user.displayName || user.username}
                </span>
              </Link>
              <button
                onClick={logout}
                className="shrink-0 text-xs text-gray-400 transition-colors hover:text-red-400"
                aria-label="ออกจากระบบ"
              >
                ออก<span className="hidden sm:inline">จากระบบ</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="shrink-0 text-sm text-amber-400 hover:text-amber-300 transition-colors">
              เข้าสู่ระบบ
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}


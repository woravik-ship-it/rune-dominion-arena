'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import NotificationBell from '@/components/layout/NotificationBell';
import AvatarView from '@/components/profile/AvatarView';
import { subscribeAvatarChanged } from '@/lib/avatar-events';
import { subscribeVeilShardsChanged } from '@/lib/veil-shard-events';
import { useI18n } from '@/components/providers/LocaleProvider';
import { formatNumber } from '@/lib/i18n';

interface SessionUser {
  id: string;
  username: string;
  displayName: string | null;
  role?: string;
  /** Phase 26: อวตาร (อิโมจิ หรือภาพวาด 6×6) */
  avatarEmoji?: string | null;
  avatarGrid?: string | null;
}

export default function TopHeader() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [shards, setShards] = useState<number | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);

  // เมนูบนจอใหญ่ — ป้ายเปลี่ยนตามภาษาที่เลือก
  const desktopNav: { href: string; key: string; className?: string }[] = [
    { href: '/discover', key: 'nav.discover' },
    { href: '/quests', key: 'nav.quests' },
    { href: '/events', key: 'nav.events', className: 'text-purple-300 hover:text-purple-200' },
    { href: '/cards', key: 'nav.cards' },
    { href: '/decks', key: 'nav.decks' },
    { href: '/battle', key: 'nav.battle' },
    { href: '/arena', key: 'nav.arena' },
    { href: '/items', key: 'nav.items', className: 'text-sky-300 hover:text-sky-200' },
    { href: '/notifications', key: 'nav.notifications' },
  ];

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/wallet').then((r) => r.json()).catch(() => null),
      fetch('/api/auth/me').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      // Phase 5: แสดงพลังค้นหาในหัวเว็บ (เดิมแสดงแค่ Coin)
      fetch('/api/energy').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      // Phase 25: Veil Shards (ได้จากการขายการ์ด/กิจกรรม) — โหลดใหม่ทุกครั้งที่เปลี่ยนหน้า
      fetch('/api/veil-shards?limit=1', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([walletData, meData, energyData, shardData]) => {
      if (cancelled) return;
      if (walletData?.success) setBalance(walletData.data.balance);
      if (meData?.success) setUser(meData.data.user);
      if (energyData?.success) setEnergy(energyData.energy.remaining);
      if (shardData?.success) setShards(Number(shardData.data?.balance ?? 0));
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  /**
   * Phase 25.1 — อัปเดตยอด 💠 ทันทีเมื่อหน้าไหนซื้อ/คราฟต์/ขาย (ไม่ต้องรอเปลี่ยนหน้า)
   * ผู้ใช้แจ้ง 2026-09-27: "หลังจากใช้ไปแล้วไม่ลดทันที ต้องรอเปลี่ยนหน้า หรือ Refresh"
   */
  useEffect(() => {
    const loadShards = () =>
      fetch('/api/veil-shards?limit=1', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.success) setShards(Number(data.data?.balance ?? 0));
        })
        .catch(() => undefined);

    return subscribeVeilShardsChanged((balance) => {
      if (typeof balance === 'number') setShards(balance); // โชว์เลขที่รู้ทันที
      void loadShards(); // แล้วยืนยันกับเซิร์ฟเวอร์
    });
  }, []);

  /**
   * Phase 26 — อวตาร: ตั้งใหม่ที่หน้าโปรไฟล์แล้วหัวเว็บต้องเปลี่ยนทันที (ไม่ต้องรีเฟรช)
   */
  useEffect(
    () =>
      subscribeAvatarChanged((detail) => {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                avatarEmoji: detail.emoji !== undefined ? detail.emoji : prev.avatarEmoji,
                avatarGrid: detail.grid !== undefined ? detail.grid : prev.avatarGrid,
              }
            : prev
        );
      }),
    []
  );

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
          {desktopNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 whitespace-nowrap text-sm transition-colors ${item.className ?? 'text-gray-300 hover:text-white'}`}
            >
              {t(item.key)}
            </Link>
          ))}
          {user && (user.role === 'ADMIN' || user.role === 'MODERATOR') && (
            <Link
              href="/admin"
              className="shrink-0 whitespace-nowrap text-sm text-amber-300 hover:text-amber-200 transition-colors"
              title="Admin Tools"
            >
              ⚙️ {t('nav.admin')}
            </Link>
          )}
        </nav>

        {/* สถานะผู้เล่น (พลังค้นหา/Coin/ชื่อ) — โชว์ทุกจอแต่ย่อบนมือถือให้พอดี */}
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
          <NotificationBell />
          {/*
            พลังค้นหา/Coin — ผู้ใช้สั่ง 2026-09-26: "พลังงาน และเหรียญ ที่ Desktop ไม่แสดงตัวเลข"
            ⇒ แสดง "ตัวเลขจริง" ทุกขนาดจอ (Desktop + มือถือ) เหมือนกัน
            (เดิม Phase 23 ซ่อนเป็น "..." บนจอ md ขึ้นไป — ยกเลิกตามคำสั่งใหม่)
            ค่า null = ยังโหลดไม่เสร็จ → แสดง "..." ชั่วคราว
          */}
          <Link
            href="/discover"
            className="shrink-0 text-sm font-bold text-sky-300 hover:text-sky-200 transition-colors"
            title={t('header.energy')}
          >
            ⚡
            <span className="ml-1">{energy === null ? '...' : energy}</span>
          </Link>
          <Link
            href="/wallet"
            className="shrink-0 text-sm font-bold text-amber-400 hover:text-amber-300 transition-colors"
            title={t('header.coin')}
          >
            🪙
            <span className="ml-1">{balance === null ? '...' : formatNumber(locale, balance)}</span>
          </Link>
          {/* Phase 25: Veil Shards — สกุลเงินของร้านช่าง/กิจกรรม (ได้จากการขายการ์ด + กิจกรรม) */}
          <Link
            href="/items"
            data-header-veil-shards={shards ?? ''}
            className="shrink-0 text-sm font-bold text-sky-300 hover:text-sky-200 transition-colors"
            title={t('header.veilShards')}
          >
            💠
            <span className="ml-1">{shards === null ? '...' : formatNumber(locale, shards)}</span>
          </Link>
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/profile"
                className="flex min-w-0 items-center text-sm text-gray-200 transition-colors hover:text-white"
                title={user.displayName || user.username}
              >
                {/* Phase 26: อวตาร (อิโมจิ/ภาพวาด 6×6) แทนไอคอน 👤 เมื่อผู้เล่นตั้งไว้ */}
                <span data-avatar-header={user.avatarEmoji ?? user.avatarGrid ?? ''} className="shrink-0">
                  <AvatarView emoji={user.avatarEmoji} grid={user.avatarGrid} size={20} className="rounded" />
                </span>
                <span className="ml-1 hidden max-w-[7rem] truncate sm:inline">
                  {user.displayName || user.username}
                </span>
              </Link>
              <button
                onClick={logout}
                className="shrink-0 text-xs text-gray-400 transition-colors hover:text-red-400"
                aria-label={t('header.logout')}
              >
                {t('header.logoutShort')}<span className="hidden sm:inline">{t('header.logoutTail')}</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="shrink-0 text-sm text-amber-400 hover:text-amber-300 transition-colors">
              {t('header.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}


'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';

interface NavItem {
  href: string;
  /** คีย์ในพจนานุกรม i18n (ป้ายเปลี่ยนตามภาษาที่ผู้เล่นเลือก) */
  key: string;
  icon: string;
  adminOnly?: boolean;
}

/**
 * เมนูทั้งหมดของเกม (จอใหญ่แสดงในแถวล่างทั้งหมด)
 * ป้ายมาจาก i18n — ภาษาไทยใช้คำสั้น เพื่อให้พอดีจอมือถือเล็ก (320-360px)
 */
const navItems: NavItem[] = [
  { href: '/', key: 'nav.home', icon: '🏠' },
  { href: '/discover', key: 'nav.discover', icon: '🔮' },
  { href: '/cards', key: 'nav.cards', icon: '🃏' },
  { href: '/decks', key: 'nav.decks', icon: '📋' },
  { href: '/arena', key: 'nav.arena', icon: '⚔️' },
  { href: '/battle', key: 'nav.battle', icon: '🎯' },
  { href: '/items', key: 'nav.items', icon: '🛠️' },
  { href: '/dungeons', key: 'nav.dungeons', icon: '🏰' },
  { href: '/ranking', key: 'nav.ranking', icon: '🏆' },
  { href: '/notifications', key: 'nav.notifications', icon: '🔔' },
  { href: '/wallet', key: 'nav.wallet', icon: '💰' },
  { href: '/quests', key: 'nav.quests', icon: '📜' },
  { href: '/events', key: 'nav.events', icon: '🌙' },
  { href: '/inventory', key: 'nav.inventory', icon: '🎒' },
  { href: '/settings', key: 'nav.settings', icon: '⚙️' },
  { href: '/profile', key: 'nav.profile', icon: '👤' },
  { href: '/admin', key: 'nav.admin', icon: '🛡️', adminOnly: true },
];

/**
 * เมนูหลักที่โชว์บนแถบล่างของ "มือถือ" (ที่เหลืออยู่ในปุ่ม "เพิ่มเติม")
 * ผู้ใช้สั่ง 2026-09-25: "แก้ UI เมนูต่างๆ ในมือถือ มันล้นขอบ แก้ไขให้พอดี"
 * — เดิมเป็นแถวเลื่อนนอน 12 เมนู ⇒ เนื้อหาถูกตัดขอบขวา 89px จึงเปลี่ยนเป็น 5 เมนู + ปุ่มเพิ่มเติม
 */
const PRIMARY_HREFS = ['/', '/discover', '/cards', '/decks', '/arena'];

function itemClass(active: boolean): string {
  return `flex flex-col items-center justify-center gap-0.5 rounded-lg py-1 transition-colors ${
    active ? 'text-amber-400' : 'text-gray-400 hover:text-white'
  }`;
}

export default function BottomNavigation() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const role = d?.data?.user?.role;
        setIsAdmin(role === 'ADMIN' || role === 'MODERATOR');
      })
      .catch(() => undefined);
  }, [pathname]);

  const items = useMemo(() => navItems.filter((i) => !i.adminOnly || isAdmin), [isAdmin]);
  const primary = items.filter((i) => PRIMARY_HREFS.includes(i.href));
  const others = items.filter((i) => !PRIMARY_HREFS.includes(i.href));
  /** หน้าปัจจุบันอยู่ในเมนูที่ซ่อนในปุ่ม "เพิ่มเติม" ไหม (ไฮไลต์ปุ่มให้รู้ว่าอยู่ตรงไหน) */
  const inOthers = others.some((i) => i.href === pathname);

  // เปลี่ยนหน้าแล้วปิดแผงเมนู
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  return (
    <>
      {sheetOpen && (
        <div
          data-nav-sheet="true"
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-16 max-h-[65vh] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-gray-900 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-200">{t('nav.moreTitle')}</p>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="rounded-lg bg-white/10 px-2 py-1 text-xs text-gray-200"
                aria-label={t('nav.close')}
              >
                {t('nav.close')} ✕
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {others.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-nav-sheet-item={item.href}
                  className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center ${
                    pathname === item.href
                      ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                      : 'border-gray-700 bg-gray-800 text-gray-200'
                  }`}
                >
                  <span className="text-xl leading-none">{item.icon}</span>
                  <span className="text-[11px] leading-tight">{t(item.key)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav
        data-bottom-nav="true"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/90 backdrop-blur-md"
      >
        {/* มือถือ: 5 เมนูหลัก + เพิ่มเติม (แบ่งคอลัมน์เท่ากัน → ไม่ล้นขอบ) */}
        <div className="grid h-16 grid-cols-6 px-1 md:hidden">
          {primary.map((item) => (
            <Link key={item.href} href={item.href} data-nav-item={item.href} className={itemClass(pathname === item.href)}>
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] leading-none">{t(item.key)}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            data-nav-more="true"
            aria-expanded={sheetOpen}
            className={itemClass(inOthers || sheetOpen)}
          >
            <span className="text-lg leading-none">☰</span>
            <span className="text-[10px] leading-none">{t('nav.more')}</span>
          </button>
        </div>

        {/* จอใหญ่: ทุกเมนูในแถวเดียว (พอดีเพราะมีที่กว้าง) */}
        <div className="hidden h-16 items-center justify-center px-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-nav-item={item.href}
              className={`${itemClass(pathname === item.href)} shrink-0 px-2.5`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="text-[10px] leading-none">{t(item.key)}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

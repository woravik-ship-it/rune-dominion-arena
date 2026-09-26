'use client';

// NotificationBell — ระฆังแจ้งเตือนพร้อมตัวเลขยังไม่อ่าน (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ทำระบบแจ้งเตือนต่างๆ … สำหรับของแต่ละ User"
// - ตัวเลข unread อัปเดตทุก 60 วินาที และทุกครั้งที่ผู้ใช้กลับเข้าหน้าเว็บ (focus)
// - กดแล้วไปศูนย์การแจ้งเตือน /notifications
//
// Phase 24.1 — ผู้ใช้สั่ง: "การแจ้งเตือนเมื่อเปิดดูแล้ว ไม่หายไปในทันที"
// - เปลี่ยนหน้า (pathname) → โหลดใหม่ทันที (กลับจาก /notifications ตัวเลขต้องเป็น 0 ทันที)
// - รับเหตุการณ์ notifications-changed จากหน้า /notifications → อัปเดตตัวเลขทันที ไม่ต้องรอ poll 60 วิ
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';
import { useAudio } from '@/components/providers/AudioProvider';
import { subscribeNotificationsChanged } from '@/lib/notification-events';

export default function NotificationBell() {
  const { t } = useI18n();
  const { play } = useAudio();
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const previousUnread = useRef<number | null>(null);

  /** ตั้งตัวเลขที่แสดง — เล่นเสียงเฉพาะตอน "เพิ่มขึ้น" จริง ๆ */
  const apply = useCallback(
    (next: number, sound: boolean) => {
      const value = Number.isFinite(next) ? Math.max(0, Math.floor(next)) : 0;
      // Phase 21: มีการแจ้งเตือนใหม่ → เสียงแจ้งเตือนสั้น ๆ (ครั้งเดียวต่อการเพิ่ม)
      if (sound && previousUnread.current !== null && value > previousUnread.current) play('notify');
      previousUnread.current = value;
      setUnread(value);
    },
    [play]
  );

  const load = useCallback(() => {
    fetch('/api/notifications?limit=1', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) apply(Number(data.data?.unreadCount ?? 0), true);
      })
      .catch(() => undefined);
  }, [apply]);

  // โหลดครั้งแรก + ทุกครั้งที่เปลี่ยนหน้า
  // (ตัวเลขต้องตรงกับความจริงทันทีเมื่อกลับจากหน้าที่อ่านแจ้งเตือนไปแล้ว)
  useEffect(() => {
    load();
  }, [pathname, load]);

  // อัปเดตเป็นระยะ + เมื่อกลับเข้าแท็บ
  useEffect(() => {
    const timer = window.setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  // หน้า /notifications อ่านแล้ว → รับเลขใหม่ที่ส่งมาตรง ๆ (ทันที) แล้วโหลดยืนยันอีกครั้ง
  useEffect(
    () =>
      subscribeNotificationsChanged((next) => {
        if (typeof next === 'number') apply(next, false);
        load();
      }),
    [apply, load]
  );

  const label = unread > 0 ? t('notif.unread', { n: unread }) : t('header.notifications');

  return (
    <Link
      href="/notifications"
      onClick={() => play('ui_tap')}
      data-notification-bell="true"
      aria-label={label}
      title={label}
      className="relative shrink-0 px-1 text-lg leading-none transition-colors hover:opacity-80"
    >
      🔔
      {unread > 0 && (
        <span
          data-notification-badge={unread}
          className="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

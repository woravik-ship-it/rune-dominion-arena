'use client';

// Notification center (Phase 20) — ศูนย์การแจ้งเตือนของผู้เล่น
//
// ผู้ใช้สั่ง 2026-09-26: "ทำระบบแจ้งเตือนต่างๆ เช่นทำรูปเสร็จ, ต่อสู้จบ รายงานผล หรือประกาศต่างๆ
// สำหรับของแต่ละ User"
//  - แยกของการแจ้งเตือนแต่ละ user (API ยึด session) · กรอง ยังไม่อ่าน/ทั้งหมด · กดอ่านทั้งหมดได้
//  - เวลาแสดงแบบ "2 นาทีที่แล้ว" ตามภาษาที่เลือก
//
// Phase 24.1 — ผู้ใช้สั่ง: "การแจ้งเตือนเมื่อเปิดดูแล้ว ไม่หายไปในทันที"
//  - กดอ่าน → **หายจากรายการทันที** (ทั้งตอนกรอง "ยังไม่อ่าน" และตัวเลขบนระฆังในหัวเว็บ)
//  - ใช้ optimistic update + ยิงเหตุการณ์ `notifications-changed` ให้ระฆังอัปเดตโดยไม่รอ poll 60 วิ
//    แล้วค่อยปรับให้ตรงกับเลขจากเซิร์ฟเวอร์ (ถ้าคำขอล้มเหลว → โหลดของจริงกลับมา)
//  - คำขอใช้ `keepalive: true` เพราะกดลิงก์แล้วเปลี่ยนหน้าทันที (คำขอต้องไม่ถูกตัดทิ้ง)
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/components/providers/LocaleProvider';
import { relativeTime } from '@/lib/relative-time';
import { emitNotificationsChanged } from '@/lib/notification-events';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  icon: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_LABEL_KEY: Record<string, string> = {
  ANNOUNCEMENT: 'notif.typeAnnouncement',
  IMAGE_READY: 'notif.typeImage',
  IMAGE_FAILED: 'notif.typeImage',
  BATTLE_RESULT: 'notif.typeBattle',
  ARENA_RESULT: 'notif.typeArena',
  EVENT: 'notif.typeEvent',
  SYSTEM: 'notif.typeSystem',
};

export default function NotificationsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/notifications?filter=${filter}&limit=50`);
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'error');
      setItems(data.data.items as NotificationItem[]);
      setUnreadCount(Number(data.data.unreadCount ?? 0));
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** ยิงคำขอ "อ่านแล้ว" — คืนจำนวนยังไม่อ่านล่าสุดจากเซิร์ฟเวอร์ (null = ล้มเหลว) */
  const postRead = useCallback(async (ids?: string[]): Promise<number | null> => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids ? { ids } : {}),
        // กดลิงก์แล้วเปลี่ยนหน้าทันที — คำขอต้องถูกส่งจนจบ (ไม่ถูกยกเลิกตอน unmount)
        keepalive: true,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) return null;
      const next = Number(data.data?.unreadCount);
      return Number.isFinite(next) ? Math.max(0, Math.floor(next)) : null;
    } catch {
      return null;
    }
  }, []);

  const markAll = async () => {
    if (unreadCount === 0) return;
    // optimistic — อ่านทั้งหมด: รายการที่กรอง "ยังไม่อ่าน" ว่างทันที + ระฆังในหัวเว็บเป็น 0 ทันที
    setItems((prev) => (filter === 'unread' ? [] : prev.map((item) => ({ ...item, isRead: true }))));
    setUnreadCount(0);
    emitNotificationsChanged(0);
    const server = await postRead();
    if (server === null) {
      void load(); // ล้มเหลว → โหลดของจริงกลับมา (ห้ามค้างผลลัพธ์ที่ไม่ได้เกิดขึ้น)
      return;
    }
    setUnreadCount(server);
    emitNotificationsChanged(server);
  };

  const markOne = async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (!target || target.isRead) return; // อ่านแล้ว/กดซ้ำ → ไม่ต้องยิง API อีก
    setItems((prev) =>
      filter === 'unread'
        ? prev.filter((item) => item.id !== id) // กรอง "ยังไม่อ่าน" → อ่านแล้วต้องหายจากรายการทันที
        : prev.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    );
    const optimistic = Math.max(0, unreadCount - 1);
    setUnreadCount(optimistic);
    emitNotificationsChanged(optimistic);
    const server = await postRead([id]);
    if (server === null) {
      void load();
      return;
    }
    setUnreadCount(server);
    emitNotificationsChanged(server);
  };

  const emptyText = useMemo(
    () => (filter === 'unread' ? t('notif.emptyUnread') : t('notif.empty')),
    [filter, t]
  );

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-2xl">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">🔔 {t('notif.title')}</h1>
            <p className="text-sm text-gray-400">{t('notif.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={markAll}
            disabled={unreadCount === 0}
            className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-gray-200 hover:bg-white/20 disabled:opacity-40"
          >
            {t('notif.markAllRead')}
          </button>
        </header>

        <div className="mb-4 flex items-center gap-2">
          {(['all', 'unread'] as const).map((key) => (
            <button
              key={key}
              type="button"
              data-notif-filter={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === key ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {key === 'all' ? t('notif.filterAll') : t('notif.filterUnread')}
              {key === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        {loading && <p className="py-6 text-center text-sm text-gray-500">{t('common.loading')}</p>}
        {!loading && error && (
          <div className="py-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button type="button" onClick={load} className="btn-secondary mt-3 text-sm">
              {t('common.retry')}
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="rounded-xl bg-gray-800 p-8 text-center">
            <p className="text-3xl">📭</p>
            <p className="mt-2 text-sm text-gray-400">{emptyText}</p>
          </div>
        )}

        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              data-notification-id={item.id}
              data-unread={item.isRead ? 'false' : 'true'}
              className={`rounded-xl border p-3 transition-colors ${
                item.isRead ? 'border-gray-800 bg-gray-900' : 'border-amber-500/40 bg-gray-800'
              }`}
            >
              <Link href={item.href ?? '/notifications'} onClick={() => void markOne(item.id)} className="block">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-xl leading-none">{item.icon ?? '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-bold text-white">{item.title}</p>
                      {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden />}
                    </div>
                    <p className="mt-0.5 break-words text-sm text-gray-300">{item.body}</p>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {t(TYPE_LABEL_KEY[item.type] ?? 'notif.typeSystem')} · {relativeTime(item.createdAt, t)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}


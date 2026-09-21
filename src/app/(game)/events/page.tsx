'use client';

// หน้ารวมกิจกรรม — Phase 11 (ใช้เมื่อยังไม่มี event ที่เปิดอยู่ ก็ยังเห็นรายการได้)
import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface EventSummary {
  id: string;
  nameTh: string;
  descriptionTh: string | null;
  status: string;
  msLeft: number;
  boss: { percent: number; nameTh: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  UPCOMING: 'กำลังจะมาถึง',
  ACTIVE: 'กำลังเปิด',
  GRACE_PERIOD: 'ช่วงเก็บตก',
  ENDED: 'สิ้นสุดแล้ว',
};

export default function EventsPage() {
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/events');
        const data = await res.json();
        if (data.success) setEvent(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">กิจกรรม</h1>
        <p className="text-center text-gray-400 mb-6">กิจกรรมตามฤดูกาลและอีเวนต์พิเศษ</p>

        {loading && <p className="text-center text-gray-500 py-10">กำลังโหลด...</p>}

        {!loading && !event && (
          <div className="bg-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-400">ยังไม่มีกิจกรรมที่เปิดอยู่</p>
            <p className="text-xs text-gray-500 mt-2">ติดตามประกาศกิจกรรมใหม่ได้ที่นี่</p>
          </div>
        )}

        {!loading && event && (
          <Link
            href={`/events/${event.id}`}
            className="block bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 rounded-2xl p-6 border border-purple-700 hover:border-purple-500 transition-colors"
          >
            <p className="text-xs text-purple-300 mb-1">
              SEASONAL EVENT · {STATUS_LABEL[event.status] ?? event.status}
            </p>
            <h2 className="text-xl font-bold text-white mb-1">{event.nameTh}</h2>
            <p className="text-sm text-purple-200 mb-3">{event.descriptionTh}</p>
            {event.boss && (
              <div className="w-full bg-purple-950/60 rounded-full h-3 mb-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-indigo-400 h-full"
                  style={{ width: `${Math.max(2, event.boss.percent)}%` }}
                />
              </div>
            )}
            <div className="flex justify-between text-xs text-purple-300">
              <span>บอส {event.boss?.nameTh ?? '-'} · {event.boss?.percent ?? 0}% HP</span>
              <span>แตะเพื่อเข้าร่วม →</span>
            </div>
          </Link>
        )}
      </div>
    </main>
  );
}

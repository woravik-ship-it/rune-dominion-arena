'use client';

import { useEffect, useState } from 'react';

interface Analytics {
  totalUsers: number;
  totalCards: number;
  totalDiscoveries: number;
  todayDiscoveries: number;
  totalBattles: number;
  totalDecks: number;
  totalCoinsInCirculation: number;
  imageJobs: Record<string, number>;
  activeQuests: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((r) => r.json())
      .then((d) => (d.success ? setStats(d.data) : setError(d.error)))
      .catch(() => setError('โหลดข้อมูลไม่สำเร็จ'));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!stats) return <p className="text-gray-400">กำลังโหลด...</p>;

  const items = [
    { label: 'ผู้เล่นทั้งหมด', value: stats.totalUsers, icon: '👥' },
    { label: 'การ์ดทั้งหมด', value: stats.totalCards, icon: '🃏' },
    { label: 'การค้นพบรวม', value: stats.totalDiscoveries, icon: '🔮' },
    { label: 'ค้นพบวันนี้', value: stats.todayDiscoveries, icon: '📅' },
    { label: 'การต่อสู้รวม', value: stats.totalBattles, icon: '⚔️' },
    { label: 'เด็คทั้งหมด', value: stats.totalDecks, icon: '🗂️' },
    { label: 'เหรียญในระบบ', value: stats.totalCoinsInCirculation.toLocaleString('th-TH'), icon: '🪙' },
    { label: 'เควสที่เปิดใช้', value: stats.activeQuests, icon: '📜' },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {items.map((it) => (
          <div key={it.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="text-2xl">{it.icon}</div>
            <div className="text-2xl font-bold text-white">{it.value}</div>
            <div className="text-xs text-gray-400">{it.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <h3 className="font-bold mb-2">🖼️ สถานะคิวภาพ</h3>
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(stats.imageJobs).map(([status, count]) => (
            <span key={status} className="bg-gray-700 px-3 py-1 rounded-full">
              {status}: <b className="text-amber-400">{count}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  discoveryEnergy: number;
  cardCount: number;
  deckCount: number;
  discoveryCount: number;
  coinBalance: number;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [refilling, setRefilling] = useState<string | null>(null);
  /** Phase 27: แบ่งหน้า — เดิมขอครั้งเดียว 50 รายชื่อ ผู้เล่นเกิน 50 จึงไม่ครบ */
  const [limit, setLimit] = useState(50);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  });

  const refillEnergy = async (u: AdminUser, mode: 'refill' | 'add' = 'refill', amount = 1) => {
    setMsg(null);
    setError(null);
    setRefilling(u.id);
    try {
      const hasBody = mode !== 'refill';
      const res = await fetch(`/api/admin/users/${u.id}/energy`, {
        method: 'POST',
        ...(hasBody
          ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, amount }) }
          : {}),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เติมพลังไม่สำเร็จ'); return; }
      setMsg(data.message);
      await load(search);
    } catch {
      setError('เติมพลังไม่สำเร็จ');
    } finally {
      setRefilling(null);
    }
  };

  const load = async (q = '', nextPage = 1, nextLimit = limit) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(nextLimit) });
      if (q) params.set('search', q);
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
        if (data.pagination) setPagination(data.pagination);
      } else {
        setError(data.error);
      }
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load('', 1, 50); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(search)}
          placeholder="ค้นหา username / email..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
        />
        <button onClick={() => load(search, 1)} className="btn-primary text-sm">ค้นหา</button>
      </div>

      {/* Phase 27: แถบแบ่งหน้าแบบเดียวกับหน้าการ์ด */}
      <div
        data-admin-users-pager
        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/70 px-3 py-2 text-xs text-gray-300"
      >
        <span data-admin-users-total>
          ทั้งหมด <b className="text-white">{pagination.total}</b> คน · กำลังแสดง {pagination.from}–
          {pagination.to} · หน้า {pagination.page}/{pagination.totalPages}
        </span>
        <label className="ml-auto flex items-center gap-1">
          ต่อหน้า
          <select
            data-admin-users-limit
            value={limit}
            onChange={(e) => {
              const next = Number(e.target.value) || 50;
              setLimit(next);
              void load(search, 1, next);
            }}
            className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white"
          >
            {[20, 50, 100].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        [{pagination.page}/{pagination.totalPages}]
        <button
          type="button"
          data-admin-users-prev
          onClick={() => void load(search, Math.max(1, pagination.page - 1))}
          disabled={pagination.page <= 1}
          className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
        >
          ◀ ก่อนหน้า
        </button>
        <button
          type="button"
          data-admin-users-next
          onClick={() => void load(search, Math.min(pagination.totalPages, pagination.page + 1))}
          disabled={pagination.page >= pagination.totalPages}
          className="rounded bg-white/10 px-2 py-1 disabled:opacity-40"
        >
          ถัดไป ▶
        </button>
      </div>

      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {loading ? (
        <p className="text-gray-400">กำลังโหลด...</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="p-2 text-left">Username</th>
                <th className="p-2 text-left">Role</th>
                <th className="p-2 text-right">การ์ด</th>
                <th className="p-2 text-right">เด็ค</th>
                <th className="p-2 text-right">ค้นพบ</th>
                <th className="p-2 text-right">เหรียญ</th>
                <th className="p-2 text-center">พลังค้นหา</th>
                <th className="p-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-admin-user={u.id} className="border-t border-gray-700 text-gray-200">
                  <td className="p-2">
                    <div className="font-bold">{u.username}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="p-2">
                    <span className={u.role === 'PLAYER' ? 'text-gray-400' : 'text-amber-400'}>{u.role}</span>
                  </td>
                  <td className="p-2 text-right">{u.cardCount}</td>
                  <td className="p-2 text-right">{u.deckCount}</td>
                  <td className="p-2 text-right">{u.discoveryCount}</td>
                  <td className="p-2 text-right text-amber-400">{u.coinBalance.toLocaleString('th-TH')}</td>
                  <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-xs text-gray-400">⚡ {u.discoveryEnergy}/5</span>
                      {u.discoveryEnergy < 5 && (
                        <>
                          <button
                            onClick={() => refillEnergy(u, 'add', 1)}
                            disabled={refilling === u.id}
                            className="text-xs px-2 py-1 rounded-full bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                            title="เติมทีละ 1 หน่วย"
                          >
                            {refilling === u.id ? '...' : '+1'}
                          </button>
                          <button
                            onClick={() => refillEnergy(u, 'refill')}
                            disabled={refilling === u.id}
                            className="text-xs px-2 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                            title="เติมเต็มเป็น 5/5"
                          >
                            เต็ม
                          </button>
                        </>
                      )}
                      {u.discoveryEnergy >= 5 && (
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-700 text-gray-400" title="พลังเต็มอยู่แล้ว">
                          เต็ม
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    {u.isActive ? '✅' : '🚫'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

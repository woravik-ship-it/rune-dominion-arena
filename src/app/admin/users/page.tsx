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

  const refillEnergy = async (u: AdminUser) => {
    if (u.discoveryEnergy >= 5) return;
    setMsg(null);
    setError(null);
    setRefilling(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/energy`, { method: 'POST' });
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

  const load = async (q = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      if (data.success) setUsers(data.data);
      else setError(data.error);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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
        <button onClick={() => load(search)} className="btn-primary text-sm">ค้นหา</button>
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
                <tr key={u.id} className="border-t border-gray-700 text-gray-200">
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
                    <button
                      onClick={() => refillEnergy(u)}
                      disabled={refilling === u.id}
                      className={`text-xs px-2 py-1 rounded-full transition-colors ${
                        u.discoveryEnergy >= 5
                          ? 'bg-gray-700 text-gray-400 cursor-default'
                          : 'bg-amber-600 hover:bg-amber-500 text-white'
                      }`}
                      title={u.discoveryEnergy >= 5 ? 'พลังเต็มอยู่แล้ว' : 'เติมพลังค้นหาเป็น 5/5'}
                    >
                      {refilling === u.id ? '...' : `⚡ ${u.discoveryEnergy}/5`}
                    </button>
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

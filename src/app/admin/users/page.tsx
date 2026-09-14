'use client';

import { useEffect, useState } from 'react';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
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

      {error && <p className="text-red-400 mb-2">{error}</p>}
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

'use client';

import { useEffect, useState } from 'react';
import { ADMIN_ROLES, ROLE_LABEL_TH, checkManageUser, type ManagedAction } from '@/lib/admin-users';

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
  /** Phase 29: จัดการผู้เล่น (สิทธิ์/แบน/ลบ) */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [actor, setActor] = useState<{ id: string; role: string } | null>(null);
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

  /** รู้ว่าตัวเองเป็นใคร/สิทธิ์อะไร → ใช้ซ่อนปุ่มที่กดไม่ได้ (เซิร์ฟเวอร์ยังตรวจซ้ำเสมอ) */
  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const user = data?.data?.user;
        if (user?.id) setActor({ id: user.id, role: user.role ?? 'PLAYER' });
      })
      .catch(() => undefined);
  }, []);

  /** ตรวจสิทธิ์ฝั่ง UI ด้วยกติกาชุดเดียวกับเซิร์ฟเวอร์ */
  const allowed = (action: ManagedAction, u: AdminUser, nextRole?: string): boolean => {
    if (!actor) return false;
    return checkManageUser({
      actorId: actor.id,
      actorRole: actor.role,
      targetId: u.id,
      targetRole: u.role,
      action,
      nextRole,
    }).ok;
  };

  /** เปลี่ยนสิทธิ์ผู้เล่น */
  const changeRole = async (u: AdminUser, role: string) => {
    if (!allowed('changeRole', u, role)) return;
    setBusyId(u.id);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'เปลี่ยนสิทธิ์ไม่สำเร็จ');
        return;
      }
      setMsg(data.message);
      await load(search, pagination.page, limit);
    } catch {
      setError('เปลี่ยนสิทธิ์ไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  /** แบน / ปลดแบน */
  const setActive = async (u: AdminUser, isActive: boolean) => {
    if (!allowed(isActive ? 'unban' : 'ban', u)) return;
    setBusyId(u.id);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'อัปเดตสถานะไม่สำเร็จ');
        return;
      }
      setMsg(data.message);
      await load(search, pagination.page, limit);
    } catch {
      setError('อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  /** ลบผู้เล่น (ต้องพิมพ์ชื่อให้ตรง) */
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${deleting.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmUsername: confirmName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'ลบผู้เล่นไม่สำเร็จ');
        return;
      }
      setMsg(data.message);
      setDeleting(null);
      setConfirmName('');
      await load(search, pagination.page, limit);
    } catch {
      setError('ลบผู้เล่นไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

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
                <tr
                  key={u.id}
                  data-admin-user={u.id}
                  data-admin-user-banned={u.isActive ? 'false' : 'true'}
                  className={`border-t border-gray-700 ${u.isActive ? 'text-gray-200' : 'text-gray-500'}`}
                >
                  <td className="p-2">
                    <div className="font-bold">
                      {u.username} {!u.isActive && <span className="ml-1 text-[10px] text-red-400">🚫 ถูกแบน</span>}
                    </div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="p-2">
                    {/* Phase 29: กำหนดสิทธิ์ผู้เล่น (แอดมินเท่านั้น · ซ่อนปุ่มที่กดไม่ได้) */}
                    {allowed('changeRole', u, u.role === 'PLAYER' ? 'MODERATOR' : 'PLAYER') ? (
                      <select
                        data-admin-user-role={u.id}
                        value={u.role}
                        disabled={busyId === u.id}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        {ADMIN_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL_TH[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={u.role === 'PLAYER' ? 'text-gray-400' : 'text-amber-400'}>
                        {ROLE_LABEL_TH[u.role as keyof typeof ROLE_LABEL_TH] ?? u.role}
                      </span>
                    )}
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
                  <td className="p-2">
                    {/* Phase 29: แบน/ปลดแบน + ลบผู้เล่น */}
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      <span data-admin-user-status={u.isActive ? 'active' : 'banned'}>
                        {u.isActive ? '✅ ใช้งาน' : '🚫 ถูกแบน'}
                      </span>
                      {allowed(u.isActive ? 'ban' : 'unban', u) && (
                        <button
                          type="button"
                          data-admin-user-ban={u.id}
                          data-admin-user-ban-action={u.isActive ? 'ban' : 'unban'}
                          disabled={busyId === u.id}
                          onClick={() => setActive(u, !u.isActive)}
                          className={`rounded px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                            u.isActive
                              ? 'bg-red-700/80 text-white hover:bg-red-600'
                              : 'bg-emerald-700/80 text-white hover:bg-emerald-600'
                          }`}
                        >
                          {busyId === u.id ? '...' : u.isActive ? '🚫 แบน' : '♻️ ปลดแบน'}
                        </button>
                      )}
                      {allowed('delete', u) && (
                        <button
                          type="button"
                          data-admin-user-delete={u.id}
                          disabled={busyId === u.id}
                          onClick={() => { setDeleting(u); setConfirmName(''); setMsg(null); setError(null); }}
                          className="rounded bg-white/10 px-2 py-1 text-xs text-gray-200 transition-colors hover:bg-red-700/70 hover:text-white disabled:opacity-50"
                        >
                          🗑️ ลบ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Phase 29: ยืนยันการลบผู้เล่น — ต้องพิมพ์ชื่อผู้ใช้ให้ตรง */}
      {deleting && (
        <div
          data-admin-user-delete-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-800 bg-gray-800 p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="mb-2 font-bold text-red-300">🗑️ ลบผู้เล่นถาวร</h3>
            <p className="mb-2 text-sm text-gray-300">
              กำลังจะลบ <b className="text-white">{deleting.username}</b> ({deleting.email})
            </p>
            <ul className="mb-3 list-inside list-disc text-xs text-gray-400">
              <li>การ์ด {deleting.cardCount} · ทีม {deleting.deckCount} · ค้นพบ {deleting.discoveryCount} ครั้ง</li>
              <li>Coin {deleting.coinBalance.toLocaleString('th-TH')} และของสะสมทั้งหมดจะหายไป</li>
              <li className="text-red-400">ลบแล้วกู้คืนไม่ได้</li>
            </ul>
            <label className="mb-1 block text-xs text-gray-400">
              พิมพ์ชื่อผู้ใช้ <b className="text-white">{deleting.username}</b> เพื่อยืนยัน
            </label>
            <input
              data-admin-user-delete-confirm-input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-white"
              placeholder={deleting.username}
            />
            <div className="flex gap-2">
              <button
                type="button"
                data-admin-user-delete-confirm
                disabled={busyId === deleting.id || confirmName.trim() !== deleting.username}
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40"
              >
                {busyId === deleting.id ? 'กำลังลบ…' : 'ยืนยันลบผู้เล่น'}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm text-gray-200 hover:bg-white/20"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

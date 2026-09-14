'use client';

import { useEffect, useState } from 'react';

interface AdminCard {
  id: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
  role: string;
  discoveryCount: number;
  ownerCount: number;
}

export default function AdminCardsPage() {
  const [cards, setCards] = useState<AdminCard[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminCard | null>(null);
  const [editForm, setEditForm] = useState({ nameTh: '', loreTh: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (q = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cards?limit=50${q ? `&search=${encodeURIComponent(q)}` : ''}`);
      const data = await res.json();
      if (data.success) setCards(data.data);
      else setError(data.error);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openEdit = async (card: AdminCard) => {
    setEditing(card);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cards/${card.id}`);
      const data = await res.json();
      if (data.success) {
        const full = data.data;
        setEditForm({ nameTh: full.nameTh || '', loreTh: full.loreTh || '' });
      }
    } catch {
      setError('โหลดรายละเอียดไม่สำเร็จ');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cards/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'บันทึกไม่สำเร็จ'); return; }
      setMsg(`✅ บันทึกการ์ด "${data.data.name}" แล้ว`);
      setEditing(null);
      await load(search);
    } catch {
      setError('บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(search)}
          placeholder="ค้นหาชื่อการ์ด..."
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
                <th className="p-2 text-left">การ์ด</th>
                <th className="p-2 text-left">ธาตุ/ความหายาก</th>
                <th className="p-2 text-right">ครั้งที่ค้นพบ</th>
                <th className="p-2 text-right">เจ้าของ</th>
                <th className="p-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-t border-gray-700 text-gray-200">
                  <td className="p-2">
                    <div className="font-bold">{c.nameTh || c.name}</div>
                    <div className="text-xs text-gray-500">{c.name}</div>
                  </td>
                  <td className="p-2 text-xs">
                    <div>{c.element}</div>
                    <div className="text-amber-400">{c.rarity}</div>
                  </td>
                  <td className="p-2 text-right">{c.discoveryCount}</td>
                  <td className="p-2 text-right">{c.ownerCount}</td>
                  <td className="p-2 text-center">
                    <button onClick={() => openEdit(c)} className="btn-secondary text-xs px-3 py-1">แก้ไข</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">แก้ไขการ์ด: {editing.name}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <label className="block text-xs text-gray-400 mb-1">ชื่อไทย</label>
            <input
              value={editForm.nameTh}
              onChange={(e) => setEditForm({ ...editForm, nameTh: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">เรื่องเล่า (ไทย)</label>
            <textarea
              value={editForm.loreTh}
              onChange={(e) => setEditForm({ ...editForm, loreTh: e.target.value })}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-4"
            />
            <div className="flex gap-2">
              <button onClick={handleSave} className="btn-primary flex-1 text-sm">บันทึก</button>
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm px-4">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

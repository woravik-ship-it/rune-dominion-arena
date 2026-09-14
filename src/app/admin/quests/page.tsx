'use client';

import { useEffect, useState } from 'react';

interface AdminQuest {
  id: string;
  code: string;
  nameTh: string;
  type: string;
  metric: string;
  targetValue: number;
  rewardAmount: number;
  isActive: boolean;
  participantCount: number;
}

export default function AdminQuestsPage() {
  const [quests, setQuests] = useState<AdminQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminQuest | null>(null);
  const [editForm, setEditForm] = useState({ targetValue: 1, rewardAmount: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/quests');
      const data = await res.json();
      if (data.success) setQuests(data.data);
      else setError(data.error);
    } catch {
      setError('โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (quest: AdminQuest) => {
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/quests/${quest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !quest.isActive }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'บันทึกไม่สำเร็จ'); return; }
      setMsg(`✅ ${data.data.isActive ? 'เปิด' : 'ปิด'}เควส "${quest.nameTh}" แล้ว`);
      await load();
    } catch {
      setError('บันทึกไม่สำเร็จ');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/quests/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'บันทึกไม่สำเร็จ'); return; }
      setMsg(`✅ บันทึกเควส "${editing.nameTh}" แล้ว`);
      setEditing(null);
      await load();
    } catch {
      setError('บันทึกไม่สำเร็จ');
    }
  };

  return (
    <div>
      {msg && <p className="text-green-400 text-sm mb-2">{msg}</p>}
      {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
      {loading ? (
        <p className="text-gray-400">กำลังโหลด...</p>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-700 text-gray-300">
              <tr>
                <th className="p-2 text-left">เควส</th>
                <th className="p-2 text-left">ประเภท</th>
                <th className="p-2 text-right">เป้าหมาย</th>
                <th className="p-2 text-right">รางวัล 🪙</th>
                <th className="p-2 text-right">ผู้เล่นที่ทำ</th>
                <th className="p-2 text-center">สถานะ</th>
                <th className="p-2 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {quests.map((q) => (
                <tr key={q.id} className={`border-t border-gray-700 text-gray-200 ${!q.isActive ? 'opacity-50' : ''}`}>
                  <td className="p-2">
                    <div className="font-bold">{q.nameTh}</div>
                    <div className="text-xs text-gray-500">{q.code}</div>
                  </td>
                  <td className="p-2 text-xs">{q.type}<br /><span className="text-gray-500">{q.metric}</span></td>
                  <td className="p-2 text-right">{q.targetValue}</td>
                  <td className="p-2 text-right text-amber-400">{q.rewardAmount}</td>
                  <td className="p-2 text-right">{q.participantCount}</td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => handleToggle(q)}
                      className={`text-xs px-2 py-1 rounded-full ${q.isActive ? 'bg-green-600' : 'bg-gray-600'}`}
                    >
                      {q.isActive ? 'เปิด' : 'ปิด'}
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => { setEditing(q); setEditForm({ targetValue: q.targetValue, rewardAmount: q.rewardAmount }); }}
                      className="btn-secondary text-xs px-3 py-1"
                    >
                      แก้ไข
                    </button>
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
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full border border-gray-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">แก้ไข: {editing.nameTh}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <label className="block text-xs text-gray-400 mb-1">เป้าหมาย (จำนวนเต็ม)</label>
            <input
              type="number"
              min={1}
              value={editForm.targetValue}
              onChange={(e) => setEditForm({ ...editForm, targetValue: parseInt(e.target.value) || 0 })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">รางวัล (เหรียญ)</label>
            <input
              type="number"
              min={0}
              value={editForm.rewardAmount}
              onChange={(e) => setEditForm({ ...editForm, rewardAmount: parseInt(e.target.value) || 0 })}
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

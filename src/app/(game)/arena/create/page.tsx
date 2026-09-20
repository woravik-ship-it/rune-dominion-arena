'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';

interface Deck {
  id: string;
  name: string;
  cardCount: number;
}

export default function ArenaCreatePage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [name, setName] = useState('');
  const [deckId, setDeckId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/decks')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setDecks(d.data);
          const full = d.data.find((x: Deck) => x.cardCount === 5);
          if (full) setDeckId(full.id);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !deckId) { setErr('กรอกชื่อห้องและเลือกทีมป้องกัน'); return; }
    if (!confirm('ใช้ Coin 30 เหรียญเพื่อเปิดห้องนี้?')) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/arena/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), deckId }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'เปิดห้องไม่สำเร็จ'); return; }
      window.location.href = `/arena/${data.data.id}`;
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">เปิดห้อง Arena (30 Coin)</h1>
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400">ชื่อห้อง (ไม่เกิน 60 ตัวอักษร)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400">ทีมป้องกัน (เด็ค 5 ใบของคุณ)</label>
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mt-1"
            >
              <option value="">— เลือกเด็ค —</option>
              {decks.filter((d) => d.cardCount === 5).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? 'กำลังเปิด...' : 'เปิดห้อง (30 Coin)'}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-4">
          ค่าเข้าร่วมใช้ภายในเกมเท่านั้น • ห้องหมดอายุใน 24 ชม.
        </p>
      </div>
    </main>
  );
}

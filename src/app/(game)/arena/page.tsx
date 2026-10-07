'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Room {
  id: string;
  name: string;
  status: string;
  participantCount: number;
  maxPlayers: number;
  entryFee: number;
  rewardPool: number;
  expiresAt: string | null;
}

interface DeckOption {
  id: string;
  name: string;
  cardCount: number;
}

export default function ArenaLobbyPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState('');
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deckId, setDeckId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRooms();
    // โหลดเด็คมาให้เลือกทีมตอนเปิดห้อง (ผู้ใช้สั่ง 2026-10-03)
    apiFetch('/api/decks')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        const list = (d.data ?? []) as DeckOption[];
        setDecks(list);
        const full = list.find((x) => x.cardCount === 5);
        if (full) setDeckId(full.id);
      })
      .catch(() => undefined);
  }, []);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/arena?filter=active');
      const data = await res.json();
      if (data.success) setRooms(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const timeLeft = (exp: string | null) => {
    if (!exp) return '—';
    const ms = new Date(exp).getTime() - Date.now();
    if (ms <= 0) return 'หมดอายุ';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h} ชม. ${m} นาที`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!roomName.trim() || !deckId) { setError('ต้องกรอกชื่อห้องและเลือกทีม (เด็ค 5 ใบ)'); return; }
    const full = decks.find((d) => d.id === deckId && d.cardCount === 5);
    if (!full) { setError('ต้องเลือกเด็คที่มีครบ 5 ใบ (ไปจัดทีมก่อน)'); return; }
    setCreating(true);
    try {
      const res = await apiFetch('/api/arena/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName.trim(), deckId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เปิดห้องไม่สำเร็จ'); return; }
      setRoomName('');
      await loadRooms();
    } finally { setCreating(false); }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">Arena 24 ชม.</h1>
        <p className="text-center text-gray-400 mb-6">
          เปิดห้อง 30 Coin • เข้าร่วม 10 Coin • แชมป์รับรางวัล
        </p>

        <form onSubmit={handleCreate} className="bg-gray-800 rounded-xl p-4 mb-6">
          <h2 className="font-bold mb-2">เปิดห้องใหม่ (30 Coin)</h2>
          <div className="flex gap-2">
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="ชื่อห้อง..."
              maxLength={60}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2"
            />
            <button type="submit" disabled={creating} className="btn-primary text-sm">
              {creating ? 'กำลังเปิด...' : 'เปิดห้อง'}
            </button>
          </div>
          {/* เลือกทีมก่อนเปิดห้อง (ผู้ใช้สั่ง 2026-10-03) */}
          <div>
            <label className="mt-2 block text-xs text-gray-400">ทีม (เด็ค 5 ใบของคุณ)</label>
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">— เลือกทีม —</option>
              {decks
                .filter((d) => d.cardCount === 5)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.cardCount} ใบ)
                  </option>
                ))}
            </select>
            {decks.every((d) => d.cardCount !== 5) && (
              <p className="mt-1 text-[11px] text-amber-300">
                ยังไม่มีเด็คครบ 5 ใบ — <Link href="/decks" className="underline">ไปจัดทีมก่อน</Link>
              </p>
            )}
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </form>

        {loading ? (
          <p className="text-center text-gray-400 py-8">กำลังโหลด...</p>
        ) : rooms.length === 0 ? (
          <p className="text-center text-gray-400 py-8">ยังไม่มีห้อง เปิดห้องแรกเลย!</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rooms.map((r) => (
              <Link key={r.id} href={`/arena/${r.id}`} className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-amber-400 transition-all">
                <h3 className="font-bold">{r.name}</h3>
                <div className="text-sm text-gray-400 mt-1 space-y-0.5">
                  <p>👥 {r.participantCount}/{r.maxPlayers} • 🏆 {r.rewardPool} Coin</p>
                  <p>⏳ เหลือ {timeLeft(r.expiresAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

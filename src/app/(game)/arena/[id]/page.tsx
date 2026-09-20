'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface BoardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string | null;
  wins: number;
  losses: number;
}

interface RoomDetail {
  id: string;
  name: string;
  status: string;
  entryFee: number;
  rewardPool: number;
  participantCount: number;
  championId: string | null;
  expiresAt: string | null;
  leaderboard: BoardEntry[];
}

export default function ArenaRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { loadRoom(); }, [roomId]);

  const loadRoom = async () => {
    try {
      const res = await apiFetch(`/api/arena/${roomId}`);
      const data = await res.json();
      if (data.success) setRoom(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const needDeckThen = async (): Promise<string | null> => {
    const decksRes = await apiFetch('/api/decks');
    const decksData = await decksRes.json();
    const full = decksData.data?.find((d: { cardCount: number; id: string }) => d.cardCount === 5);
    return full?.id ?? null;
  };

  const handleJoin = async () => {
    setErr(null); setMsg(null);
    const deckId = await needDeckThen();
    if (!deckId) { setErr('ต้องมีเด็ค 5 ใบก่อน'); return; }
    if (!confirm(`ใช้ Coin ${room?.entryFee} เหรียญเพื่อเข้าท้าทายห้องนี้?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/arena/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          idempotencyKey: `${roomId}-temp-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'เข้าร่วมไม่สำเร็จ'); return; }
      setMsg('เข้าร่วมแล้ว! กดท้าทายเพื่อสู้กับแชมป์');
      await loadRoom();
    } finally { setBusy(false); }
  };

  const handleChallenge = async () => {
    setErr(null); setMsg(null);
    const deckId = await needDeckThen();
    if (!deckId) { setErr('ต้องมีเด็ค 5 ใบก่อน'); return; }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/arena/${roomId}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          idempotencyKey: `ch-${roomId}-temp-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'ท้าทายไม่สำเร็จ'); return; }
      if (data.data.becameChampion) setMsg('🎉 ชนะ! คุณคือแชมป์คนใหม่');
      else setMsg(data.data.winner === 'A' ? 'ชนะแต่แชมป์ป้องกันได้' : 'แพ้ แชมป์ป้องกันสำเร็จ');
      router.push(`/battle/${data.data.battleLogId}`);
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-gray-400">ไม่พบห้อง</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => router.push('/arena')} className="text-sm text-gray-400 mb-2">
          ← กลับล็อบบี้
        </button>
        <h1 className="text-2xl font-bold">{room.name}</h1>
        <p className="text-sm text-gray-400 mb-4">
          👥 {room.participantCount} คน • 🏆 {room.rewardPool} Coin • สถานะ {room.status}
        </p>

        {msg && <p className="text-green-400 text-sm mb-3">{msg}</p>}
        {err && <p className="text-red-400 text-sm mb-3">{err}</p>}

        <div className="flex gap-2 mb-6">
          <button onClick={handleJoin} disabled={busy} className="btn-secondary text-sm flex-1">
            เข้าร่วม ({room.entryFee} Coin)
          </button>
          <button onClick={handleChallenge} disabled={busy} className="btn-primary text-sm flex-1">
            ⚔️ ท้าทายแชมป์
          </button>
        </div>

        <h2 className="font-bold mb-2">Leaderboard (10 อันดับ)</h2>
        {room.leaderboard.length === 0 ? (
          <p className="text-gray-500 text-sm">ยังไม่มีผู้เข้าร่วม</p>
        ) : (
          <div className="space-y-1">
            {room.leaderboard.map((e) => (
              <div
                key={e.userId}
                className={`flex justify-between text-sm px-3 py-2 rounded-lg ${
                  e.userId === room.championId ? 'bg-amber-500/20 border border-amber-400' : 'bg-gray-800'
                }`}
              >
                <span>#{e.rank} {e.displayName || e.username} {e.userId === room.championId && '👑'}</span>
                <span className="text-gray-400">{e.wins}W - {e.losses}L</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-gray-500 mt-6">
          รางวัลสุดท้ายขึ้นกับจำนวนผู้เข้าร่วมภายใต้เพดานที่กำหนด
        </p>
      </div>
    </main>
  );
}

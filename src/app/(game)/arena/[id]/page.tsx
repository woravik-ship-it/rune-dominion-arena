'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CardFace from '@/components/cards/CardFace';
import { arenaJoinMessage } from '@/services/arena';

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

/** เด็คของฉัน (จาก /api/decks) — ใช้เป็น "เมนูเลือกทีม" ก่อนเข้าร่วม/ท้าทาย */
interface DeckOption {
  id: string;
  name: string;
  cardCount: number;
  teamPower: number;
  formationScore?: { total: number };
  slots: {
    cardId: string;
    name: string;
    nameTh: string | null;
    rarity: string;
    imageUrl: string | null;
    imageStatus: string | null;
  }[];
}

export default function ArenaRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [decks, setDecks] = useState<DeckOption[]>([]);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadRoom(); loadDecks(); }, [roomId]);

  const loadRoom = async () => {
    try {
      const res = await apiFetch(`/api/arena/${roomId}`);
      const data = await res.json();
      if (data.success) setRoom(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  /** เมนูเลือกทีม: เด็คที่ใช้ได้ = มี 5 ใบ (เด็คไม่ครบเลือกไม่ได้ แต่แสดงให้เห็นว่าต้องไปจัดเพิ่ม) */
  const loadDecks = async () => {
    try {
      const res = await apiFetch('/api/decks');
      const data = await res.json();
      const list: DeckOption[] = data.data ?? [];
      setDecks(list);
      const firstFull = list.find((d) => d.cardCount === 5);
      if (firstFull) setDeckId((prev) => prev ?? firstFull.id);
    } catch (e) { console.error(e); }
  };

  const selectedDeck = useMemo(() => decks.find((d) => d.id === deckId) ?? null, [decks, deckId]);

  /** เด็คที่เลือกต้องมี 5 ใบ (ตรงกับที่ API บังคับ) */
  const requireDeck = (): string | null => {
    if (!selectedDeck) { setErr('เลือกทีม (Deck) ก่อน'); return null; }
    if (selectedDeck.cardCount !== 5) { setErr('เด็คที่เลือกยังไม่ครบ 5 ใบ — ไปจัดทีมก่อน'); return null; }
    return selectedDeck.id;
  };

  const handleJoin = async () => {
    setErr(null); setMsg(null);
    const pickedDeckId = requireDeck();
    if (!pickedDeckId) return;
    // ผู้ใช้สั่ง 2026-09-25: ส่งทีมเข้าห้องได้หลายครั้ง — คิดค่าเข้าทุกครั้ง
    if (!confirm(
      `ใช้ Coin ${room?.entryFee} ส่งทีม "${selectedDeck?.name}" เข้าห้องนี้?\n` +
      '(ส่งทีมเข้าซ้ำ/เปลี่ยนทีมได้ตลอด — คิดค่าเข้าทุกครั้ง)'
    )) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/arena/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: pickedDeckId,
          // คีย์เฉพาะคำขอ (กันเน็ตสะดุดแล้วยิงซ้ำ = หักซ้ำ) — ใช้เวลาแทน randomUUID เพราะเว็ปอาจรันบน http
          idempotencyKey: `${roomId}-${pickedDeckId}-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'เข้าร่วมไม่สำเร็จ'); return; }
      setMsg(arenaJoinMessage(
        selectedDeck?.name ?? '',
        Boolean(data.data?.rejoined),
        Number(data.data?.entryFee ?? room?.entryFee ?? 0)
      ));
      await loadRoom();
    } finally { setBusy(false); }
  };

  const handleChallenge = async () => {
    setErr(null); setMsg(null);
    const pickedDeckId = requireDeck();
    if (!pickedDeckId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/arena/${roomId}/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: pickedDeckId,
          idempotencyKey: `ch-${roomId}-temp-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'ท้าทายไม่สำเร็จ'); return; }
      // ผลแพ้/ชนะดูในห้อง battle อย่างเดียว — ที่นี่แค่พาไปดู ไม่ขึ้นข้อความสรุปก่อน
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

        {/* ── เมนูเลือกทีม (Deck) ก่อนเข้าร่วม/ท้าทาย — ผู้ใช้สั่ง 2026-09-25 */}
        <section
          data-arena-deck-picker="true"
          data-arena-selected-deck={deckId ?? ''}
          className="mb-4 rounded-xl border border-gray-700 bg-gray-800/60 p-3"
        >
          <h2 className="mb-2 text-sm font-bold">เลือกทีม (Deck) ที่จะใช้ประลอง</h2>
          {decks.length === 0 ? (
            <p className="text-sm text-gray-400">
              ยังไม่มีเด็ค — <Link href="/decks" className="text-amber-400 underline">ไปจัดทีม 5 ใบ</Link>
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {decks.map((d) => {
                const usable = d.cardCount === 5;
                const active = deckId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    data-arena-deck={d.id}
                    data-arena-deck-usable={usable ? 'true' : 'false'}
                    disabled={!usable}
                    onClick={() => { setDeckId(d.id); setErr(null); }}
                    className={`rounded-lg border-2 p-2 text-left transition-all ${
                      active ? 'border-amber-400 bg-gray-700' : 'border-gray-700 bg-gray-800'
                    } ${usable ? '' : 'opacity-50'}`}
                  >
                    <div className="truncate font-bold">
                      {active ? '✅ ' : ''}{d.name}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      ⚡ {(d.formationScore?.total ?? d.teamPower).toLocaleString('th-TH')} • {d.cardCount}/5 ใบ
                      {!usable && ' (ยังไม่ครบ)'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* พรีวิวการ์ด 5 ใบของทีมที่เลือก (ต้องเห็นภาพจริงก่อนตัดสินใจใช้ Coin) */}
          {selectedDeck && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-gray-400">
                ดูการ์ดในทีม: <span className="font-bold text-gray-200">{selectedDeck.name}</span>
                {' '}({selectedDeck.cardCount}/5 ใบ)
              </p>
              <div data-arena-deck-preview={selectedDeck.id} className="grid grid-cols-5 gap-1">
                {selectedDeck.slots.map((s) => (
                  <div
                    key={s.cardId}
                    data-arena-deck-card={s.cardId}
                    className="relative aspect-[7/10] overflow-hidden rounded-md border border-gray-700 bg-black/40"
                    title={s.nameTh || s.name}
                  >
                    <CardFace
                      cardId={s.cardId}
                      imageUrl={s.imageUrl}
                      imageStatus={s.imageStatus}
                      rarity={s.rarity}
                      alt={s.nameTh || s.name}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="flex gap-2 mb-2">
          <button onClick={handleJoin} disabled={busy || !selectedDeck} className="btn-secondary text-sm flex-1 disabled:opacity-50">
            ส่งทีมเข้าห้อง ({room.entryFee} Coin)
          </button>
          <button onClick={handleChallenge} disabled={busy || !selectedDeck} className="btn-primary text-sm flex-1 disabled:opacity-50">
            ⚔️ ท้าทายแชมป์
          </button>
        </div>
        <p className="mb-6 text-[11px] text-gray-500">
          ส่งทีมเข้าห้องได้หลายครั้ง (เปลี่ยนทีมได้ตลอด) — คิดค่าเข้า {room.entryFee} Coin ทุกครั้งที่ส่งทีม
        </p>

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

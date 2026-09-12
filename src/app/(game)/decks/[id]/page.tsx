'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface PoolCard {
  id: string;
  cardId: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
  stats: { atk: number; def: number; hp: number; spd: number; manaCost: number };
}

interface PlacedCard extends PoolCard {
  position: number;
}

const LINEUP_LABEL: Record<number, string> = {
  0: 'หน้า', 1: 'หน้า', 2: 'กลาง', 3: 'กลาง', 4: 'หลัง',
};

export default function DeckBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const deckId = params.id as string;

  const [deckName, setDeckName] = useState('');
  const [pool, setPool] = useState<PoolCard[]>([]);
  const [placed, setPlaced] = useState<(PlacedCard | null)[]>([null, null, null, null, null]);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadAll(); }, [deckId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [deckRes, cardsRes] = await Promise.all([
        fetch(`/api/decks/${deckId}`),
        fetch('/api/cards?userId=temp-user&limit=100'),
      ]);
      const deckData = await deckRes.json();
      const cardsData = await cardsRes.json();
      if (deckData.success) {
        setDeckName(deckData.data.name);
        const arr: (PlacedCard | null)[] = [null, null, null, null, null];
        for (const s of deckData.data.slots) {
          arr[s.position] = { id: s.cardId, cardId: s.cardId, ...s, position: s.position };
        }
        setPlaced(arr);
      }
      if (cardsData.success) setPool(cardsData.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const teamPower = placed.reduce(
    (sum, c) => sum + (c ? c.stats.atk + c.stats.def + c.stats.hp + c.stats.spd : 0), 0
  );
  const elementCount: Record<string, number> = {};
  placed.forEach((c) => { if (c) elementCount[c.element] = (elementCount[c.element] || 0) + 1; });
  const overElement = Object.entries(elementCount).find(([, n]) => n > 3);
  const filledCount = placed.filter(Boolean).length;
  const placedIds = new Set(placed.filter(Boolean).map((c) => c!.cardId));

  const handleSlotClick = (pos: number) => {
    setErr(null);
    if (placed[pos]) {
      const next = [...placed];
      next[pos] = null;
      setPlaced(next);
      return;
    }
    if (!selectedPool) { setErr('แตะการ์ดในคลังก่อน แล้วแตะช่องที่จะวาง'); return; }
    if (placedIds.has(selectedPool)) { setErr('การ์ดใบนี้อยู่ในทีมแล้ว'); return; }
    const card = pool.find((p) => p.cardId === selectedPool);
    if (!card) return;
    const next = [...placed];
    next[pos] = { ...card, position: pos };
    setPlaced(next);
    setSelectedPool(null);
  };

  const handleSave = async () => {
    setErr(null); setMsg(null);
    if (filledCount !== 5) { setErr(`ทีมต้องครบ 5 ใบ (ปัจจุบัน ${filledCount} ใบ)`); return; }
    if (overElement) { setErr(`ธาตุ ${overElement[0]} เกิน 3 ใบ`); return; }
    setSaving(true);
    try {
      const slots = placed.map((c, position) => ({ cardId: c!.cardId, position }));
      const res = await fetch(`/api/decks/${deckId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'temp-user', name: deckName, slots }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.details ? data.details.join('\n') : data.error || 'บันทึกไม่สำเร็จ');
        return;
      }
      setMsg(`บันทึกแล้ว ⚡ พลังทีม ${data.data.teamPower.toLocaleString('th-TH')}`);
    } finally { setSaving(false); }
  };

  const filteredPool = pool.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.nameTh || '').includes(search);
  });

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <p className="text-gray-400">กำลังโหลด...</p>
      </main>
    );
  }


  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => router.push('/decks')} className="text-sm text-gray-400 mb-2">
          ← กลับรายการเด็ค
        </button>
        <input
          value={deckName}
          onChange={(e) => setDeckName(e.target.value)}
          maxLength={60}
          className="text-2xl font-bold bg-transparent border-b border-gray-700 w-full mb-4 focus:outline-none focus:border-amber-400"
        />
        <div className="bg-gray-800 rounded-xl p-3 mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>⚡ พลังทีม</span>
            <span className="font-bold text-amber-400">{teamPower.toLocaleString('th-TH')}</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
              style={{ width: `${Math.min(100, (teamPower / 5000) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{filledCount}/5 ใบ</p>
        </div>
        {(err || overElement || filledCount !== 5) && (
          <div className="text-sm mb-4 space-y-1">
            {err && <p className="text-red-400 whitespace-pre-line">{err}</p>}
            {overElement && <p className="text-red-400">⚠️ ธาตุ {overElement[0]} เกิน 3 ใบ</p>}
            {filledCount !== 5 && <p className="text-yellow-400">⚠️ วางการ์ดให้ครบ 5 ใบก่อนบันทึก</p>}
          </div>
        )}
        {msg && <p className="text-green-400 text-sm mb-4">{msg}</p>}
        <h2 className="font-bold mb-2">Formation (แตะช่องเพื่อวาง/ถอด)</h2>
        <div className="grid grid-cols-5 gap-2 mb-6">
          {[0, 1, 2, 3, 4].map((pos) => {
            const c = placed[pos];
            return (
              <button
                key={pos}
                onClick={() => handleSlotClick(pos)}
                className={`rounded-xl border-2 min-h-[96px] p-1 text-xs transition-all ${
                  c ? 'border-amber-400 bg-gray-800' : 'border-dashed border-gray-600 bg-gray-900'
                }`}
              >
                <div className="text-gray-500">ช่อง {pos} • {LINEUP_LABEL[pos]}</div>
                {c ? (
                  <div>
                    <div className="font-bold truncate">{c.nameTh || c.name}</div>
                    <div className="text-gray-400">{c.element}</div>
                    <div className="text-amber-400">⚡{c.stats.atk + c.stats.def + c.stats.hp + c.stats.spd}</div>
                  </div>
                ) : (
                  <div className="text-gray-600 text-2xl">+</div>
                )}
              </button>
            );
          })}
        </div>
        <h2 className="font-bold mb-2">คลังการ์ด (แตะเพื่อเลือก แล้วแตะช่องด้านบน)</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อการ์ด..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 mb-3"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          {filteredPool.map((c) => {
            const inTeam = placedIds.has(c.cardId);
            const selected = selectedPool === c.cardId;
            return (
              <button
                key={c.cardId}
                disabled={inTeam}
                onClick={() => setSelectedPool(selected ? null : c.cardId)}
                className={`rounded-xl p-2 text-left text-xs border-2 transition-all ${
                  inTeam ? 'opacity-40 border-gray-700 bg-gray-900'
                  : selected ? 'border-amber-400 bg-gray-700'
                  : 'border-gray-700 bg-gray-800'
                }`}
              >
                <div className="font-bold truncate">{c.nameTh || c.name}</div>
                <div className="text-gray-400 truncate">{c.name}</div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-500">{c.element}</span>
                  <span className="text-amber-400">⚡{c.stats.atk + c.stats.def + c.stats.hp + c.stats.spd}</span>
                </div>
                {inTeam && <div className="text-green-400 mt-1">อยู่ในทีมแล้ว</div>}
              </button>
            );
          })}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || filledCount !== 5}
          className="btn-primary w-full disabled:opacity-50"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึกเด็ค'}
        </button>
      </div>
    </main>
  );
}

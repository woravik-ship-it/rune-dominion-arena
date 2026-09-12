'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Deck {
  id: string;
  name: string;
  teamPower: number;
  cardCount: number;
}

export default function BattleSetupPage() {
  const router = useRouter();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fighting, setFighting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadDecks(); }, []);

  const loadDecks = async () => {
    try {
      const res = await fetch('/api/decks?userId=temp-user');
      const data = await res.json();
      if (data.success) {
        setDecks(data.data);
        const full = data.data.find((d: Deck) => d.cardCount === 5);
        if (full) setSelected(full.id);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleFightBot = async () => {
    setError(null);
    if (!selected) { setError('เลือกเด็คก่อน (ต้องมี 5 ใบ)'); return; }
    setFighting(true);
    try {
      const res = await fetch('/api/battle/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'temp-user', attackerDeckId: selected, bot: true }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'เริ่มสู้ไม่สำเร็จ'); return; }
      router.push(`/battle/${data.data.battleId}`);
    } finally { setFighting(false); }
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">ทดสอบเด็ค (สู้กับบอท)</h1>
        <p className="text-center text-gray-400 mb-6">เลือกทีม 5 ใบของคุณ แล้วเริ่มสู้ได้เลย</p>
        {loading ? (
          <p className="text-center text-gray-400">กำลังโหลด...</p>
        ) : decks.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-400">ยังไม่มีเด็ค</p>
            <Link href="/decks" className="btn-primary mt-4 inline-block">ไปจัดทีม</Link>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-6">
              {decks.map((d) => (
                <button
                  key={d.id}
                  disabled={d.cardCount !== 5}
                  onClick={() => setSelected(d.id)}
                  className={`w-full text-left rounded-xl p-3 border-2 transition-all ${
                    selected === d.id ? 'border-amber-400 bg-gray-700' : 'border-gray-700 bg-gray-800'
                  } ${d.cardCount !== 5 ? 'opacity-50' : ''}`}
                >
                  <div className="font-bold">{d.name}</div>
                  <div className="text-sm text-gray-400">
                    ⚡ {d.teamPower.toLocaleString('th-TH')} • {d.cardCount}/5 ใบ
                    {d.cardCount !== 5 && ' (ยังไม่ครบ)'}
                  </div>
                </button>
              ))}
            </div>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
              onClick={handleFightBot}
              disabled={fighting || !selected}
              className="btn-primary w-full disabled:opacity-50"
            >
              {fighting ? 'กำลังเริ่มสู้...' : '⚔️ สู้กับบอท'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

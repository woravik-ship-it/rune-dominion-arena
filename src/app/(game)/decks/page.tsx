'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Deck {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  teamPower: number;
  cardCount: number;
}

export default function DecksPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadDecks(); }, []);

  const loadDecks = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/decks?userId=temp-user');
      const data = await res.json();
      if (data.success) setDecks(data.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('ลบเด็คนี้ใช่หรือไม่?')) return;
    const res = await fetch(`/api/decks/${id}?userId=temp-user`, { method: 'DELETE' });
    if (res.ok) setDecks((prev) => prev.filter((d) => d.id !== id));
  };

  const handleQuickCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deckName.trim()) { setError('ต้องระบุชื่อเด็ค'); return; }
    setCreating(true);
    try {
      const cardsRes = await fetch('/api/cards?userId=temp-user&limit=5');
      const cardsData = await cardsRes.json();
      if (!cardsData.success || cardsData.data.length < 5) {
        setError('ต้องมีการ์ดอย่างน้อย 5 ใบก่อน (ไปค้นหารูนก่อน)');
        return;
      }
      const slots = cardsData.data.slice(0, 5).map((c: { cardId: string }, i: number) => ({
        cardId: c.cardId, position: i,
      }));
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'temp-user', name: deckName.trim(), slots }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.details ? data.details.join('\n') : data.error || 'สร้างเด็คไม่สำเร็จ');
        return;
      }
      setDeckName('');
      await loadDecks();
    } finally { setCreating(false); }
  };


  return (
    <main className="min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">จัดทีม</h1>
        <p className="text-center text-gray-400 mb-6">
          ทีม 5 ใบ • ห้ามซ้ำ • ธาตุเดียวกันไม่เกิน 3 ใบ
        </p>

        <form onSubmit={handleQuickCreate} className="bg-gray-800 rounded-xl p-4 mb-6">
          <h2 className="font-bold mb-2">สร้างเด็คด่วน (จากการ์ด 5 ใบแรก)</h2>
          <div className="flex gap-2">
            <input
              value={deckName}
              onChange={(e) => setDeckName(e.target.value)}
              placeholder="ชื่อเด็ค เช่น ทีมหลัก"
              maxLength={60}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
            />
            <button type="submit" disabled={creating} className="btn-primary text-sm">
              {creating ? 'กำลังสร้าง...' : 'สร้าง'}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2 whitespace-pre-line">{error}</p>}
        </form>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-gray-400 mt-2">กำลังโหลด...</p>
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">ยังไม่มีเด็ค สร้างทีมแรกของคุณเลย!</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {decks.map((deck) => (
              <div key={deck.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-lg">{deck.name}</h3>
                    <p className="text-sm text-gray-400">
                      ⚡ พลังทีม {deck.teamPower.toLocaleString('th-TH')} • {deck.cardCount}/5 ใบ
                    </p>
                  </div>
                  {deck.isActive && (
                    <span className="text-xs bg-green-600 px-2 py-1 rounded-full">ใช้งาน</span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/decks/${deck.id}`} className="btn-primary text-sm flex-1 text-center">
                    จัดทีม
                  </Link>
                  <button onClick={() => handleDelete(deck.id)} className="btn-secondary text-sm px-4">
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

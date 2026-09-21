'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Card {
  id: string;
  cardId: string;
  name: string;
  nameTh: string;
  element: string;
  rarity: string;
  role: string;
  stats: {
    atk: number;
    def: number;
    hp: number;
    spd: number;
    manaCost: number;
  };
  imageUrl: string | null;
  imageStatus: string;
  /** จำนวนใบที่ถือครอง — ค้นพบซ้ำจะได้อีกใบ */
  quantity: number;
  obtainedAt: string;
  obtainedMethod: string;
  isFavorite?: boolean;
}

const ELEMENTS = [
  { value: 'EMBERBOUND', label: 'เพลิง', color: 'from-red-500 to-orange-500' },
  { value: 'TIDEBORN', label: 'น้ำ', color: 'from-blue-500 to-cyan-500' },
  { value: 'SKYRIVEN', label: 'ลม', color: 'from-teal-400 to-green-400' },
  { value: 'ROOTFORGED', label: 'ดิน', color: 'from-yellow-600 to-amber-700' },
  { value: 'DAWNSWORN', label: 'แสง', color: 'from-yellow-300 to-amber-400' },
  { value: 'VEILMARKED', label: 'เงา', color: 'from-purple-600 to-indigo-800' },
];

const RARITIES = [
  { value: 'COMMON', label: 'ทั่วไป', border: 'border-gray-400' },
  { value: 'UNCOMMON', label: 'ไม่ธรรมดา', border: 'border-green-400' },
  { value: 'RARE', label: 'หายาก', border: 'border-blue-400' },
  { value: 'EPIC', label: 'ตำนาน', border: 'border-purple-400' },
  { value: 'LEGENDARY', label: 'ตำนานเลือง', border: 'border-orange-400' },
  { value: 'MYTHIC', label: 'สร้างสรรค์', border: 'border-red-400' },
];

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [elementFilter, setElementFilter] = useState('');
  const [rarityFilter, setRarityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadCards();
  }, [page, elementFilter, rarityFilter]);

  const loadCards = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
      });
      if (elementFilter) params.set('element', elementFilter);
      if (rarityFilter) params.set('rarity', rarityFilter);
      if (search) params.set('search', search);

      const response = await apiFetch(`/api/cards?${params}`);
      const data = await response.json();

      if (data.success) {
        setCards(data.data);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (error) {
      console.error('Failed to load cards:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadCards();
  };

  const getElementColor = (element: string) => {
    return ELEMENTS.find(e => e.value === element)?.color || 'from-gray-500 to-gray-600';
  };

  const getRarityBorder = (rarity: string) => {
    return RARITIES.find(r => r.value === rarity)?.border || 'border-gray-400';
  };

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-2">คอลเลกชันการ์ด</h1>
        <p className="text-center text-gray-400 mb-6">การ์ดที่คุณสะสมได้</p>

        {/* Search & Filters */}
        <div className="mb-6 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              placeholder="ค้นหาการ์ด..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
            />
            <button type="submit" className="btn-primary px-6">
              🔍
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <select
              value={elementFilter}
              onChange={(e) => { setElementFilter(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">ทุกธาตุ</option>
              {ELEMENTS.map(el => (
                <option key={el.value} value={el.value}>{el.label}</option>
              ))}
            </select>

            <select
              value={rarityFilter}
              onChange={(e) => { setRarityFilter(e.target.value); setPage(1); }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
            >
              <option value="">ทุกความหายาก</option>
              {RARITIES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin text-4xl">⏳</div>
            <p className="text-gray-400 mt-2">กำลังโหลด...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400">ยังไม่มีการ์ด ไปค้นหารูนกัน!</p>
            <Link href="/discover" className="btn-primary mt-4 inline-block">
              ค้นหารูน
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cards.map((userCard) => (
                <Link
                  key={userCard.id}
                  href={`/cards/${userCard.cardId}`}
                  className={`bg-gray-800 rounded-lg overflow-hidden border-2 ${getRarityBorder(userCard.rarity)} hover:scale-105 transition-transform`}
                >
                  {/* Card Image — placeholder จาก /api/cards/[id]/image */}
                  <div className={`h-32 relative bg-gradient-to-br ${getElementColor(userCard.element)}`}>
                    <img
                      src={`/api/cards/${userCard.cardId}/image`}
                      alt={userCard.nameTh || userCard.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* จำนวนใบที่ถือครอง — ค้นพบซ้ำจะได้อีกใบ */}
                    {userCard.quantity > 1 && (
                      <span className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-black/70 text-amber-300 text-xs font-bold">
                        ×{userCard.quantity}
                      </span>
                    )}
                    {userCard.isFavorite && (
                      <span className="absolute top-1 right-1 text-sm">⭐</span>
                    )}
                  </div>

                  {/* Card Info */}
                  <div className="p-3">
                    <h3 className="font-bold text-sm truncate">{userCard.nameTh}</h3>
                    <p className="text-xs text-gray-400 truncate">{userCard.name}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-amber-400">⚡ {userCard.stats.manaCost}</span>
                      <span className="text-xs text-gray-500">{userCard.rarity}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary px-4 py-2 disabled:opacity-50"
                >
                  ← ก่อนหน้า
                </button>
                <span className="px-4 py-2 text-gray-400">
                  หน้า {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary px-4 py-2 disabled:opacity-50"
                >
                  ถัดไป →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

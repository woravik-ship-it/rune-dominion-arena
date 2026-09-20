'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface CardDetail {
  id: string;
  name: string;
  nameTh: string;
  description: string;
  descriptionTh: string;
  lore: string;
  loreTh: string;
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
  skills: Array<{ name: string; description: string; manaCost: number }>;
  imageUrl: string | null;
  imageStatus: string;
  discoveryCount: number;
  firstDiscoverer: { username: string; displayName: string } | null;
  firstDiscoveredAt: string | null;
}

const ELEMENT_NAMES: Record<string, { th: string; en: string; color: string }> = {
  EMBERBOUND: { th: 'เพลิง', en: 'Fire', color: 'from-red-500 to-orange-500' },
  TIDEBORN: { th: 'น้ำ', en: 'Water', color: 'from-blue-500 to-cyan-500' },
  SKYRIVEN: { th: 'ลม', en: 'Wind', color: 'from-teal-400 to-green-400' },
  ROOTFORGED: { th: 'ดิน', en: 'Earth', color: 'from-yellow-600 to-amber-700' },
  DAWNSWORN: { th: 'แสง', en: 'Light', color: 'from-yellow-300 to-amber-400' },
  VEILMARKED: { th: 'เงา', en: 'Shadow', color: 'from-purple-600 to-indigo-800' },
};

const RARITY_NAMES: Record<string, { th: string; border: string }> = {
  COMMON: { th: 'ทั่วไป', border: 'border-gray-400' },
  UNCOMMON: { th: 'ไม่ธรรมดา', border: 'border-green-400' },
  RARE: { th: 'หายาก', border: 'border-blue-400' },
  EPIC: { th: 'ตำนาน', border: 'border-purple-400' },
  LEGENDARY: { th: 'ตำนานเลือง', border: 'border-orange-400' },
  MYTHIC: { th: 'สร้างสรรค์', border: 'border-red-400' },
};

export default function CardDetailPage() {
  const params = useParams();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    loadCard();
  }, [params.id]);

  const loadCard = async () => {
    try {
      setLoading(true);
      const response = await apiFetch(`/api/cards/${params.id}`);
      const data = await response.json();

      if (data.success) {
        setCard(data.data);
      }
    } catch (error) {
      console.error('Failed to load card:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFavorite = async () => {
    try {
      const response = await apiFetch('/api/cards/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'temp-user',
          cardId: card?.id,
          isFavorite: !isFavorite,
        }),
      });
      if (response.ok) {
        setIsFavorite(!isFavorite);
      }
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl">⏳</div>
          <p className="text-gray-400 mt-2">กำลังโหลด...</p>
        </div>
      </main>
    );
  }

  if (!card) {
    return (
      <main className="min-h-screen p-4 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">ไม่พบการ์ด</p>
          <Link href="/cards" className="btn-primary mt-4 inline-block">
            กลับไปคอลเลกชัน
          </Link>
        </div>
      </main>
    );
  }

  const elementInfo = ELEMENT_NAMES[card.element];
  const rarityInfo = RARITY_NAMES[card.rarity];

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/cards" className="text-gray-400 hover:text-white mb-4 inline-block">
          ← กลับไปคอลเลกชัน
        </Link>

        {/* Card Header */}
        <div className={`bg-gray-800 rounded-xl overflow-hidden border-2 ${rarityInfo?.border || 'border-gray-600'}`}>
          {/* Card Image — ใช้รูปจริง ถ้าไม่มี fallback เป็น placeholder SVG */}
          <div className={`h-48 relative flex items-center justify-center ${elementInfo?.color ? 'bg-gradient-to-br ' + elementInfo.color : 'bg-gradient-to-br from-gray-600 to-gray-700'}`}>
            <img
              src={card.imageUrl || `/api/cards/${card.id}/image`}
              alt={card.nameTh || card.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {card.imageStatus === 'PENDING' && (
              <span className="absolute top-2 right-2 bg-yellow-600 text-xs px-2 py-1 rounded">
                รอสร้างภาพ
              </span>
            )}
          </div>

          {/* Card Info */}
          <div className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h1 className="text-2xl font-bold">{card.nameTh}</h1>
                <p className="text-gray-400">{card.name}</p>
              </div>
              <button
                onClick={handleFavorite}
                className="text-2xl hover:scale-110 transition-transform"
              >
                {isFavorite ? '❤️' : '🤍'}
              </button>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                {elementInfo?.th} ({card.element})
              </span>
              <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                {rarityInfo?.th} ({card.rarity})
              </span>
              <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                {card.role}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="bg-gray-700 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">ATK</div>
                <div className="text-lg font-bold text-red-400">{card.stats.atk}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">DEF</div>
                <div className="text-lg font-bold text-blue-400">{card.stats.def}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">HP</div>
                <div className="text-lg font-bold text-green-400">{card.stats.hp}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">SPD</div>
                <div className="text-lg font-bold text-yellow-400">{card.stats.spd}</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-400">MP</div>
                <div className="text-lg font-bold text-purple-400">{card.stats.manaCost}</div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-1">คำอธิบาย</h3>
              <p className="text-gray-300">{card.descriptionTh}</p>
            </div>

            {/* Lore */}
            {card.loreTh && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-1">เรื่องเล่า</h3>
                <p className="text-gray-300 italic">{card.loreTh}</p>
              </div>
            )}

            {/* Skills */}
            {card.skills.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-400 mb-2">สกิล</h3>
                <div className="space-y-2">
                  {card.skills.map((skill, idx) => (
                    <div key={idx} className="bg-gray-700 rounded-lg p-3">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">{skill.name}</span>
                        <span className="text-sm text-purple-400">⚡ {skill.manaCost}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{skill.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discovery Info */}
            <div className="border-t border-gray-700 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">ข้อมูลการค้นพบ</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>จำนวนครั้งที่ถูกค้นพบ: {card.discoveryCount}</p>
                {card.firstDiscoverer && (
                  <p>
                    ผู้ค้นพบคนแรก: {card.firstDiscoverer.displayName || card.firstDiscoverer.username}
                    {card.firstDiscoveredAt && (
                      <span> ({new Date(card.firstDiscoveredAt).toLocaleDateString('th-TH')})</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

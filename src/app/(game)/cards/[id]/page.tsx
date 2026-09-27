'use client';

import { apiFetch } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import CardFace from '@/components/cards/CardFace';
import CardArtStatus from '@/components/cards/CardArtStatus';
import CardItemWorkshop from '@/components/cards/CardItemWorkshop';

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
  /** จำนวนใบที่เราถือครอง (0 = ยังไม่มีในคลัง) */
  quantity: number;
  ownerCount: number;
  isFavorite: boolean;
  firstDiscoverer: { username: string; displayName: string } | null;
  firstDiscoveredAt: string | null;
  /** Phase 25: ขายคืนร้านได้กี่ Veil Shards (ตามความหายาก) */
  sellValue?: number;
  /** Phase 25: Status ที่ได้จาก Item + Status รวมจริง */
  itemStats?: {
    bonus: { atk: number; def: number; hp: number; spd: number };
    effective: { atk: number; def: number; hp: number; spd: number };
  };
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
  const router = useRouter();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [deckMsg, setDeckMsg] = useState<string | null>(null);
  const [deckErr, setDeckErr] = useState<string | null>(null);
  const [addingToDeck, setAddingToDeck] = useState(false);

  /** "เพิ่มลงทีม" — เติมเข้าทีมเดิม/สร้างทีมใหม่ให้ แล้วพาไปหน้าจัดทีม */
  const handleAddToDeck = async () => {
    if (!card) return;
    setAddingToDeck(true);
    setDeckMsg(null);
    setDeckErr(null);
    try {
      const res = await apiFetch('/api/decks/quick-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeckErr(data.error || 'เพิ่มลงทีมไม่สำเร็จ');
        return;
      }
      setDeckMsg(data.data.message ?? 'เพิ่มลงทีมแล้ว');
      router.push(`/decks/${data.data.deckId}`);
    } catch (e) {
      setDeckErr(e instanceof Error ? e.message : 'เพิ่มลงทีมไม่สำเร็จ');
    } finally {
      setAddingToDeck(false);
    }
  };

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
        // สถานะปักหมุดมาจาก server (session ของผู้เล่นคนนี้)
        setIsFavorite(Boolean(data.data?.isFavorite));
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
          <Link href="/decks" className="btn-primary mt-4 inline-block">
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
        <Link href="/decks" className="text-gray-400 hover:text-white mb-4 inline-block">
          ← กลับไปคอลเลกชัน
        </Link>

        {/* Card Header */}
        <div className={`bg-gray-800 rounded-xl overflow-hidden border-2 ${rarityInfo?.border || 'border-gray-600'}`}>
          {/* การ์ด: ภาพ AI (ถ้ามี) + กรอบ/ข้อความ */}
          <div className="relative mx-auto w-full max-w-[330px] aspect-[7/10]">
            <CardFace
              cardId={card.id}
              imageUrl={card.imageUrl}
              imageStatus={card.imageStatus}
              rarity={card.rarity}
              alt={card.nameTh || card.name}
            />
            {card.imageStatus === 'PENDING' && (
              <span className="absolute top-2 right-2 bg-yellow-600 text-xs px-2 py-1 rounded">
                🎨
              </span>
            )}
          </div>

          {/* สถานะการสร้างภาพ + เวลาที่ต้องรอ (Phase 20) */}
          {card.imageUrl === null && (
            <div className="px-6 pt-4">
              <CardArtStatus cardId={card.id} />
            </div>
          )}

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
              {card.quantity > 0 && (
                <span className="bg-amber-900/60 px-3 py-1 rounded-full text-sm text-amber-200">
                  ในคลัง ×{card.quantity}
                </span>
              )}
            </div>

            {/* เพิ่มลงทีม — ใช้ API quick-add จริง */}
            <div className="mb-4">
              <button
                onClick={handleAddToDeck}
                disabled={addingToDeck}
                className="btn-primary w-full disabled:opacity-60"
              >
                {addingToDeck ? 'กำลังเพิ่มลงทีม...' : '➕ เพิ่มลงทีม'}
              </button>
              {(deckMsg || deckErr) && (
                <p className={`text-sm mt-2 ${deckErr ? 'text-red-400' : 'text-emerald-400'}`}>
                  {deckErr || deckMsg}
                </p>
              )}
            </div>

            {/* Stats — Phase 25: โชว์ "สถานะรวม" (พื้นฐาน + Item ที่ใส่) */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              {(
                [
                  { key: 'atk', label: 'ATK', cls: 'text-red-400', value: card.itemStats?.effective.atk ?? card.stats.atk, bonus: card.itemStats?.bonus.atk ?? 0 },
                  { key: 'def', label: 'DEF', cls: 'text-blue-400', value: card.itemStats?.effective.def ?? card.stats.def, bonus: card.itemStats?.bonus.def ?? 0 },
                  { key: 'hp', label: 'HP', cls: 'text-green-400', value: card.itemStats?.effective.hp ?? card.stats.hp, bonus: card.itemStats?.bonus.hp ?? 0 },
                  { key: 'spd', label: 'SPD', cls: 'text-yellow-400', value: card.itemStats?.effective.spd ?? card.stats.spd, bonus: card.itemStats?.bonus.spd ?? 0 },
                  { key: 'mp', label: 'MP', cls: 'text-purple-400', value: card.stats.manaCost, bonus: 0 },
                ] as const
              ).map((stat) => (
                <div key={stat.key} data-card-stat={stat.key} className="bg-gray-700 rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-400">{stat.label}</div>
                  <div className={`text-lg font-bold ${stat.cls}`}>{stat.value}</div>
                  {stat.bonus > 0 && (
                    <div data-card-stat-bonus={stat.key} className="text-[10px] font-bold text-emerald-400">
                      +{stat.bonus}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Phase 25: ช่างใส่ Item (3 ช่อง) + ขายคืนร้านเป็น Veil Shards */}
            <CardItemWorkshop cardId={card.id} onChanged={loadCard} />

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
                <p>ผู้เล่นที่ถือการ์ดใบนี้: {card.ownerCount} คน</p>
                {card.quantity > 0 && <p>ในคลังของคุณ: ×{card.quantity} ใบ</p>}
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

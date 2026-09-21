'use client';

import { CardDefinition } from '@/types';

interface CardRevealModalProps {
  card: CardDefinition;
  isFirstDiscovery: boolean;
  /** ได้การ์ดใบที่ตัวเองมีอยู่แล้ว → มีเพิ่มอีกใบ */
  isDuplicate?: boolean;
  /** จำนวนใบที่ถือครองหลังการค้นหาครั้งนี้ */
  ownedQuantity?: number;
  /** กำลังเพิ่มลงทีมอยู่ */
  addPending?: boolean;
  addMessage?: string | null;
  addError?: string | null;
  onClose: () => void;
  onAddToDeck: () => void;
  onDiscoverAgain: () => void;
}

const elementColors: Record<string, string> = {
  EMBERBOUND: 'from-orange-600 to-red-700',
  TIDEBORN: 'from-blue-500 to-cyan-600',
  SKYRIVEN: 'from-green-400 to-emerald-600',
  ROOTFORGED: 'from-yellow-600 to-amber-700',
  DAWNSWORN: 'from-pink-400 to-purple-600',
  VEILMARKED: 'from-gray-600 to-slate-800',
};

const rarityGlow: Record<string, string> = {
  COMMON: 'shadow-gray-400/50',
  UNCOMMON: 'shadow-green-400/50',
  RARE: 'shadow-blue-400/50',
  EPIC: 'shadow-purple-400/50',
  LEGENDARY: 'shadow-amber-400/50',
  MYTHIC: 'shadow-red-400/50',
};

export default function CardRevealModal({
  card,
  isFirstDiscovery,
  isDuplicate = false,
  ownedQuantity = 1,
  addPending = false,
  addMessage = null,
  addError = null,
  onClose,
  onAddToDeck,
  onDiscoverAgain,
}: CardRevealModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="text-center mb-4 space-y-2">
          {isDuplicate ? (
            <span className="inline-block px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm font-medium">
              ได้ใบซ้ำ! ตอนนี้มี ×{ownedQuantity} ใบ
            </span>
          ) : isFirstDiscovery ? (
            <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium animate-pulse">
              ผู้ค้นพบคนแรก!
            </span>
          ) : (
            <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
              การ์ดที่ถูกค้นพบแล้ว
            </span>
          )}
          {!isDuplicate && ownedQuantity > 0 && (
            <p className="text-xs text-gray-400">มีการ์ดในคลัง ×{ownedQuantity}</p>
          )}
        </div>

        {/* Card Display — การ์ดเต็มใบ (กรอบ/คำบรรยาย/สเตตัสอยู่ในภาพ) */}
        <div className={`relative w-60 h-[343px] mx-auto rounded-xl bg-gradient-to-b ${elementColors[card.element]} shadow-lg ${rarityGlow[card.rarity]} mb-6 overflow-hidden`}>
          {/* Card Image or Placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-contain" />
            ) : (
              <img
                src={`/api/cards/${card.id}/image?v=2`}
                alt={card.nameTh || card.name}
                className="w-full h-full object-contain"
              />
            )}
          </div>
          
          {/* Rarity Badge */}
          <div className="absolute top-2 right-2">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${rarityGlow[card.rarity]} bg-black/50`}>
              {card.rarity}
            </span>
          </div>
        </div>

        {/* Card Info */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-1">
            {card.nameTh || card.name}
          </h2>
          <p className="text-sm text-gray-400 mb-2">{card.name}</p>
          <p className="text-sm text-gray-300">
            {card.element} • {card.role}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          <div className="text-center">
            <p className="text-xs text-gray-400">ATK</p>
            <p className="text-lg font-bold text-red-400">{card.stats.atk}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">DEF</p>
            <p className="text-lg font-bold text-blue-400">{card.stats.def}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">HP</p>
            <p className="text-lg font-bold text-green-400">{card.stats.hp}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">SPD</p>
            <p className="text-lg font-bold text-yellow-400">{card.stats.spd}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400">MP</p>
            <p className="text-lg font-bold text-purple-400">{card.stats.manaCost}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {(addMessage || addError) && (
            <p className={`text-center text-sm ${addError ? 'text-red-400' : 'text-emerald-400'}`}>
              {addError || addMessage}
            </p>
          )}
          <button
            onClick={onAddToDeck}
            disabled={addPending}
            className="btn-primary w-full disabled:opacity-60"
          >
            {addPending ? 'กำลังเพิ่มลงทีม...' : 'เพิ่มลงทีม'}
          </button>
          <button
            onClick={onDiscoverAgain}
            className="btn-secondary w-full"
          >
            ค้นหารูนต่อ
          </button>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm py-2"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

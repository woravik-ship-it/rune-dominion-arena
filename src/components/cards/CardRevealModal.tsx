'use client';

import { CardDefinition } from '@/types';

interface CardRevealModalProps {
  card: CardDefinition;
  isFirstDiscovery: boolean;
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
  onClose,
  onAddToDeck,
  onDiscoverAgain,
}: CardRevealModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="text-center mb-4">
          {isFirstDiscovery ? (
            <span className="inline-block px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium animate-pulse">
              ผู้ค้นพบคนแรก!
            </span>
          ) : (
            <span className="inline-block px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
              การ์ดที่ถูกค้นพบแล้ว
            </span>
          )}
        </div>

        {/* Card Display */}
        <div className={`relative w-48 h-64 mx-auto rounded-xl bg-gradient-to-b ${elementColors[card.element]} shadow-lg ${rarityGlow[card.rarity]} mb-6`}>
          {/* Card Image or Placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            {card.imageUrl ? (
              <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="text-center">
                <span className="text-6xl text-white/30">?</span>
                <p className="text-xs text-white/50 mt-2">กำลังสร้างภาพ...</p>
              </div>
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
          <button
            onClick={onAddToDeck}
            className="btn-primary w-full"
          >
            เพิ่มลงทีม
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

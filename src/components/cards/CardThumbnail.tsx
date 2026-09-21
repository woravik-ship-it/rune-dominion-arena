'use client';

import { useState } from 'react';
import { CardDefinition } from '@/types';

interface CardThumbnailProps {
  card: CardDefinition;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const rarityColors: Record<string, string> = {
  COMMON: 'border-gray-400',
  UNCOMMON: 'border-green-400',
  RARE: 'border-blue-400',
  EPIC: 'border-purple-400',
  LEGENDARY: 'border-amber-400',
  MYTHIC: 'border-red-400',
};

const elementColors: Record<string, string> = {
  EMBERBOUND: 'from-orange-600 to-red-700',
  TIDEBORN: 'from-blue-500 to-cyan-600',
  SKYRIVEN: 'from-green-400 to-emerald-600',
  ROOTFORGED: 'from-yellow-600 to-amber-700',
  DAWNSWORN: 'from-pink-400 to-purple-600',
  VEILMARKED: 'from-gray-600 to-slate-800',
};

export default function CardThumbnail({ card, size = 'md', onClick }: CardThumbnailProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClasses = {
    sm: 'w-16 h-20',
    md: 'w-24 h-32',
    lg: 'w-32 h-44',
  };

  return (
    <div
      onClick={onClick}
      className={`${sizeClasses[size]} relative rounded-lg border-2 ${rarityColors[card.rarity]} bg-gradient-to-b ${elementColors[card.element]} cursor-pointer transition-transform hover:scale-105 overflow-hidden`}
    >
      {/* Card Image — placeholder จาก /api/cards/[id]/image ขณะรอ AI */}
      <div className="absolute inset-0 flex items-center justify-center">
        {!imgFailed ? (
          <img
            src={card.imageUrl || `/api/cards/${card.id}/image`}
            alt={card.nameTh || card.name}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-white/50 text-4xl">?</div>
        )}
      </div>

      {/* Badge กำลังสร้างภาพ (ยังไม่มีภาพ AI จริง) */}
      {!card.imageUrl && (
        <div className="absolute top-1 left-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-md">
          <span className="animate-pulse">⏳</span> กำลังสร้างภาพ
        </div>
      )}
      
      {/* Card Name */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
        <p className="text-xs text-white truncate text-center">
          {card.nameTh || card.name}
        </p>
      </div>
      
      {/* Rarity Indicator */}
      <div className="absolute top-1 right-1">
        <div className={`w-2 h-2 rounded-full ${rarityColors[card.rarity].replace('border', 'bg')}`} />
      </div>
    </div>
  );
}

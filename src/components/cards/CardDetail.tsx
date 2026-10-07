'use client';

/**
 * CardDetail — เนื้อหารายละเอียดการ์ด (ใช้ในป๊อปอัปของหน้าคอลเลคชั่น)
 *
 * 2026-10-07 (ผู้ใช้ติ): *"พอกดดูแล้วกรอบการ์ดมันหาย"*
 * เดิมที่นี่วาดแค่ `<img>` ของ "ภาพ AI" ดิบ ๆ ⇒ ไม่มีกรอบ/ชื่อ/ดาว/สเตตัสของการ์ด
 * แก้: ใช้ `CardFace` ในกล่องสัดส่วน 7:10 เหมือนในกริดคอลเลคชั่น
 * (CardFace = ภาพ AI ในช่องภาพ + เลเยอร์กรอบจาก `/api/cards/:id/image?mode=overlay`
 *  + ชั้นเลื่อม/aura) ⇒ ป๊อปอัปเห็นการ์ดเหมือนในกริดเป๊ะ
 *
 * ⚠️ CardFace ต้องอยู่ในกล่อง `position: relative` + สัดส่วนการ์ด (`aspect-[7/10]`)
 *    ไม่งั้นเลเยอร์ absolute จะสูง 0 แล้วรูป/กรอบหายทั้งหมด
 */
import CardFace from '@/components/cards/CardFace';
import { CardDefinition } from '@/types';

interface CardDetailProps {
  card: CardDefinition;
  onClose?: () => void;
}

const elementNames: Record<string, string> = {
  EMBERBOUND: 'Emberbound (Fire)',
  TIDEBORN: 'Tideborn (Water)',
  SKYRIVEN: 'Skyriven (Wind)',
  ROOTFORGED: 'Rootforged (Earth)',
  DAWNSWORN: 'Dawnsworn (Light)',
  VEILMARKED: 'Veilmarked (Shadow)',
};

const rarityNames: Record<string, string> = {
  COMMON: 'Common',
  UNCOMMON: 'Uncommon',
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary',
  MYTHIC: 'Mythic',
};

/** พื้นหลัง/แสงเรืองตามธาตุ+ความหายาก — ชุดเดียวกับ CardRevealModal ให้การ์ดหน้าตาเดียวกันทั้งเกม */
const elementGradients: Record<string, string> = {
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

export default function CardDetail({ card, onClose }: CardDetailProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {card.nameTh || card.name}
          </h2>
          <p className="text-gray-400 text-sm">{card.name}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        )}
      </div>

      {/* การ์ดเต็มใบ — กรอบ/ชื่อ/ดาว/สเตตัส มาจากเลเยอร์ overlay ของ CardFace
          (ผู้ใช้ติ 2026-10-07: "พอกดดูแล้วกรอบการ์ดมันหาย" — เดิมเป็น <img> ภาพดิบ) */}
      <div
        data-card-face
        className={`relative mx-auto mb-4 aspect-[7/10] w-full max-w-[264px] overflow-hidden rounded-xl bg-gradient-to-b ${
          elementGradients[card.element] ?? 'from-gray-700 to-gray-800'
        } shadow-lg ${rarityGlow[card.rarity] ?? 'shadow-gray-500/40'}`}
      >
        <CardFace
          cardId={card.id}
          imageUrl={card.imageUrl}
          imageStatus={card.imageStatus}
          rarity={card.rarity}
          alt={card.nameTh || card.name}
        />
      </div>

      {/* Info */}
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-400">Element</span>
          <span className="text-white">{elementNames[card.element]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Rarity</span>
          <span className="text-white">{rarityNames[card.rarity]}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Role</span>
          <span className="text-white">{card.role}</span>
        </div>

        {/* Stats */}
        <div className="border-t border-gray-700 pt-3 mt-3">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Stats</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">ATK</span>
              <span className="text-red-400">{card.stats.atk}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">DEF</span>
              <span className="text-blue-400">{card.stats.def}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">HP</span>
              <span className="text-green-400">{card.stats.hp}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">SPD</span>
              <span className="text-yellow-400">{card.stats.spd}</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-gray-400">Mana Cost</span>
              <span className="text-purple-400">{card.stats.manaCost}</span>
            </div>
          </div>
        </div>

        {/* Skills */}
        {card.skills.length > 0 && (
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Skills</h3>
            {card.skills.map((skill, index) => (
              <div key={index} className="mb-2">
                <p className="text-white text-sm font-medium">
                  {skill.name} ({skill.manaCost} Mana)
                </p>
                <p className="text-gray-400 text-xs">{skill.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Lore */}
        {(card.loreTh || card.lore) && (
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Lore</h3>
            <p className="text-gray-400 text-sm italic">
              {card.loreTh || card.lore}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

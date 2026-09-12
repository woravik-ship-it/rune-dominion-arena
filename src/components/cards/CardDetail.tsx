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

      {/* Card Image */}
      <div className="w-full aspect-[3/4] bg-gradient-to-b from-gray-700 to-gray-800 rounded-lg mb-4 flex items-center justify-center">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} className="w-full h-full object-cover rounded-lg" />
        ) : (
          <span className="text-gray-500 text-6xl">?</span>
        )}
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

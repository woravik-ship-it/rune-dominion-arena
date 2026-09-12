// Game Types

export type Element = 'EMBERBOUND' | 'TIDEBORN' | 'SKYRIVEN' | 'ROOTFORGED' | 'DAWNSWORN' | 'VEILMARKED';

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' | 'MYTHIC';

export type CardRole = 'WARRIOR' | 'MAGE' | 'HEALER' | 'TANK' | 'ASSASSIN' | 'SUPPORT';

export interface CardStats {
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost: number;
}

export interface Skill {
  name: string;
  description: string;
  manaCost: number;
}

export interface CardDefinition {
  id: string;
  name: string;
  nameTh?: string;
  description?: string;
  descriptionTh?: string;
  lore?: string;
  loreTh?: string;
  element: Element;
  rarity: Rarity;
  role: CardRole;
  stats: CardStats;
  skills: Skill[];
  imageUrl?: string;
  thumbnailUrl?: string;
}

export interface UserCard {
  id: string;
  card: CardDefinition;
  isFavorite: boolean;
  acquiredAt: Date;
}

export interface Deck {
  id: string;
  name: string;
  cards: DeckSlot[];
  isActive: boolean;
  teamPower: number;
}

export interface DeckSlot {
  position: number;
  lineup: 'FRONTLINE' | 'MIDLINE' | 'BACKLINE';
  card?: CardDefinition;
}

export interface BattleUnit {
  card: CardDefinition;
  currentHp: number;
  maxHp: number;
  currentMana: number;
  statusEffects: StatusEffect[];
  isAlive: boolean;
}

export interface StatusEffect {
  type: 'BURN' | 'SHIELD' | 'HASTE' | 'WEAKEN' | 'HEAL';
  value: number;
  duration: number;
}

export interface BattleResult {
  winner: 'ATTACKER' | 'DEFENDER' | 'DRAW';
  attackerHpRemaining: number;
  defenderHpRemaining: number;
  turnsPlayed: number;
  log: BattleLogEntry[];
}

export interface BattleLogEntry {
  turn: number;
  actorId: string;
  action: string;
  targetId?: string;
  damage?: number;
  healing?: number;
  statusEffects?: StatusEffect[];
}

export interface Wallet {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  discoveryEnergy: number;
  lastEnergyRefill: Date;
}

export interface CoinTransaction {
  id: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  type: string;
  description?: string;
  createdAt: Date;
}

export interface ArenaRoom {
  id: string;
  roomCode: string;
  creator: {
    id: string;
    username: string;
    displayName?: string;
  };
  champion: {
    id: string;
    username: string;
    deck: Deck;
  };
  status: 'UPCOMING' | 'ACTIVE' | 'SETTLING' | 'SETTLED' | 'EXPIRED';
  entryFee: number;
  rewardPool: number;
  currentParticipants: number;
  maxParticipants: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface Quest {
  id: string;
  name: string;
  nameTh: string;
  description?: string;
  descriptionTh?: string;
  type: string;
  targetValue: number;
  rewardAmount: number;
  progress?: QuestProgress;
}

export interface QuestProgress {
  currentValue: number;
  isCompleted: boolean;
  isClaimed: boolean;
}

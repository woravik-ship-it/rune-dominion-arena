// Game Constants

export const ELEMENTS = {
  EMBERBOUND: 'Emberbound',
  TIDEBORN: 'Tideborn',
  SKYRIVEN: 'Skyriven',
  ROOTFORGED: 'Rootforged',
  DAWNSWORN: 'Dawnsworn',
  VEILMARKED: 'Veilmarked',
} as const;

export const RARITIES = {
  COMMON: 'Common',
  UNCOMMON: 'Uncommon',
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary',
  MYTHIC: 'Mythic',
} as const;

export const CARD_ROLES = {
  WARRIOR: 'Warrior',
  MAGE: 'Mage',
  HEALER: 'Healer',
  TANK: 'Tank',
  ASSASSIN: 'Assassin',
  SUPPORT: 'Support',
} as const;

// Discovery
export const DISCOVERY_MIN_RUNES = 8;
export const DISCOVERY_MAX_RUNES = 16;
export const DISCOVERY_ENERGY_COST = 1;
export const DISCOVERY_DAILY_ENERGY = 5;
export const GRID_SIZE = 100;
export const TOTAL_GRID_POINTS = 10000;

// Wallet
export const STARTING_COIN = 100;
export const STARTING_ENERGY = 5;
export const MAX_ENERGY = 10;

// Arena
export const ARENA_CREATE_FEE = 30;
export const ARENA_ENTRY_FEE = 10;
export const ARENA_DURATION_HOURS = 24;
export const ARENA_MAX_PARTICIPANTS = 50;
export const ARENA_BASE_REWARD = 100;
export const ARENA_MAX_REWARD = 500;
export const ARENA_COOLDOWN_MINUTES = 5;
export const ARENA_DAILY_LIMIT = 20;

// Deck
export const DECK_SIZE = 5;
export const MAX_SAME_ELEMENT = 3;

// Battle
export const BATTLE_MAX_TURNS = 30;
export const BATTLE_MANA_START = 0;
export const BATTLE_MANA_PER_TURN = 20;
export const BATTLE_MANA_MAX = 100;

// Element Multipliers
export const ELEMENT_ADVANTAGE = 1.15;
export const ELEMENT_DISADVANTAGE = 0.90;
export const VARIANCE_MIN = 0.95;
export const VARIANCE_MAX = 1.05;

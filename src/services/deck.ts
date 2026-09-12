// Deck Builder Service — Phase 3
// Rules: ทีม 5 ใบ, ห้ามซ้ำ, ธาตุเดียวกัน ≤ 3 ใบ, ต้องเป็นการ์ดที่ตัวเองเป็นเจ้าของ

import { DECK_SIZE, MAX_SAME_ELEMENT } from '@/lib/constants';

export interface DeckCardInput {
  cardId: string;
  element: string;
  atk: number;
  def: number;
  hp: number;
  spd: number;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * ตำแหน่ง Formation: 0,1 = FRONTLINE / 2,3 = MIDLINE / 4 = BACKLINE
 */
export function getLineupForPosition(position: number): 'FRONTLINE' | 'MIDLINE' | 'BACKLINE' {
  if (position <= 1) return 'FRONTLINE';
  if (position <= 3) return 'MIDLINE';
  return 'BACKLINE';
}

/**
 * ตรวจสอบความถูกต้องของเด็ค
 */
export function validateDeck(cards: DeckCardInput[]): DeckValidationResult {
  const errors: string[] = [];

  if (cards.length !== DECK_SIZE) {
    errors.push(`ทีมต้องมีการ์ดครบ ${DECK_SIZE} ใบ (ปัจจุบัน ${cards.length} ใบ)`);
  }

  // ห้ามการ์ดซ้ำ
  const ids = cards.map((c) => c.cardId);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ids.length) {
    errors.push('ห้ามใช้การ์ดใบเดียวกันซ้ำในทีม');
  }

  // ธาตุเดียวกัน ≤ 3 ใบ
  const elementCount: Record<string, number> = {};
  for (const c of cards) {
    elementCount[c.element] = (elementCount[c.element] || 0) + 1;
  }
  for (const [element, count] of Object.entries(elementCount)) {
    if (count > MAX_SAME_ELEMENT) {
      errors.push(`ธาตุ ${element} เกิน ${MAX_SAME_ELEMENT} ใบ (ปัจจุบัน ${count} ใบ)`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * คำนวณ Team Power = ผลรวม (atk + def + hp + spd) ของการ์ดทั้งทีม
 * ใช้ Integer เท่านั้น
 */
export function calculateTeamPower(cards: DeckCardInput[]): number {
  let power = 0;
  for (const c of cards) {
    power += Math.trunc(c.atk) + Math.trunc(c.def) + Math.trunc(c.hp) + Math.trunc(c.spd);
  }
  return power;
}

/**
 * ตรวจสอบ position list สำหรับ DeckSlot
 */
export function validatePositions(positions: number[]): DeckValidationResult {
  const errors: string[] = [];

  if (positions.length !== DECK_SIZE) {
    errors.push(`ต้องมีตำแหน่งครบ ${DECK_SIZE} ตำแหน่ง`);
  }

  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < DECK_SIZE; i++) {
    if (sorted[i] !== i) {
      errors.push('ตำแหน่งต้องเป็น 0–4 ครบทุกช่อง ไม่ซ้ำกัน');
      break;
    }
  }

  for (const p of positions) {
    if (!Number.isInteger(p) || p < 0 || p > 4) {
      errors.push('ตำแหน่งต้องเป็นจำนวนเต็ม 0–4');
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

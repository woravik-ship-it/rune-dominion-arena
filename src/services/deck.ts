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

// ===== Quick Add ("เพิ่มลงทีม" จากหน้าการ์ด) — Phase 13 =====

export type QuickAddPlan =
  | { action: 'already-in-deck'; deckId: string; deckName: string }
  | { action: 'add-to-deck'; deckId: string; deckName: string; position: number; filled: number }
  | { action: 'create-deck'; slots: DeckCardInput[]; filled: number }
  | { action: 'impossible'; reason: string };

/** สร้างทีม 5 ใบที่ผ่านกติกาจากคลังการ์ด โดยบังคับให้มีการ์ดที่เพิ่งได้รวมอยู่ด้วย */
export function buildLegalTeam(owned: DeckCardInput[], mustInclude: DeckCardInput): DeckCardInput[] | null {
  const chosen: DeckCardInput[] = [mustInclude];
  const elementCount: Record<string, number> = { [mustInclude.element]: 1 };
  const usedIds = new Set<string>([mustInclude.cardId]);

  // เรียงการ์ดที่เหลือให้ธาตุที่ใช้ไปแล้วน้อยกว่ามาก่อน → กระจายธาตุได้ดีที่สุด
  const rest = owned
    .filter((c) => !usedIds.has(c.cardId))
    .sort((a, b) => {
      const usedA = elementCount[a.element] ?? 0;
      const usedB = elementCount[b.element] ?? 0;
      if (usedA !== usedB) return usedA - usedB;
      return b.atk + b.def + b.hp - (a.atk + a.def + a.hp);
    });

  for (const card of rest) {
    if (chosen.length >= DECK_SIZE) break;
    const used = elementCount[card.element] ?? 0;
    if (used >= MAX_SAME_ELEMENT) continue;
    chosen.push(card);
    usedIds.add(card.cardId);
    elementCount[card.element] = used + 1;
  }

  return chosen.length === DECK_SIZE ? chosen : null;
}

/**
 * วางแผน "เพิ่มการ์ดลงทีม" แบบ pure (เทสต์ได้ ไม่แตะ DB)
 * ลำดับความสำคัญ: มีในทีมแล้ว → เติมช่องว่างของทีมเดิม → สร้างทีมใหม่ → ทำไม่ได้
 */
export function planQuickAdd(params: {
  card: DeckCardInput;
  decks: Array<{ id: string; name: string; slots: DeckCardInput[]; positions: number[] }>;
  owned: DeckCardInput[];
}): QuickAddPlan {
  const { card, decks, owned } = params;

  for (const deck of decks) {
    if (deck.slots.some((s) => s.cardId === card.cardId)) {
      return { action: 'already-in-deck', deckId: deck.id, deckName: deck.name };
    }
  }

  for (const deck of decks) {
    if (deck.slots.length >= DECK_SIZE) continue;
    const sameElement = deck.slots.filter((s) => s.element === card.element).length;
    if (sameElement >= MAX_SAME_ELEMENT) continue;

    // หาช่องว่างตัวแรกจากตำแหน่งที่ยังไม่ถูกใช้ (0–4)
    const usedPositions = new Set(deck.positions);
    let position = -1;
    for (let i = 0; i < DECK_SIZE; i += 1) {
      if (!usedPositions.has(i)) {
        position = i;
        break;
      }
    }
    if (position < 0) continue;

    return {
      action: 'add-to-deck',
      deckId: deck.id,
      deckName: deck.name,
      position,
      filled: deck.slots.length + 1,
    };
  }

  const team = buildLegalTeam(owned, card);
  if (!team) {
    return {
      action: 'impossible',
      reason: `ต้องมีการ์ดอย่างน้อย ${DECK_SIZE} ใบในธาตุที่ต่างกันพอ (ตอนนี้มีการ์ดที่จัดทีมได้ ${owned.length} ใบ)`,
    };
  }

  return { action: 'create-deck', slots: team, filled: DECK_SIZE };
}

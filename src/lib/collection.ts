/**
 * คอลเลคชั่นการ์ด — ตรรกะบริสุทธิ์ (กรอง · เรียง · สรุปความคืบหน้า)
 *
 * ผู้ใช้สั่ง 2026-10-07: "เอาเมนู คอลเลคชั่นการ์ด กลับมา และทำให้สมบูรณ์กว่าเดิม"
 * — Phase 42 เคยรวมหน้า /cards เข้าหน้าจัดเด็คแล้วเหลือเป็น redirect ⇒ หน้านี้คือของใหม่
 *   ที่แสดง "สมุดสะสมทั้งเกม" (การ์ดทุกใบในเกม รวมใบที่ยังไม่เคยค้นพบ) ไม่ใช่แค่ที่ตัวเองมี
 *
 * แยกตรรกะออกมาเป็น pure function เพื่อให้เทสต์ได้โดยไม่ต้องมี DB/เบราว์เซอร์
 */

export const COLLECTION_TABS = ['all', 'owned', 'missing'] as const;
export type CollectionTab = (typeof COLLECTION_TABS)[number];

export const COLLECTION_SORTS = ['power', 'atk', 'def', 'hp', 'spd', 'rarity', 'newest', 'name'] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];

/** ลำดับระดับความหายาก (ใช้อ้างอิงทั้งการเรียงและการแสดงผล) */
export const RARITY_ORDER: Record<string, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
  MYTHIC: 6,
};

/** ลำดับธาตุ (ให้ตรงกับที่อื่นในเกม: เพลิง → น้ำ → ลม → ดิน → แสง → เงา) */
export const ELEMENT_ORDER: Record<string, number> = {
  EMBERBOUND: 1,
  TIDEBORN: 2,
  SKYRIVEN: 3,
  ROOTFORGED: 4,
  DAWNSWORN: 5,
  VEILMARKED: 6,
};

export interface CollectionStats {
  atk: number;
  def: number;
  hp: number;
  spd: number;
  manaCost: number;
}

export interface CollectionCard {
  cardId: string;
  name: string;
  nameTh: string | null;
  element: string;
  rarity: string;
  role: string | null;
  stats: CollectionStats;
  skills?: Array<{ name: string; description: string; manaCost: number }> | null;
  imageUrl?: string | null;
  imageStatus?: string | null;
  owned: boolean;
  quantity: number;
  isFavorite: boolean;
  obtainedAt?: string | null;
  firstDiscoverer?: string | null;
}

export interface CollectionFilter {
  tab?: CollectionTab;
  element?: string | null;
  rarity?: string | null;
  role?: string | null;
  search?: string | null;
}

export interface CollectionGroup {
  key: string;
  owned: number;
  total: number;
  percent: number;
}

export interface CollectionSummary {
  total: number;
  ownedUnique: number;
  totalCopies: number;
  favorites: number;
  percent: number;
  byElement: CollectionGroup[];
  byRarity: CollectionGroup[];
}

/**
 * พลังการ์ด = atk + def + hp + spd (จำนวนเต็ม)
 * ใช้สูตรเดียวกับ `calculateTeamPower()` ใน services/deck.ts ⇒ ตัวเลขเทียบกันได้ทั้งเกม
 */
export function cardPower(stats: CollectionStats): number {
  return (
    Math.trunc(stats.atk) + Math.trunc(stats.def) + Math.trunc(stats.hp) + Math.trunc(stats.spd)
  );
}

/** ลำดับความหายาก (ค่านอกรายการ = 0 → เรียงไว้ท้ายเมื่อเรียงจากมากไปน้อย) */
export function rarityOrder(rarity: string): number {
  return RARITY_ORDER[rarity] ?? 0;
}

export function elementOrder(element: string): number {
  return ELEMENT_ORDER[element] ?? 99;
}

/** กรองตามแท็บ + ธาตุ + ระดับหายาก + บทบาท + คำค้น (ชื่ออังกฤษ/ไทย) */
export function filterCollection<T extends CollectionCard>(
  rows: readonly T[],
  opts: CollectionFilter = {}
): T[] {
  const { tab = 'all', element, rarity, role, search } = opts;
  const q = (search ?? '').trim().toLowerCase();

  return rows.filter((c) => {
    if (tab === 'owned' && !c.owned) return false;
    if (tab === 'missing' && c.owned) return false;
    if (element && c.element !== element) return false;
    if (rarity && c.rarity !== rarity) return false;
    if (role && (c.role ?? '') !== role) return false;
    if (q) {
      const hay = `${c.name} ${c.nameTh ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/**
 * เรียงการ์ด — ตัวตัดสินรองลงไปใช้ให้ผลนิ่ง (การ์ดใบเดียวกันเรียงเหมือนกันทุกครั้ง):
 *   power/atk/def/hp/spd → มากไปน้อย แล้วต่อด้วย rarity สูง → ชื่อ
 *   rarity → หายากสุดก่อน · newest → ใหม่สุดก่อน (ไม่มีการ์ดใหม่ = ชื่อ) · name → ก-ฮ/ก-ฮ ไทย
 */
export function sortCollection<T extends CollectionCard>(
  rows: readonly T[],
  sort: CollectionSort
): T[] {
  const byName = (a: T, b: T) =>
    (a.nameTh ?? a.name).localeCompare(b.nameTh ?? b.name, 'th') || a.name.localeCompare(b.name);
  const byRarityDesc = (a: T, b: T) => rarityOrder(b.rarity) - rarityOrder(a.rarity);
  const out = [...rows];

  const numDesc = (pick: (c: T) => number) => (a: T, b: T) =>
    pick(b) - pick(a) || byRarityDesc(a, b) || byName(a, b);

  switch (sort) {
    case 'atk':
      return out.sort(numDesc((c) => c.stats.atk));
    case 'def':
      return out.sort(numDesc((c) => c.stats.def));
    case 'hp':
      return out.sort(numDesc((c) => c.stats.hp));
    case 'spd':
      return out.sort(numDesc((c) => c.stats.spd));
    case 'rarity':
      return out.sort((a, b) => byRarityDesc(a, b) || cardPower(b.stats) - cardPower(a.stats) || byName(a, b));
    case 'newest':
      // การ์ดที่ยังไม่เคยได้ (obtainedAt = null) ไปท้ายสุด
      return out.sort((a, b) => {
        if (a.obtainedAt && b.obtainedAt) {
          return b.obtainedAt.localeCompare(a.obtainedAt) || byName(a, b);
        }
        if (a.obtainedAt) return -1;
        if (b.obtainedAt) return 1;
        return byName(a, b);
      });
    case 'name':
      return out.sort(byName);
    case 'power':
    default:
      return out.sort((a, b) => cardPower(b.stats) - cardPower(a.stats) || byRarityDesc(a, b) || byName(a, b));
  }
}

/** สรุปจำนวนที่สะสมได้ เทียบกับทั้งหมด แยกตามคีย์ (ธาตุ/ระดับหายาก) */
function groupProgress(
  rows: readonly CollectionCard[],
  keyOf: (c: CollectionCard) => string,
  orderOf: (key: string) => number
): CollectionGroup[] {
  const map = new Map<string, { owned: number; total: number }>();
  for (const c of rows) {
    const key = keyOf(c);
    const cur = map.get(key) ?? { owned: 0, total: 0 };
    cur.total += 1;
    if (c.owned) cur.owned += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      owned: v.owned,
      total: v.total,
      percent: v.total === 0 ? 0 : Math.round((v.owned / v.total) * 100),
    }))
    .sort((a, b) => orderOf(a.key) - orderOf(b.key));
}

/** สรุปความคืบหน้าของคอลเลคชั่น (ใช้ "การ์ดทั้งเกม" เป็นตัวหาร ไม่ใช่เฉพาะที่กรองอยู่) */
export function collectionSummary(rows: readonly CollectionCard[]): CollectionSummary {
  const total = rows.length;
  const ownedRows = rows.filter((c) => c.owned);
  const ownedUnique = ownedRows.length;
  const totalCopies = ownedRows.reduce((sum, c) => sum + Math.max(0, c.quantity), 0);
  const favorites = ownedRows.filter((c) => c.isFavorite).length;

  return {
    total,
    ownedUnique,
    totalCopies,
    favorites,
    percent: total === 0 ? 0 : Math.round((ownedUnique / total) * 100),
    byElement: groupProgress(rows, (c) => c.element, elementOrder),
    byRarity: groupProgress(rows, (c) => c.rarity, (k) => -rarityOrder(k)),
  };
}

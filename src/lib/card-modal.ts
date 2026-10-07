/**
 * ตรรกะของการเปิด "รายละเอียดการ์ดเป็นป๊อปอัป" ในหน้าคอลเลคชั่น (/cards)
 *
 * ที่มา 2026-10-07 (ผู้ใช้แจ้ง): *"เวลาอยู่หน้า 2 กดกลับคอลเลคชั่น จะกลับไปหน้า 1
 * แก้ให้เป็นดูแบบ Popup พอ จะได้ไม่ต้องกดกลับ"*
 *
 * เดิมการ์ดในกริดเป็น <Link href="/cards/:id"> → เปิดหน้าใหม่ = component ของหน้า
 * คอลเลคชั่นถูก unmount ⇒ page/filter/search หายหมด กลับมาเป็นหน้า 1 เสมอ
 * ⇒ ย้ายมาเปิดเป็น modal (ไม่เปลี่ยน route) แล้วคง state ของรายการไว้
 *
 * ไฟล์นี้เก็บส่วนที่ทดสอบได้ด้วย unit test (ไม่ใช่ JSX) เพื่อไม่ต้องเพิ่ม
 * dependency ของ testing-library เข้าโปรเจกต์
 */
import type { CardDefinition, CardRole, CardStats, Element, Rarity, Skill } from '@/types';

/** รูปร่างของ event ที่ใช้ตัดสิน (MouseEvent ของ React ก็เข้ารูปร่างนี้ได้) */
export interface ClickLike {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented?: boolean;
}

/**
 * สถานะมุมมองของหน้าคอลเลคชั่นที่ต้อง "ติดไปกับ URL"
 * ที่มา 2026-10-07 (ผู้ใช้แจ้งรอบ 2): *"กดเปิดเต็มจอ พอกดกลับคอลเลคชั่น จะกลับไปหน้า 1 อีก
 * แก้ด้วย ให้กลับไปหน้าที่การ์ดที่เปิดดูอยู่"*
 *
 * เดิมสถานะ (หน้า/แท็บ/ตัวกรอง/คำค้น) อยู่ใน useState ล้วน ⇒ พอออกไปหน้ารายละเอียด
 * แล้วกลับมา (ทั้งกดปุ่มกลับ และกด back ของเบราว์เซอร์) component ถูก mount ใหม่จากศูนย์
 * ⇒ ได้หน้า 1 เสมอ · ทำให้ URL พา "มุมมอง" กลับมาได้
 */
export interface CollectionView {
  page?: number;
  tab?: string;
  sort?: string;
  element?: string;
  rarity?: string;
  role?: string;
  search?: string;
}

const DEFAULT_VIEW: Required<CollectionView> = {
  page: 1,
  tab: 'all',
  sort: 'power',
  element: 'ALL',
  rarity: 'ALL',
  role: 'ALL',
  search: '',
};

const KEY_PATTERN = /^[A-Za-z_]{2,24}$/;

/** ประกอบ URL ของหน้าคอลเลคชั่นจากสถานะปัจจุบัน (ตัดค่าที่เป็นค่าเริ่มต้นออก ให้ URL สั้น) */
export function buildCollectionUrl(view: CollectionView): string {
  const params = new URLSearchParams();
  const entries: Array<[keyof CollectionView, string | number | undefined]> = [
    ['page', view.page],
    ['tab', view.tab],
    ['sort', view.sort],
    ['element', view.element],
    ['rarity', view.rarity],
    ['role', view.role],
    ['search', view.search],
  ];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    const str = String(value);
    if (str === '' || str === String(DEFAULT_VIEW[key])) continue;
    params.set(key, str);
  }
  const query = params.toString();
  return query ? `/cards?${query}` : '/cards';
}

/** อ่านสถานะมุมมองจาก query string (ค่าที่ไม่รู้จัก/ผิดรูปจะถูกทิ้ง ไม่ทำให้หน้าพัง) */
export function parseCollectionView(params: URLSearchParams): CollectionView {
  const view: CollectionView = {};
  const page = Number(params.get('page'));
  if (Number.isFinite(page) && page >= 2) view.page = Math.floor(page);
  const tab = params.get('tab');
  if (tab === 'all' || tab === 'owned' || tab === 'missing') view.tab = tab;
  const sort = params.get('sort');
  if (sort && KEY_PATTERN.test(sort) && sort.length > 0) view.sort = sort.toLowerCase();
  for (const key of ['element', 'rarity', 'role'] as const) {
    const raw = params.get(key);
    if (raw && KEY_PATTERN.test(raw)) view[key] = raw.toUpperCase();
  }
  const search = params.get('search');
  if (search) view.search = search.slice(0, 60);
  return view;
}

/**
 * ตรวจค่า `?from=` ที่ส่งต่อมาจากหน้ารายละเอียด — คืน URL ภายในของหน้าคอลเลคชั่น
 * หรือ null ถ้าไม่ปลอดภัย/ไม่ใช่หน้าคอลเลคชั่น (กัน open redirect + กันลิงก์วนไปหน้ารายละเอียด)
 */
export function sanitizeCollectionFrom(from: string | null | undefined): string | null {
  if (!from) return null;
  if (!from.startsWith('/cards')) return null;
  if (from.startsWith('/cards/')) return null;
  const [path, query] = from.split('?');
  if (path !== '/cards') return null;
  if (!query) return '/cards';
  const params = new URLSearchParams(query);
  const allowed = new Set(['page', 'tab', 'sort', 'element', 'rarity', 'role', 'search']);
  for (const key of params.keys()) {
    if (!allowed.has(key)) return null;
  }
  return `/cards?${params.toString()}`;
}

/**
 * true = เปิด modal (คลิกซ้ายธรรมดา/แตะบนมือถือ)
 * false = ปล่อยให้ <Link> ทำงานตามปกติ (ctrl/cmd/shift/Alt คลิก = เปิดแท็บใหม่,
 * ปุ่มกลาง = เปิดแท็บใหม่, หรือมีคน preventDefault ไปแล้ว)
 */
export function shouldOpenDetailInModal(event: ClickLike): boolean {
  if (event.defaultPrevented) return false;
  if ((event.button ?? 0) !== 0) return false;
  return !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * แปลง payload ของ `GET /api/cards/:id` ให้เป็น CardDefinition ของคอมโพเนนต์
 * - API ส่ง `imageUrl: null` ได้ แต่ type ของโปรเจกต์เป็น `string | undefined`
 * - คืน null เมื่อ payload ไม่ใช่การ์ด (กัน modal พังทั้งหน้า)
 */
export function toCardDefinition(raw: unknown): CardDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id);
  const name = text(r.name);
  if (!id || !name) return null;

  const rawStats = (r.stats ?? {}) as Record<string, unknown>;
  const stats: CardStats = {
    atk: number(rawStats.atk),
    def: number(rawStats.def),
    hp: number(rawStats.hp),
    spd: number(rawStats.spd),
    manaCost: number(rawStats.manaCost),
  };

  const rawSkills = Array.isArray(r.skills) ? r.skills : [];
  const skills: Skill[] = rawSkills.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const s = entry as Record<string, unknown>;
    const skillName = text(s.name);
    if (!skillName) return [];
    return [{ name: skillName, description: text(s.description) ?? '', manaCost: number(s.manaCost) }];
  });

  return {
    id,
    name,
    nameTh: text(r.nameTh),
    description: text(r.description),
    descriptionTh: text(r.descriptionTh),
    lore: text(r.lore),
    loreTh: text(r.loreTh),
    element: r.element as Element,
    rarity: r.rarity as Rarity,
    role: r.role as CardRole,
    stats,
    skills,
    imageUrl: text(r.imageUrl),
    imageStatus: text(r.imageStatus),
  };
}

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

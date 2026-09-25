// battle-display.ts — ข้อมูลสำหรับ "แสดงผล" หน้าสนามรบ (pure, ไม่แตะ prisma/DOM)
//
// คำสั่งผู้ใช้ (2026-09-25 รอบ 2):
//   1) "แสดงรูปการ์ดแบบเต็มสิ" → หน้าสนามรบต้องวาดการ์ดเต็มใบ (ต้องมี imageUrl/imageStatus/rarity)
//   2) "ชื่อทีม ใส่ชื่อ Deck ไปเลย" → ชื่อทีมบนหน้าสนามรบใช้ชื่อ Deck จริงของแต่ละฝ่าย
//
// รวมกติกาตรงนี้ที่เดียว เพื่อให้หน้าเว็บ, API และตัวตรวจหน้าจริงใช้ค่าเดียวกัน (และเทสต์ได้โดยไม่ต้อง render)
import { cardArtSrc } from '@/lib/card-image';

export type BattleSide = 'A' | 'B';

/** ข้อมูลการ์ดที่ต้องใช้ "วาดการ์ดเต็มใบ" (มาจาก CardDefinition) */
export interface BattleCardMeta {
  cardId: string;
  imageUrl: string | null;
  imageStatus: string | null;
  rarity: string | null;
}

/** ป้ายสำรองเมื่อไม่มีชื่อ Deck */
export const TEAM_FALLBACK_LABEL: Record<BattleSide, string> = {
  A: 'ทีมของฉัน',
  B: 'คู่ต่อสู้',
};

/** บอทไม่มี Deck จริงในระบบ */
export const BOT_TEAM_NAME = 'บอท (สุ่มการ์ด)';

/** เพดานจำนวนการ์ดต่อทีม (ใช้รวม cardId จาก snapshot ทีม) */
export const BATTLE_TEAM_SIZE = 5;

/**
 * ชื่อทีมที่แสดงบนหน้าสนามรบ — ใช้ชื่อ Deck เป็นหลัก
 * (ผู้ใช้สั่ง: "ชื่อทีม ใส่ชื่อ Deck ไปเลย")
 */
export function teamName(side: BattleSide, deckName?: string | null, isBot = false): string {
  const clean = (deckName ?? '').trim();
  if (clean) return clean;
  if (isBot && side === 'B') return BOT_TEAM_NAME;
  return TEAM_FALLBACK_LABEL[side];
}

/** รวมแถวการ์ดจาก DB → map ตาม cardId (ป้อนให้ <CardFace>) */
export function cardMetaMap(
  rows: { id: string; imageUrl: string | null; imageStatus?: string | null; rarity: string | null }[]
): Record<string, BattleCardMeta> {
  const out: Record<string, BattleCardMeta> = {};
  for (const row of rows) {
    out[row.id] = {
      cardId: row.id,
      imageUrl: row.imageUrl ?? null,
      imageStatus: row.imageStatus ?? null,
      rarity: row.rarity ?? null,
    };
  }
  return out;
}

/** cardId ทั้งหมดที่มีใน snapshot ทีม (A + B) ไม่ซ้ำ — ใช้ query เฉพาะการ์ดที่ต้องแสดงจริง */
export function teamCardIds(teams: { A?: { cardId: string }[]; B?: { cardId: string }[] } | null | undefined): string[] {
  if (!teams) return [];
  const ids = [...(teams.A ?? []), ...(teams.B ?? [])].map((c) => c.cardId);
  return [...new Set(ids.filter(Boolean))];
}

/**
 * การ์ดใบนี้มี "รูปจริง" ให้แสดงหรือยัง
 * ยึดกติกาเดิมของโปรเจกต์ (ห้ามแสดงการ์ดวาดเอง) → ใช้ `cardArtSrc` ตัดสิน
 */
export function hasArt(meta?: BattleCardMeta | null): boolean {
  return Boolean(cardArtSrc(meta?.imageUrl));
}

/**
 * body สำหรับปุ่ม "ต่อสู้อีกครั้ง" (POST /api/battle/simulate)
 * - มีเด็คฝ่าย B → สู้กับเด็คเดิม
 * - ไม่มี (ศึกกับบอท) → bot: true เหมือนเดิม
 * คืน null เมื่อไม่รู้เด็คฝ่าย A (การต่อสู้เก่ามาก/ไม่มี snapshot) → ปุ่มจะถูกปิด
 */
export function refightBody(
  attackerDeckId?: string | null,
  defenderDeckId?: string | null
): { attackerDeckId: string; defenderDeckId?: string; bot?: boolean } | null {
  if (!attackerDeckId) return null;
  if (defenderDeckId) return { attackerDeckId, defenderDeckId };
  return { attackerDeckId, bot: true };
}

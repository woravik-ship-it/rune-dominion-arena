// Dungeon Art Service — Phase 31.1: หา "ภาพจริง" ให้การ์ดศัตรูดันเจี้ยน
//
// แนวคิด (ผู้ใช้สั่งเดิม): การ์ดศัตรูเป็นลูกน้อง+บอสที่กำหนด status เอง **ไม่ Gen รูปใหม่**
//   ⇒ ยืมภาพ AI ของการ์ดจริงในแคตตาล็อก (ธาตุเดียวกับดันนั้น) มาใช้เป็นภาพศัตรู
//     เลือกแบบ deterministic จาก hash ของ "ช่องภาพ" → ดันเดิมได้ภาพเดิมทุกครั้ง ไม่สลับไปมา
//
// ทำไมต้องมีไฟล์นี้: เดิม (Phase 31) log API ชี้ไปที่ /api/dungeons/art/<ชื่อภาพ> ซึ่ง **ไม่มี route นี้อยู่**
//   → ภาพศัตรู 404 ทุกใบ ทำให้หน้าสนามรบฝั่งศัตรูพังทั้งแถว
import { Element } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { findDungeon } from '@/lib/dungeon-definitions';
import { artSlotKey, parseDungeonCardId, pickArtIndex } from '@/lib/dungeon-art';

/** แคชสั้น ๆ กัน query ซ้ำเวลาวาดการ์ด 5 ใบในคำขอเดียว (คลังภาพเปลี่ยนได้เมื่อมี Genesis ใหม่) */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; candidates: string[] }>();

function cacheGet(key: string): string[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.candidates;
}

/**
 * คลังภาพที่ยืมได้: การ์ดจริงที่ "ภาพพร้อมใช้" (READY) และธาตุตรงกับธีมดัน
 * ถ้าไม่มีเลย → ใช้การ์ด READY ใบใดก็ได้ (ดีกว่าแสดงภาพพัง)
 */
async function artPool(elements: string[]): Promise<string[]> {
  const rows = await prisma.cardDefinition.findMany({
    where: { imageStatus: 'READY', element: { in: elements as Element[] } },
    select: { id: true, canonicalSeedHash: true },
    orderBy: { canonicalSeedHash: 'asc' },
  });
  if (rows.length > 0) return rows.map((row) => row.id);
  const any = await prisma.cardDefinition.findMany({
    where: { imageStatus: 'READY' },
    select: { id: true, canonicalSeedHash: true },
    orderBy: { canonicalSeedHash: 'asc' },
  });
  return any.map((row) => row.id);
}

/**
 * รายชื่อการ์ดจริงที่ใช้ "ยืมภาพ" ให้การ์ดศัตรูใบนี้ เรียงตามลำดับที่ควรลอง
 * (ลำดับแรกคือใบที่เลือกไว้ · ถ้าไฟล์ภาพของใบนั้นหาย จะลองใบถัดไป)
 * คืน [] เมื่อรหัสไม่ใช่การ์ดดันเจี้ยน/ไม่พบดัน
 */
export async function dungeonArtCandidates(cardId: string): Promise<string[]> {
  const ref = parseDungeonCardId(cardId);
  if (!ref) return [];
  const dungeon = findDungeon(ref.dungeonCode);
  if (!dungeon) return [];

  const key = artSlotKey(dungeon.code, ref.kind, ref.index);
  const cached = cacheGet(key);
  if (cached) return cached;

  const pool = await artPool(dungeon.elements);
  if (pool.length === 0) {
    cache.set(key, { at: Date.now(), candidates: [] });
    return [];
  }
  const start = pickArtIndex(key, pool.length);
  const ordered = [...pool.slice(start), ...pool.slice(0, start)];
  cache.set(key, { at: Date.now(), candidates: ordered });
  return ordered;
}

/** การ์ดจริงใบแรกที่ใช้เป็นภาพของศัตรูใบนี้ (null = หาไม่ได้) */
export async function dungeonArtCardId(cardId: string): Promise<string | null> {
  const candidates = await dungeonArtCandidates(cardId);
  return candidates[0] ?? null;
}

/** ล้างแคช (ใช้ในเทสต์/สคริปต์ตรวจของจริงเมื่อเพิ่ง Gen ภาพใหม่) */
export function clearDungeonArtCache(): void {
  cache.clear();
}

// Arena Service — Phase 6 (ห้อง 24 ชม.)
// เปิดห้อง 30 Coin / เข้าร่วม 10 Coin / รางวัล min(100 + n×5, 500)
import {
  ARENA_BASE_REWARD,
  ARENA_CREATE_FEE,
  ARENA_ENTRY_FEE,
  ARENA_MAX_REWARD,
  ARENA_DURATION_HOURS,
  ARENA_DAILY_LIMIT,
  ARENA_COOLDOWN_MINUTES,
} from '@/lib/constants';

export const ARENA_CREATE_COST = ARENA_CREATE_FEE;
export const ARENA_JOIN_COST = ARENA_ENTRY_FEE;
export const ARENA_DURATION_MS = ARENA_DURATION_HOURS * 60 * 60 * 1000;
export const ARENA_JOIN_DAILY_LIMIT = ARENA_DAILY_LIMIT;
export { ARENA_COOLDOWN_MINUTES };

/** รางวัลสุดท้ายตามจำนวนผู้เข้าร่วม (เพดานตาม GDD) */
export function calculateArenaReward(participantCount: number): number {
  const n = Math.max(0, Math.trunc(participantCount));
  return Math.min(ARENA_BASE_REWARD + n * 5, ARENA_MAX_REWARD);
}

/** เวลาหมดอายุของห้อง (24 ชม. หลังสร้าง) */
export function arenaExpiryFrom(start: Date): Date {
  return new Date(start.getTime() + ARENA_DURATION_MS);
}

/** ห้องหมดอายุหรือยัง (ใช้เวลา server-side) */
export function isArenaExpired(expiresAt: Date | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  return now.getTime() >= expiresAt.getTime();
}

const PROFANITY = [
  // อังกฤษ
  'fuck', 'shit', 'bitch', 'asshole', 'damn',
  // ไทย
  'ควย', 'เหี้ย', 'สัด', 'เงี่ยน', 'ส้นตีน', 'ไอ้เวร', 'ไอ้สัด',
];

export function validateRoomName(name: string): { valid: boolean; error?: string } {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return { valid: false, error: 'ต้องระบุชื่อห้อง' };
  }
  if (name.trim().length > 60) {
    return { valid: false, error: 'ชื่อห้องยาวเกิน 60 ตัวอักษร' };
  }
  const lower = name.toLowerCase();
  if (PROFANITY.some((w) => lower.includes(w))) {
    return { valid: false, error: 'ชื่อห้องมีคำไม่เหมาะสม' };
  }
  return { valid: true };
}

/**
 * จำนวน Coin ที่ต้องจ่ายตอนเข้าร่วม/เปลี่ยนทีมในห้อง
 * (ผู้ใช้สั่ง 2026-09-25: "การเพิ่มทีมเข้ามาในห้อง เก็บค่าเข้า จะจัดเข้ามากี่ครั้งก็ได้")
 */
export const ARENA_JOIN_RECHARGE_NOTE = 'เข้าได้หลายครั้ง — คิดค่าเข้าทุกครั้งที่ส่งทีมเข้าห้อง';

/** Type ของ wallet transaction ที่ใช้ระบุ "จ่ายค่าเข้าห้อง Arena" (ใช้COUNT เพดานรายวัน) */
export const ARENA_JOIN_REFERENCE_TYPE = 'ARENA_JOIN';

export interface ArenaJoinPlan {
  /** ต้องหัก Coin ค่าเข้าไหม */
  charge: boolean;
  /** create = เข้าครั้งแรก · update = ส่งทีมเข้าซ้ำ (เปลี่ยนเด็ค) · skip = คำขอเดิมยิงซ้ำ (idempotent) */
  mode: 'create' | 'update' | 'skip';
  /** Coin ที่ต้องหัก (0 เมื่อ skip) */
  cost: number;
}

/**
 * แผนการเข้าร่วมห้อง Arena
 * - เข้าครั้งแรก → หักค่าเข้า + สร้างแถวผู้เข้าร่วม
 * - ส่งทีมเข้าซ้ำ → **หักค่าเข้าใหม่** + อัปเดตเด็คของผู้เข้าร่วมเดิม
 *   (ไม่สร้างแถวซ้ำ เพราะมี @@unique([roomId, userId]) และผู้เข้าร่วมต้องไม่ถูกนับซ้ำ)
 * - idempotencyKey เดิมยิงซ้ำ (เช่น เน็ตสะดุดแล้วกดใหม่) → ไม่หักซ้ำ ไม่แตะข้อมูล
 */
export function arenaJoinPlan(opts: {
  alreadyJoined: boolean;
  idempotentDuplicate?: boolean;
}): ArenaJoinPlan {
  if (opts.idempotentDuplicate) return { charge: false, mode: 'skip', cost: 0 };
  return {
    charge: true,
    mode: opts.alreadyJoined ? 'update' : 'create',
    cost: ARENA_JOIN_COST,
  };
}

/** ข้อความแจ้งผลหลังเข้าห้อง (ใช้ทั้งหน้าเว็บและเทสต์) */
export function arenaJoinMessage(deckName: string, rejoined: boolean, cost: number): string {
  return rejoined
    ? `เปลี่ยนทีมเป็น "${deckName}" แล้ว — หัก ${cost} Coin (เข้าได้หลายครั้ง คิดค่าเข้าทุกครั้ง)`
    : `เข้าร่วมด้วยทีม "${deckName}" แล้ว — หัก ${cost} Coin`;
}

/** นับจำนวนครั้งที่ join วันนี้ (ใช้กรอง daily cap 20 ครั้ง) */
export function countTodayJoins(
  joinedAtList: Date[],
  now: Date = new Date()
): number {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return joinedAtList.filter((d) => d.getTime() >= startOfDay.getTime()).length;
}

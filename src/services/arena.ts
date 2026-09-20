// Arena Service — Phase 6 (ห้อง 24 ชม.)
// เปิดห้อง 30 Coin / เข้าร่วม 10 Coin / รางวัล min(100 + n×5, 500)
import {
  ARENA_BASE_REWARD,
  ARENA_CREATE_FEE,
  ARENA_ENTRY_FEE,
  ARENA_MAX_REWARD,
  ARENA_DURATION_HOURS,
  ARENA_DAILY_LIMIT,
} from '@/lib/constants';

export const ARENA_CREATE_COST = ARENA_CREATE_FEE;
export const ARENA_JOIN_COST = ARENA_ENTRY_FEE;
export const ARENA_DURATION_MS = ARENA_DURATION_HOURS * 60 * 60 * 1000;
export const ARENA_JOIN_DAILY_LIMIT = ARENA_DAILY_LIMIT;

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

/** นับจำนวนครั้งที่ join วันนี้ (ใช้กรอง daily cap 20 ครั้ง) */
export function countTodayJoins(
  joinedAtList: Date[],
  now: Date = new Date()
): number {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  return joinedAtList.filter((d) => d.getTime() >= startOfDay.getTime()).length;
}

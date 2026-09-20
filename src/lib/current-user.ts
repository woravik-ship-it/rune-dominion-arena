// Identity ของผู้ใช้สำหรับ API — Phase 11 fix: ยึด session cookie เป็นหลัก
// เดิมทุกหน้าเว็บส่ง userId='temp-user' แบบ hardcode (mock ของ Phase 0)
// ทำให้หลังเปิดใช้ auth จริงทุก API ตอบ "ไม่พบผู้ใช้"
//
// ลำดับการได้ identity:
//   1. session cookie (เชื่อถือได้ที่สุด — client ปลอมไม่ได้)
//   2. param ที่ส่งมา (สำหรับ CLI/worker/เทสต์/แอดมินดูแลผู้ใช้)
//   3. env USER_ID_FALLBACK (โหมด dev เท่านั้น — ใช้เมื่อยังไม่ล็อกอิน)
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionUserId } from '@/lib/request-context';

const CUID_RE = /^c[a-z0-9]+$/i;

/** resolve ค่าที่เป็นได้ทั้ง userId (cuid) และ username → คืน id จริงหรือ null */
export async function resolveUserId(param: string): Promise<string | null> {
  if (!param) return null;
  if (CUID_RE.test(param)) {
    const byId = await prisma.user.findUnique({ where: { id: param }, select: { id: true } });
    if (byId) return byId.id;
  }
  const byName = await prisma.user.findUnique({
    where: { username: param },
    select: { id: true },
  });
  return byName?.id ?? null;
}

/**
 * userId สำหรับ request นี้ — session มาก่อนเสมอ แล้วจึง param/fallback
 * ค่า sentinel 'temp-user' (mock เก่า) จะถูกข้ามไป ไม่ให้หลุดเป็น 404
 */
export async function resolveRequestUserId(
  request: NextRequest,
  param?: string | null
): Promise<string | null> {
  const sessionUserId = getSessionUserId(request);
  if (sessionUserId) return sessionUserId;

  const cleaned = param && param !== 'temp-user' ? param : null;
  if (cleaned) return resolveUserId(cleaned);

  const fallback = process.env.USER_ID_FALLBACK;
  if (fallback && process.env.NODE_ENV !== 'production') {
    return resolveUserId(fallback);
  }
  return null;
}

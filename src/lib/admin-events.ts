// Admin Events — ตัวช่วยที่ใช้ร่วมกันระหว่าง route ของ admin events
// (Phase 45, 2026-10-07: เดิมสองตัวนี้ถูก export จาก src/app/api/admin/events/route.ts
//  ซึ่ง Next.js ไม่ยอม — ไฟล์ route ส่งออกได้แค่ HTTP method + ค่าคอนฟิกของ route เท่านั้น
//  `next build` จึงล้มด้วย "requireAdmin is not a valid Route export field" ⇒ ย้ายมาไว้ที่ lib)
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, type SessionPayload } from '@/lib/session';

type AdminGuard =
  | { session: SessionPayload; response?: undefined }
  | { session?: undefined; response: NextResponse };

/** ตรวจสิทธิ์ admin — แยก 401 (ยังไม่ล็อกอิน) กับ 403 (ล็อกอินแล้วแต่ไม่ใช่ผู้ดูแล) */
export function requireAdmin(request: NextRequest): AdminGuard {
  const session = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return { response: NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 }) };
  }
  if (session.role !== 'ADMIN' && session.role !== 'MODERATOR') {
    return { response: NextResponse.json({ error: 'ต้องเป็นผู้ดูแลระบบ' }, { status: 403 }) };
  }
  return { session };
}

interface AdminEventRow {
  id: string;
  name: string;
  nameTh: string;
  description: string | null;
  descriptionTh: string | null;
  eventType: string;
  status: string;
  startDate: Date;
  endDate: Date;
  gracePeriodEnd: Date | null;
  currencyName: string;
  maxCurrency: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** แปลง Event เป็น payload ที่หน้า admin ใช้ (มี participantCount/questCount/bossCount) */
export function mapAdminEvent(
  e: AdminEventRow,
  counts?: { participantCount: number; questCount: number; bossCount: number }
) {
  return {
    id: e.id,
    name: e.name,
    nameTh: e.nameTh,
    description: e.description,
    descriptionTh: e.descriptionTh,
    eventType: e.eventType,
    status: e.status,
    startDate: e.startDate,
    endDate: e.endDate,
    gracePeriodEnd: e.gracePeriodEnd,
    currencyName: e.currencyName,
    maxCurrency: e.maxCurrency,
    isActive: e.isActive,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    participantCount: counts?.participantCount ?? 0,
    questCount: counts?.questCount ?? 0,
    bossCount: counts?.bossCount ?? 0,
  };
}

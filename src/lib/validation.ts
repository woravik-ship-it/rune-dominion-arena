// Input Validation (Zod) — Phase 10
// ทุก API ที่รับ body ต้อง parse ผ่าน schema ก่อนใช้ข้อมูล
// หลักการ: ไม่เชื่อข้อมูลใดๆ จาก client (GDD §20)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import {
  DISCOVERY_MAX_RUNES,
  DISCOVERY_MIN_RUNES,
  TOTAL_GRID_POINTS,
} from '@/lib/constants';

// ===== ชนิดข้อมูลกลาง =====

// userId เป็น optional ได้ — API ยึด session cookie เป็นหลักแล้ว (Phase 11)
// ถ้าส่งมา (CLI/เทสต์/admin) จะถูกใช้เป็น fallback เท่านั้น
export const userIdSchema = z
  .string()
  .min(1, 'ต้องระบุ userId')
  .max(100, 'userId ยาวเกินไป')
  .optional();

export const idempotencyKeySchema = z.string().min(1).max(100).optional();

// ===== Auth =====

export const loginSchema = z.object({
  identifier: z.string().min(1, 'ต้องระบุชื่อผู้ใช้/อีเมล').max(200),
  password: z.string().min(1, 'ต้องระบุรหัสผ่าน').max(200),
});

export const registerSchema = z.object({
  username: z
    .string()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, 'ชื่อผู้ใช้ต้องเป็นภาษาอังกฤษ/ตัวเลข/ขีดล่าง 3-20 ตัวอักษร'),
  email: z.string().email('รูปแบบอีเมลไม่ถูกต้อง').max(200),
  password: z.string().min(8, 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร').max(128),
  displayName: z.string().trim().max(60).optional(),
});

// ===== Discovery =====

export const discoverSchema = z.object({
  runes: z
    .array(z.number().int().min(0).max(TOTAL_GRID_POINTS - 1))
    .min(DISCOVERY_MIN_RUNES, `ต้องเลือกรูนอย่างน้อย ${DISCOVERY_MIN_RUNES} จุด`)
    .max(DISCOVERY_MAX_RUNES, `เลือกรูนได้ไม่เกิน ${DISCOVERY_MAX_RUNES} จุด`),
  userId: userIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

// ===== Battle =====

export const battleSimulateSchema = z.object({
  userId: userIdSchema,
  attackerDeckId: z.string().min(1, 'ต้องระบุ attackerDeckId'),
  defenderDeckId: z.string().min(1).optional(),
  bot: z.boolean().optional(),
});

// ===== Arena =====

export const arenaCreateSchema = z.object({
  userId: userIdSchema,
  name: z.string().trim().min(1, 'ต้องระบุชื่อห้อง').max(60, 'ชื่อห้องยาวเกิน 60 ตัวอักษร'),
  deckId: z.string().min(1, 'ต้องระบุ deckId (ทีมป้องกัน)'),
  idempotencyKey: idempotencyKeySchema,
});

export const arenaChallengeSchema = z.object({
  userId: userIdSchema,
  deckId: z.string().min(1, 'ต้องระบุ deckId'),
  idempotencyKey: idempotencyKeySchema,
});

// ===== Quest / Wallet =====

export const questClaimSchema = z.object({
  userId: userIdSchema,
});

// ===== Deck =====

export const deckCreateSchema = z.object({
  userId: userIdSchema,
  name: z.string().trim().min(1, 'ต้องระบุชื่อเด็ค').max(60, 'ชื่อเด็คยาวเกิน 60 ตัวอักษร'),
  description: z.string().max(500).optional(),
  slots: z
    .array(
      z.object({
        cardId: z.string().min(1),
        position: z.number().int().min(0).max(4),
      })
    )
    .min(1, 'ต้องระบุ slots เป็น array'),
});

// ===== Card Favorite =====

export const cardFavoriteSchema = z.object({
  userId: userIdSchema,
  cardId: z.string().min(1, 'ต้องระบุ cardId'),
  isFavorite: z.boolean(),
});

// ===== Admin Events (Phase 44) =====
// ผู้ใช้สั่ง 2026-10-07: เพิ่มหน้าจัดการ Events ใน admin (API + UI)
// หลักการ: ค่าเริ่มต้น isActive = false เสมอ — ห้ามเปิดกิจกรรมให้ผู้เล่นจริงโดยไม่ตั้งใจ

export const EVENT_TYPES = ['SEASONAL', 'WEEKLY', 'SPECIAL', 'COMMUNITY'] as const;
export const EVENT_STATUSES = ['UPCOMING', 'ACTIVE', 'GRACE_PERIOD', 'ENDED'] as const;
export type EventTypeValue = (typeof EVENT_TYPES)[number];
export type EventStatusValue = (typeof EVENT_STATUSES)[number];

/** วันที่รับเป็น ISO string — ต้องตีความเป็นเวลาได้จริง */
const eventDateSchema = z
  .string()
  .min(1, 'ต้องระบุวันที่')
  .refine((s) => !Number.isNaN(Date.parse(s)), 'รูปแบบวันที่ไม่ถูกต้อง');

export interface EventWindowInput {
  startDate: string | Date;
  endDate: string | Date;
  gracePeriodEnd?: string | Date | null;
}

/**
 * ตรวจความถูกต้องของช่วงเวลากิจกรรม (pure function — เทสต์ได้)
 * คืนข้อความไทยเมื่อไม่ผ่าน หรือ null เมื่อถูกต้อง
 * กติกา: endDate ต้องอยู่หลัง startDate และ gracePeriodEnd (ถ้ามี) ต้องไม่ก่อน endDate
 */
export function validateEventWindow(win: EventWindowInput): string | null {
  const start = new Date(win.startDate).getTime();
  const end = new Date(win.endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 'รูปแบบวันที่ไม่ถูกต้อง';
  if (end <= start) return 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม';
  if (win.gracePeriodEnd) {
    const grace = new Date(win.gracePeriodEnd).getTime();
    if (Number.isNaN(grace)) return 'รูปแบบวันที่ไม่ถูกต้อง';
    if (grace < end) return 'gracePeriodEnd ต้องไม่ก่อนเวลาสิ้นสุด';
  }
  return null;
}

/** ใช้ validateEventWindow ผ่าน Zod superRefine (แนบ issue ที่ endDate) */
function eventWindowRefine(val: EventWindowInput, ctx: z.RefinementCtx): void {
  const msg = validateEventWindow(val);
  if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: msg });
}

export const eventAdminCreateSchema = z
  .object({
    name: z.string().trim().min(1, 'ต้องระบุชื่อกิจกรรม (อังกฤษ)').max(120, 'ชื่อยาวเกินไป'),
    nameTh: z.string().trim().min(1, 'ต้องระบุชื่อกิจกรรม (ไทย)').max(120, 'ชื่อยาวเกินไป'),
    description: z.string().trim().max(1000, 'คำอธิบายยาวเกินไป').optional(),
    descriptionTh: z.string().trim().max(1000, 'คำอธิบายยาวเกินไป').optional(),
    eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: 'ชนิดกิจกรรมไม่ถูกต้อง' }) }),
    status: z.enum(EVENT_STATUSES, { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) }).optional(),
    startDate: eventDateSchema,
    endDate: eventDateSchema,
    gracePeriodEnd: eventDateSchema.optional(),
    currencyName: z.string().trim().min(1, 'ต้องระบุชื่อสกุลรางวัล').max(60, 'ชื่อยาวเกินไป'),
    maxCurrency: z.number().int('ต้องเป็นจำนวนเต็ม').min(0, 'ต้องไม่ติดลบ').optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(eventWindowRefine);

/** PATCH รองรับการแก้บางฟิลด์ (partial) รวมถึงปุ่มเปิด/ปิด (isActive) */
export const eventAdminUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'ชื่อต้องไม่ว่าง').max(120, 'ชื่อยาวเกินไป').optional(),
    nameTh: z.string().trim().min(1, 'ชื่อต้องไม่ว่าง').max(120, 'ชื่อยาวเกินไป').optional(),
    description: z.string().trim().max(1000, 'คำอธิบายยาวเกินไป').optional(),
    descriptionTh: z.string().trim().max(1000, 'คำอธิบายยาวเกินไป').optional(),
    eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: 'ชนิดกิจกรรมไม่ถูกต้อง' }) }).optional(),
    status: z.enum(EVENT_STATUSES, { errorMap: () => ({ message: 'สถานะไม่ถูกต้อง' }) }).optional(),
    startDate: eventDateSchema.optional(),
    endDate: eventDateSchema.optional(),
    gracePeriodEnd: eventDateSchema.nullable().optional(),
    currencyName: z.string().trim().min(1, 'ชื่อต้องไม่ว่าง').max(60, 'ชื่อยาวเกินไป').optional(),
    maxCurrency: z.number().int('ต้องเป็นจำนวนเต็ม').min(0, 'ต้องไม่ติดลบ').nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'ต้องระบุข้อมูลที่จะแก้ไขอย่างน้อย 1 ฟิลด์' });

// ===== Helper =====

/**
 * ผลของ parseJsonBody — discriminated union เพื่อให้ TypeScript narrow ค่า data ได้:
 * `const { data, errorResponse } = await parseJsonBody(...); if (errorResponse) return errorResponse;`
 * → หลังจากบรรทัดนั้น `data` ถูก narrow เป็น T (ไม่ undefined)
 */
export type ParseResult<T> =
  | { data: T; errorResponse?: undefined }
  | { data?: undefined; errorResponse: NextResponse };

/** อ่าน JSON body + ตรวจ schema — ไม่ผ่านคืน errorResponse (400) พร้อมข้อความไทย */
export async function parseJsonBody<T>(
  request: NextRequest,
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      errorResponse: NextResponse.json(
        { error: 'รูปแบบ JSON ไม่ถูกต้อง' },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') || 'body';
    return {
      errorResponse: NextResponse.json(
        { error: `ข้อมูลไม่ถูกต้อง (${path}: ${issue?.message ?? 'ไม่ผ่านการตรวจ'})` },
        { status: 400 }
      ),
    };
  }

  return { data: parsed.data };
}

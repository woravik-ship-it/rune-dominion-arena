// ค่าที่ผู้เล่นเลือกเรื่องการแจ้งเตือน (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ทำระบบแจ้งเตือนต่างๆ … สำหรับของแต่ละ User"
// ⇒ ผู้เล่นเลือกได้เองว่าอยากรับการแจ้งเตือนประเภทใด (เก็บใน User.notifyPrefs เป็น JSON)
//
// ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน (ไม่แตะ DB) เพื่อให้เทสต์ได้ตรง ๆ
export interface NotifyPrefs {
  image: boolean;
  battle: boolean;
  arena: boolean;
  event: boolean;
  announcement: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = Object.freeze({
  image: true,
  battle: true,
  arena: true,
  event: true,
  announcement: true,
});

/** ประเภทการแจ้งเตือนที่ระบบรู้จัก → ตรงกับ enum NotificationType ใน Prisma */
export type NotificationKind =
  | 'IMAGE_READY'
  | 'IMAGE_FAILED'
  | 'BATTLE_RESULT'
  | 'ARENA_RESULT'
  | 'EVENT'
  | 'ANNOUNCEMENT'
  | 'SYSTEM';

const KIND_TO_PREF: Record<NotificationKind, keyof NotifyPrefs | null> = {
  IMAGE_READY: 'image',
  IMAGE_FAILED: 'image',
  BATTLE_RESULT: 'battle',
  ARENA_RESULT: 'arena',
  EVENT: 'event',
  ANNOUNCEMENT: 'announcement',
  // ข้อความจากระบบ (เช่น บัญชี/ความปลอดภัย) ปิดไม่ได้
  SYSTEM: null,
};

/** อ่านค่า JSON จาก DB → ค่าที่ใช้ได้จริง (ค่าเพี้ยน/ไม่มี → ใช้ค่าเริ่มต้น) */
export function parseNotifyPrefs(raw: unknown): NotifyPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_NOTIFY_PREFS };
  const source = raw as Record<string, unknown>;
  const out: NotifyPrefs = { ...DEFAULT_NOTIFY_PREFS };
  for (const key of Object.keys(DEFAULT_NOTIFY_PREFS) as (keyof NotifyPrefs)[]) {
    const value = source[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** ทำเป็น JSON ที่เก็บลง DB ได้ (ตรวจค่าให้ก่อน) */
export function serializeNotifyPrefs(patch: Partial<NotifyPrefs>, base?: unknown): NotifyPrefs {
  return parseNotifyPrefs({ ...parseNotifyPrefs(base), ...patch });
}

/** ผู้เล่นรายนี้ต้องการรับการแจ้งเตือนประเภทนี้ไหม */
export function wantsNotification(prefs: NotifyPrefs | null | undefined, kind: NotificationKind): boolean {
  const prefKey = KIND_TO_PREF[kind];
  if (!prefKey) return true;
  return parseNotifyPrefs(prefs)[prefKey];
}

/** ตัวเลือกทั้งหมดสำหรับหน้าตั้งค่า (เรียงตามที่แสดงในเมนู) */
export const NOTIFY_PREF_OPTIONS: readonly { key: keyof NotifyPrefs; kind: NotificationKind }[] = [
  { key: 'image', kind: 'IMAGE_READY' },
  { key: 'battle', kind: 'BATTLE_RESULT' },
  { key: 'arena', kind: 'ARENA_RESULT' },
  { key: 'event', kind: 'EVENT' },
  { key: 'announcement', kind: 'ANNOUNCEMENT' },
];

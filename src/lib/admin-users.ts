// กติกาการจัดการผู้เล่นของแอดมิน (Phase 29)
//
// ผู้ใช้สั่ง 2026-09-27: "เมนูสำหรับจัดการผู้เล่น หรือกำหนดสิทธิ์ผู้เล่น แบนผู้เล่น หรือลบผู้เล่น"
//  - กำหนดสิทธิ์ (PLAYER/MODERATOR/ADMIN) · แบน/ปลดแบน (User.isActive) · ลบผู้เล่น
//  - กติกาความปลอดภัยทั้งหมดอยู่ในฟังก์ชันบริสุทธิ์นี้ ⇒ เทสต์ได้ และฝั่งเซิร์ฟเวอร์เป็นผู้ตัดสินจริง
//    (UI ใช้กติกาชุดเดียวกันแค่เพื่อซ่อนปุ่มที่กดไม่ได้)
import type { UserRole } from '@prisma/client';

export const ADMIN_ROLES: UserRole[] = ['PLAYER', 'MODERATOR', 'ADMIN'];

export type ManagedAction = 'changeRole' | 'ban' | 'unban' | 'delete';

export const ACTION_LABEL_TH: Record<ManagedAction, string> = {
  changeRole: 'เปลี่ยนสิทธิ์',
  ban: 'แบนผู้เล่น',
  unban: 'ปลดแบน',
  delete: 'ลบผู้เล่น',
};

export const ROLE_LABEL_TH: Record<UserRole, string> = {
  PLAYER: 'ผู้เล่น',
  MODERATOR: 'ผู้ดูแล',
  ADMIN: 'แอดมิน',
};

/** ตรวจว่าเป็นสิทธิ์ที่เกมรู้จักไหม (ค่าอื่น → null) */
export function normalizeAdminRole(value: unknown): UserRole | null {
  return typeof value === 'string' && (ADMIN_ROLES as string[]).includes(value)
    ? (value as UserRole)
    : null;
}

/** ใครเป็น "แอดมิน" (ใช้ตัดสินสิทธิ์การจัดการ) */
export function isAdminRole(role: unknown): boolean {
  return role === 'ADMIN';
}

/** ใครช่วยดูแลระบบได้ (แอดมิน + ผู้ดูแล) */
export function isStaffRole(role: unknown): boolean {
  return role === 'ADMIN' || role === 'MODERATOR';
}

export interface ManageCheckInput {
  actorId: string;
  actorRole: unknown;
  targetId: string;
  targetRole: unknown;
  action: ManagedAction;
  /** สิทธิ์ใหม่ (เฉพาะ changeRole) */
  nextRole?: unknown;
}

export interface ManageCheckResult {
  ok: boolean;
  /** เหตุผลที่ปฏิเสธ (ภาษาไทย — ส่งกลับผู้ใช้ได้เลย) */
  reason?: string;
}

/**
 * ความสามารถระดับเจ้าหน้าที่ (Phase 30)
 *
 * ผู้ใช้สั่ง 2026-09-27: "ห้ามแตะเรื่องการ์ด เช่น Gen รูปใหม่"
 * ⇒ ผู้ดูแล (MODERATOR) ห้ามแก้ข้อมูลการ์ด/สั่งสร้างภาพใหม่ (ดูได้อย่างเดียว)
 *    ส่วนการแบน/ปลดแบนผู้เล่นยังทำได้ (Phase 29)
 */
export type StaffAbility =
  | 'cardEdit'
  | 'cardRegenerate'
  | 'imageProcess'
  | 'imageRequeue'
  | 'userBan'
  | 'userRoleChange'
  | 'userDelete'
  | 'announcement';

export const ABILITY_LABEL_TH: Record<StaffAbility, string> = {
  cardEdit: 'แก้ไขข้อมูลการ์ด',
  cardRegenerate: 'สั่งสร้างภาพการ์ดใหม่',
  imageProcess: 'ประมวลผลคิวภาพการ์ด',
  imageRequeue: 'Requeue ภาพการ์ด',
  userBan: 'แบน/ปลดแบนผู้เล่น',
  userRoleChange: 'กำหนดสิทธิ์ผู้เล่น',
  userDelete: 'ลบผู้เล่น',
  announcement: 'ประกาศจากทีมงาน',
};

/** ความสามารถที่ "แอดมินเท่านั้น" (ผู้ดูแลดูได้แต่แตะไม่ได้) */
export const ADMIN_ONLY_ABILITIES: StaffAbility[] = [
  'cardEdit',
  'cardRegenerate',
  'imageProcess',
  'imageRequeue',
  'userRoleChange',
  'userDelete',
];

export function isAdminOnlyAbility(ability: StaffAbility): boolean {
  return ADMIN_ONLY_ABILITIES.includes(ability);
}

/** ตรวจสิทธิ์ระดับเจ้าหน้าที่ (ใช้ทั้ง API และ UI) */
export function checkStaffAbility(actorRole: unknown, ability: StaffAbility): ManageCheckResult {
  if (!isStaffRole(actorRole)) {
    return { ok: false, reason: 'ต้องเป็นผู้ดูแลระบบ' };
  }
  if (isAdminOnlyAbility(ability) && !isAdminRole(actorRole)) {
    return {
      ok: false,
      reason: `"${ABILITY_LABEL_TH[ability]}" ทำได้เฉพาะแอดมิน (ผู้ดูแลดูได้อย่างเดียว)`,
    };
  }
  return { ok: true };
}

/**
 * กติกาการจัดการผู้เล่น (สรุป)
 *  - ห้ามจัดการ "ตัวเอง" ทุกกรณี (กันล็อกตัวเอง/ลบบัญชีตัวเอง)
 *  - แอดมิน: เปลี่ยนสิทธิ์ได้ (รวมถึงลดสิทธิ์แอดมินคนอื่น แต่ต้องเหลือแอดมิน ≥1 — ตรวจที่ route), แบน/ปลดแบนได้, ลบได้
 *  - ผู้ดูแล (MODERATOR): แบน/ปลดแบนได้ **เฉพาะบัญชีที่ไม่ใช่แอดมิน** · เปลี่ยนสิทธิ์/ลบ = ไม่ได้
 *  - ห้ามแบน/ลบ "บัญชีแอดมิน" ทุกกรณี (ต้องลดสิทธิ์ก่อน)
 */
export function checkManageUser(input: ManageCheckInput): ManageCheckResult {
  if (!isStaffRole(input.actorRole)) {
    return { ok: false, reason: 'ต้องเป็นผู้ดูแลระบบ' };
  }
  if (input.actorId === input.targetId) {
    return { ok: false, reason: 'จัดการบัญชีของตัวเองไม่ได้' };
  }
  const targetIsAdmin = isAdminRole(input.targetRole);
  const actorIsAdmin = isAdminRole(input.actorRole);

  if (input.action === 'changeRole') {
    if (!actorIsAdmin) {
      return { ok: false, reason: 'เปลี่ยนสิทธิ์ได้เฉพาะแอดมิน' };
    }
    const nextRole = normalizeAdminRole(input.nextRole);
    if (!nextRole) {
      return { ok: false, reason: 'สิทธิ์ที่เลือกไม่ถูกต้อง (PLAYER/MODERATOR/ADMIN)' };
    }
    if (nextRole === input.targetRole) {
      return { ok: false, reason: 'ผู้เล่นคนนี้มีสิทธิ์นี้อยู่แล้ว' };
    }
    return { ok: true };
  }

  if (input.action === 'delete') {
    if (!actorIsAdmin) {
      return { ok: false, reason: 'ลบผู้เล่นได้เฉพาะแอดมิน' };
    }
    if (targetIsAdmin) {
      return { ok: false, reason: 'ลบบัญชีแอดมินไม่ได้ (ลดสิทธิ์ก่อน)' };
    }
    return { ok: true };
  }

  // ban / unban
  if (targetIsAdmin) {
    return { ok: false, reason: 'แบนบัญชีแอดมินไม่ได้ (ลดสิทธิ์ก่อน)' };
  }
  return { ok: true };
}

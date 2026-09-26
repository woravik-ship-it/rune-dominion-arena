// เหตุการณ์กลาง "อวตารเปลี่ยน" (Phase 26)
//
// ผู้ใช้สั่ง 2026-09-27: "เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
//   เดิม: หัวเว็บโหลดอวตารแค่ตอนเปิดหน้า ⇒ ตั้งอวตารใหม่แล้วรูปบนหัวเว็บยังเป็นของเดิม
//   แก้: หน้าโปรไฟล์ยิงเหตุการณ์นี้หลังบันทึกสำเร็จ แล้วหัวเว็บอัปเดตรูปทันที
//
// เป็นโมดูลที่ไม่พึ่ง React และปลอดภัยกับ SSR (ไม่มี `window` = ไม่ทำอะไร)
import { sanitizeAvatarGrid } from '@/lib/avatar';

export const AVATAR_CHANGED_EVENT = 'rda:avatar-changed';

export interface AvatarChangeDetail {
  /** อิโมจิที่เลือกใหม่ (null = ล้าง) */
  emoji?: string | null;
  /** รหัสกริด 36 ช่อง (null = ล้าง) */
  grid?: string | null;
}

/** ประกาศว่า "อวตารเปลี่ยนแล้ว" */
export function emitAvatarChanged(detail: AvatarChangeDetail = {}): void {
  if (typeof window === 'undefined') return;
  const payload: AvatarChangeDetail = {};
  if (detail.emoji !== undefined) payload.emoji = detail.emoji ?? null;
  if (detail.grid !== undefined) {
    payload.grid = detail.grid === null ? null : sanitizeAvatarGrid(detail.grid);
  }
  window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: payload }));
}

/** ฟังเหตุการณ์ — คืนฟังก์ชันสำหรับเลิกรับ */
export function subscribeAvatarChanged(handler: (detail: AvatarChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AvatarChangeDetail>).detail ?? {};
    handler(detail);
  };
  window.addEventListener(AVATAR_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AVATAR_CHANGED_EVENT, listener);
}

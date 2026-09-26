// เหตุการณ์กลางของ "การแจ้งเตือน" (Phase 24.1)
//
// ผู้ใช้สั่ง 2026-09-26: "การแจ้งเตือนเมื่อเปิดดูแล้ว ไม่หายไปในทันที"
//   เดิม: ระฆังในหัวเว็บโหลดตัวเลขใหม่แค่ทุก 60 วินาที + ตอนกลับเข้าแท็บ
//   ⇒ อ่านแจ้งเตือนในหน้า /notifications แล้วตัวเลขยังค้าง (ต้องรอ poll / รีเฟรช)
//   แก้: หน้า /notifications ยิงเหตุการณ์นี้ทันทีที่อ่าน (แบบ optimistic) แล้วระฆังอัปเดตเลขทันที
//
// เป็นโมดูลบริสุทธิ์-ish (ไม่มี React) และปลอดภัยกับ SSR — ถ้าไม่มี `window` จะไม่ทำอะไร
// ⇒ เทสต์ได้ตรง ๆ ด้วย window ปลอม (ดู tests/unit/notification-events.test.ts)
export const NOTIFICATIONS_CHANGED_EVENT = 'rda:notifications-changed';

export interface NotificationChangeDetail {
  /** จำนวนยังไม่อ่านล่าสุด (ไม่ส่ง = ให้ฝั่งรับไปโหลดของจริงเอง) */
  unreadCount?: number;
}

/** ประกาศว่า "สถานะการอ่าน/จำนวนยังไม่อ่าน เปลี่ยนแล้ว" ให้ทุกคอมโพเนนต์ที่สนใจรู้ */
export function emitNotificationsChanged(unreadCount?: number): void {
  if (typeof window === 'undefined') return;
  const detail: NotificationChangeDetail =
    typeof unreadCount === 'number' && Number.isFinite(unreadCount)
      ? { unreadCount: Math.max(0, Math.floor(unreadCount)) }
      : {};
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail }));
}

/** ฟังเหตุการณ์ — คืนฟังก์ชันสำหรับเลิกรับ */
export function subscribeNotificationsChanged(
  handler: (unreadCount?: number) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NotificationChangeDetail>).detail;
    const next = detail && typeof detail.unreadCount === 'number' ? detail.unreadCount : undefined;
    handler(next);
  };
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
}

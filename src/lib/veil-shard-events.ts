// เหตุการณ์กลางของ "ยอด Veil Shards เปลี่ยน" (Phase 25.1)
//
// ผู้ใช้แจ้ง 2026-09-27: "หลังจากใช้ไปแล้วไม่ลดทันที ต้องรอเปลี่ยนหน้า หรือ Refresh"
//   เดิม: หัวเว็บ (TopHeader) โหลดยอด 💠 แค่ตอนเปิดหน้า/เปลี่ยนหน้า
//   ⇒ ซื้อ/คราฟต์ Item หรือขายการ์ดในหน้าเดิม ยอดบนหัวเว็บยังเป็นค่าเก่า
//   แก้: หน้าที่ใช้/ได้ Veil Shards ยิงเหตุการณ์นี้ทันทีหลัง API ตอบ
//        แล้วหัวเว็บอัปเดตเลขทันที (ถ้าไม่ส่งเลขมา = ให้หัวเว็บไปโหลดของจริงเอง)
//
// เป็นโมดูลที่ไม่พึ่ง React และปลอดภัยกับ SSR — ไม่มี `window` = ไม่ทำอะไร
// ⇒ เทสต์ได้ตรง ๆ (ดู tests/unit/veil-shard-events.test.ts)
export const VEIL_SHARDS_CHANGED_EVENT = 'rda:veil-shards-changed';

export interface VeilShardsChangeDetail {
  /** ยอดล่าสุด (ไม่ส่ง = ให้ฝั่งรับไปโหลดของจริงเอง) */
  balance?: number;
}

/** ประกาศว่า "ยอด Veil Shards เปลี่ยนแล้ว" พร้อมยอดล่าสุด (ถ้ามี) */
export function emitVeilShardsChanged(balance?: number): void {
  if (typeof window === 'undefined') return;
  const detail: VeilShardsChangeDetail =
    typeof balance === 'number' && Number.isFinite(balance)
      ? { balance: Math.max(0, Math.floor(balance)) }
      : {};
  window.dispatchEvent(new CustomEvent(VEIL_SHARDS_CHANGED_EVENT, { detail }));
}

/** ฟังเหตุการณ์ — คืนฟังก์ชันสำหรับเลิกรับ */
export function subscribeVeilShardsChanged(handler: (balance?: number) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<VeilShardsChangeDetail>).detail;
    const next = detail && typeof detail.balance === 'number' ? detail.balance : undefined;
    handler(next);
  };
  window.addEventListener(VEIL_SHARDS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(VEIL_SHARDS_CHANGED_EVENT, listener);
}

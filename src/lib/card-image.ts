// กติกาการแสดง "ภาพการ์ด" ฝั่งเว็บ (pure module — เทสต์ได้โดยไม่ต้อง render)
//
// ผู้ใช้กำหนด: **ห้ามแสดงการ์ดวาดเอง (สคริปต์ SVG) เด็ดขาด** — ถ้ายังไม่มีภาพ AI ให้แสดงสถานะ "กำลังสร้างภาพ"
// จึงแยกตรรกะออกมาเป็นโมดูลบริสุทธิ์ เพื่อให้ทั้งคอมโพเนนต์และเทสต์ใช้กติกาเดียวกัน

/**
 * เลือกเฉพาะ imageUrl ที่เป็น "ภาพจริง" (ภาพ AI ของเรา หรือภาพจากผู้ให้บริการภายนอก)
 * - `/api/cards/<id>/art` → ใช้ได้
 * - `/api/cards/<id>/image` (การ์ดวาดเองของเรา) → คืน null เพื่อไม่ให้แสดง
 */
export function cardArtSrc(imageUrl?: string | null): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('/api/cards/') && imageUrl.includes('/image')) return null;
  return imageUrl;
}

/** สถานะที่ถือว่า "ยังสร้างภาพไม่เสร็จ" → UI ต้องแสดงสถานะรอ (ห้ามโชว์การ์ดวาดเอง/ภาพเก่า) */
export function isGeneratingStatus(imageStatus?: string | null): boolean {
  return imageStatus === 'PENDING' || imageStatus === 'PROCESSING' || !imageStatus;
}

/** ระหว่างสร้างใหม่ (PROCESSING/PENDING) ต้องซ่อนภาพเดิมไว้จนกว่าจะได้ภาพใหม่ */
export function isRegenerating(imageStatus?: string | null): boolean {
  return imageStatus === 'PROCESSING' || imageStatus === 'PENDING';
}

/**
 * URL ของเลเยอร์การ์ด (กรอบ/ชื่อ/ดาว/กล่องคำบรรยาย/สเตตัส)
 * ใช้ `mode=overlay` เสมอ เพื่อเว้นช่องภาพให้โปร่ง — ไม่ให้การ์ดวาดเอง (สคริปต์) ปรากฏใต้สถานะรอ
 */
export function cardFrameUrl(cardId: string): string {
  return `/api/cards/${cardId}/image?v=6&mode=overlay`;
}

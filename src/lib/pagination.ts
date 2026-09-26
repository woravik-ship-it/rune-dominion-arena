// กติกาการแบ่งหน้า (Phase 27) — ใช้ร่วมกันทุกหน้ารายการของแอดมิน
//
// ผู้ใช้แจ้ง 2026-09-27: "เหมือนการ์ด ใน Admin จะแสดงการ์ดไม่ครบทุกใบ"
// สาเหตุ: หน้า /admin/cards ขอข้อมูลครั้งเดียวที่ limit=50 และ API จำกัดไม่เกิน 50
//         ⇒ ในคลังมี 167 ใบ แต่เห็นแค่ 50 ใบแรก (ไม่มีปุ่มเปลี่ยนหน้า/โหลดเพิ่ม)
// ไฟล์นี้เป็นตรรกะบริสุทธิ์ (ไม่แตะ DB/React) ⇒ เทสต์ได้ และทุกหน้าคิดเลขหน้าเหมือนกัน
export interface PagerLimits {
  /** จำนวนต่อหน้าเมื่อไม่ระบุ */
  defaultLimit: number;
  /** เพดานต่อหน้า (กันดึงทั้งตารางโดยไม่ตั้งใจ) */
  maxLimit: number;
}

export const DEFAULT_PAGER_LIMITS: PagerLimits = { defaultLimit: 20, maxLimit: 100 };

/** แปลงค่า limit จาก query ให้อยู่ในช่วงที่ปลอดภัย */
export function normalizeLimit(raw: unknown, limits: PagerLimits = DEFAULT_PAGER_LIMITS): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return limits.defaultLimit;
  return Math.min(limits.maxLimit, Math.max(1, Math.floor(parsed)));
}

/** จำนวนหน้าทั้งหมด (อย่างน้อย 1 หน้าเสมอ เพื่อให้ UI แสดง "หน้า 1/1" ได้) */
export function pageCount(total: number, limit: number): number {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1;
  return Math.max(1, Math.ceil(safeTotal / safeLimit));
}

/** บังคับเลขหน้าให้อยู่ในช่วง 1..pageCount */
export function normalizePage(raw: unknown, total: number, limit: number): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw);
  const page = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  return Math.min(Math.max(1, page), pageCount(total, limit));
}

/** สรุปช่วงข้อมูลที่แสดง เช่น "51–100 จาก 167" */
export function pagerSummary(
  total: number,
  page: number,
  limit: number
): { page: number; limit: number; total: number; totalPages: number; from: number; to: number } {
  const totalPages = pageCount(total, limit);
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const from = total <= 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(total, safePage * limit);
  return { page: safePage, limit, total, totalPages, from, to };
}

/** เลขหน้าที่ควรแสดงเป็นปุ่ม (มีหน้าแรก/หน้าสุดท้ายเสมอ + รอบหน้าปัจจุบัน) */
export function pageWindow(current: number, totalPages: number, span = 2): number[] {
  const pages = new Set<number>([1, totalPages]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  return [...pages].sort((a, b) => a - b);
}

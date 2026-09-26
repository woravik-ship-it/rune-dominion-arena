// ประมาณเวลาสร้างภาพการ์ด (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ตอน Gen รูปการ์ด ให้บอกว่าใช้เวลาประมาณเท่าไร และสามารถกลับมาดูได้ภายหลัง"
//
// สูตร: งานที่รออยู่ = (จำนวนงานก่อนหน้า × เวลาสร้างเฉลี่ย) + (งานที่กำลังสร้างอยู่ 1 งาน)
// เวลาสร้างเฉลี่ยคิดจากงานที่เสร็จจริงล่าสุด (processedAt - startedAt) — ค่าตั้งต้นใช้เมื่อยังไม่มีข้อมูล
// ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน (ไม่แตะ DB) เพื่อให้เทสต์ได้ตรง ๆ
export const DEFAULT_GENERATION_SECONDS = 25;
export const MIN_GENERATION_SECONDS = 3;
export const MAX_GENERATION_SECONDS = 300;

export interface EtaInput {
  /** จำนวนงานที่อยู่ก่อนงานนี้ในคิว (ยังไม่เริ่ม) */
  queuePosition: number;
  /** มีงานที่กำลังสร้างอยู่ตอนนี้ไหม (worker ทำทีละงาน) */
  inFlight: boolean;
  /** เวลาสร้างเฉลี่ยล่าสุด (วินาที) — ไม่มีข้อมูลให้ใช้ค่าตั้งต้น */
  avgSeconds?: number | null;
}

/** เวลาสร้างเฉลี่ยที่ควรใช้ (clamp ให้อยู่ในช่วงที่สมเหตุสมผล) */
export function normalizeAvgSeconds(value?: number | null): number {
  if (!value || !Number.isFinite(value) || value <= 0) return DEFAULT_GENERATION_SECONDS;
  return Math.min(MAX_GENERATION_SECONDS, Math.max(MIN_GENERATION_SECONDS, value));
}

/**
 * ประมาณเวลารอ (วินาที) จนกว่างานนี้จะเสร็จ
 *   จำนวนคิวที่ต้องผ่าน = งานของตัวเอง (1) + งานที่รออยู่ข้างหน้า + งานที่กำลังสร้างอยู่ (ถ้ามี)
 *   (queuePosition = จำนวนงานที่ต้องรอก่อนหน้า, 0 = เป็นคิวถัดไป)
 */
export function estimateEtaSeconds(input: EtaInput): number {
  const avg = normalizeAvgSeconds(input.avgSeconds);
  const ahead = Math.max(0, Math.floor(input.queuePosition)) + (input.inFlight ? 1 : 0);
  return Math.round(avg * (ahead + 1));
}

/** ข้อความเวลาที่ผู้เล่นอ่านรู้เรื่อง — คืน key + ตัวเลข ให้ client แปลภาษาเอง */
export function etaPhraseKey(seconds: number): 'image.etaSeconds' | 'image.etaMinutes' | 'image.etaUnknown' {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'image.etaUnknown';
  return seconds < 60 ? 'image.etaSeconds' : 'image.etaMinutes';
}

export function etaPhraseVars(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return seconds < 60 ? Math.max(1, Math.round(seconds)) : Math.max(1, Math.round(seconds / 60));
}

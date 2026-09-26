// i18n — ภาษาในเกม (ไทย / อังกฤษ) · Phase 20
//
// ผู้ใช้สั่ง 2026-09-26: "ทำตัวเลือกภาษาภายในเกม ทำเป็นเมนูตั้งค่าต่างๆ ภายในเกม"
//
// หลักการ
//  - พจนานุกรมอยู่ที่ dict-th.ts / dict-en.ts (คีย์ต้องตรงกัน — มีเทสต์ตรวจอัตโนมัติ)
//  - `t(locale, key, vars)` เป็นฟังก์ชันบริสุทธิ์ (เทสต์ได้) และถอยไปใช้ไทยเมื่อไม่พบคำแปล
//  - ภาษาที่เลือกถูกเก็บ 2 ที่: localStorage (ใช้ทันที) + User.locale (ให้ข้อความฝั่งเซิร์ฟเวอร์
//    เช่น การแจ้งเตือน ใช้ภาษาเดียวกับผู้เล่น)
import { TH } from './dict-th';
import { EN } from './dict-en';

export type Locale = 'th' | 'en';

export const LOCALES: readonly Locale[] = ['th', 'en'];
export const DEFAULT_LOCALE: Locale = 'th';
export const DICT = { th: TH, en: EN } as const;

export function normalizeLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'th';
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

/** แทนที่ {placeholder} ด้วยค่าจริง (ไม่มี placeholder หรือไม่มีค่า → คงข้อความเดิม) */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * แปลข้อความ — ลำดับการเลือก:
 *   ภาษาที่ขอ → ไทย (ภาษาต้นทางของเกม) → คืน key กลับไป (เห็นทันทีว่า key ไหนยังไม่ได้แปล)
 */
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const table = DICT[normalizeLocale(locale)];
  const text = table[key] ?? TH[key] ?? key;
  return interpolate(text, vars);
}

/** สร้างตัวแปลผูกกับภาษา (ให้ใช้ในคอมโพเนนต์ได้สะดวก) */
export function translator(locale: Locale): TFunc {
  const fixed = normalizeLocale(locale);
  return (key, vars) => t(fixed, key, vars);
}

/** ตรวจว่าทุกคีย์มีการแปลครบทั้งสองภาษา — ใช้ในเทสต์/สคริปต์ตรวจเอกสาร */
export function missingKeys(): { missingInEn: string[]; missingInTh: string[] } {
  const thKeys = Object.keys(TH);
  const enKeys = Object.keys(EN);
  return {
    missingInEn: thKeys.filter((k) => !(k in EN)),
    missingInTh: enKeys.filter((k) => !(k in TH)),
  };
}

export function formatNumber(locale: Locale, value: number): string {
  return value.toLocaleString(normalizeLocale(locale) === 'en' ? 'en-US' : 'th-TH');
}

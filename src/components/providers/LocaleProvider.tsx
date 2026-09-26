'use client';

// LocaleProvider — ภาษาในเกม (Phase 20)
//
// ผู้ใช้สั่ง 2026-09-26: "ทำตัวเลือกภาษาภายในเกม ทำเป็นเมนูตั้งค่าต่างๆ ภายในเกม"
//
// ลำดับการได้มาของภาษา:
//   1) localStorage (ใช้ทันที ไม่ต้องรอเน็ต)
//   2) ค่าจากบัญชี (GET /api/profile/settings) — ใช้เมื่อยังไม่เคยเลือกในเครื่องนี้
//   3) ค่าเริ่มต้น = ไทย
// เมื่อเปลี่ยนภาษา: อัปเดต state + localStorage แล้ว PATCH ไปที่บัญชี (เพื่อให้ข้อความแจ้งเตือน
// ที่สร้างฝั่งเซิร์ฟเวอร์ใช้ภาษาเดียวกัน)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_LOCALE,
  normalizeLocale,
  t as translate,
  type Locale,
  type TFunc,
} from '@/lib/i18n';

const STORAGE_KEY = 'rda_locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: TFunc;
  /** บันทึกฝั่งเซิร์ฟเวอร์สำเร็จไหม (false = เก็บในเครื่องไว้ก่อน) */
  synced: boolean;
}

const LocaleCtx = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    return null;
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [synced, setSynced] = useState(true);
  const hydrated = useRef(false);

  const saveToAccount = useCallback(async (next: Locale) => {
    try {
      const res = await fetch('/api/profile/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: next }),
      });
      setSynced(res.ok);
    } catch {
      setSynced(false);
    }
  }, []);

  // โหลดค่าที่เคยเลือกไว้ (ในเครื่องก่อน แล้วค่อยซิงก์กับบัญชี)
  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
    hydrated.current = true;

    let cancelled = false;
    fetch('/api/profile/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        // ถ้าเครื่องนี้ยังไม่เคยเลือก ใช้ค่าจากบัญชี
        if (!stored) setLocaleState(normalizeLocale(data.data?.locale));
        else if (normalizeLocale(data.data?.locale) !== stored) {
          // เครื่องนี้เลือกไว้แล้ว แต่บัญชีเป็นอีกภาษา → ยึดค่าที่เครื่อง (ผู้ใช้เพิ่งเลือก)
          void saveToAccount(stored);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [saveToAccount]);

  const setLocale = useCallback(
    (next: Locale) => {
      const value = normalizeLocale(next);
      setLocaleState(value);
      try {
        window.localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* โหมดส่วนตัวอาจเขียนไม่ได้ — ใช้ได้เฉพาะรอบนี้ */
      }
      try {
        document.documentElement.lang = value;
      } catch {
        /* ไม่มี DOM (SSR) */
      }
      if (hydrated.current) void saveToAccount(value);
    },
    [saveToAccount]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars), synced }),
    [locale, setLocale, synced]
  );

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleCtx);
  if (ctx) return ctx;
  // เผื่อเรียกนอก provider (เช่น หน้า error) → ใช้ค่าเริ่มต้นแทนการ throw
  return {
    locale: DEFAULT_LOCALE,
    setLocale: () => undefined,
    t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
    synced: true,
  };
}

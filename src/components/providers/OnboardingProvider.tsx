'use client';

// OnboardingProvider — Phase 12
// แสดง onboarding ครั้งแรกของผู้เล่นใหม่ (เก็บสถานะใน localStorage ต่อผู้ใช้)
// ถ้าผู้ใช้ยังไม่ล็อกอินจะไม่แสดง (ให้เริ่มที่หน้า login ก่อน)
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

const STORAGE_PREFIX = 'rda_onboarded_';

interface OnboardingContextValue {
  /** true เมื่อผู้ใช้ใหม่ยังไม่เคยดู (และล็อกอินแล้ว) */
  shouldShow: boolean;
  dismiss: () => void;
  reset: () => void;
}

const Ctx = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [shouldShow, setShouldShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        const id = data?.data?.user?.id as string | undefined;
        if (!id || cancelled) return;
        setUserId(id);
        const seen = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
        const cardCount = Number(data?.data?.cardCount ?? 0);
        if (!seen && cardCount === 0) setShouldShow(true);
      } catch {
        // เงียบ — onboarding ไม่ใช่ฟีเจอร์วิกฤต
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismiss = useCallback(() => {
    setShouldShow(false);
    if (userId) {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, new Date().toISOString());
      } catch {
        // localStorage ปิด — จำได้แค่ session นี้
      }
    }
  }, [userId]);

  const reset = useCallback(() => {
    if (userId) {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${userId}`);
      } catch {
        // ignore
      }
    }
    setShouldShow(true);
  }, [userId]);

  const value = useMemo(() => ({ shouldShow, dismiss, reset }), [shouldShow, dismiss, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return { shouldShow: false, dismiss: () => undefined, reset: () => undefined };
}

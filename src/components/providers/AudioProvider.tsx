'use client';

// AudioProvider — Phase 12 (Audio Direction GDD §17)
// ให้ทั้งแอปใช้ useAudio() ได้: play(name), toggle Music/SFX/Ambience, Reduce Intense Effects
// เก็บการตั้งค่าใน localStorage · เบราว์เซอร์บล็อก autoplay → ปลดล็อกเมื่อผู้ใช้แตะครั้งแรก
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { playSfx, SfxName } from '@/lib/sfx';

interface AudioSettings {
  music: boolean;
  sfx: boolean;
  ambience: boolean;
  reduceIntense: boolean;
  volume: number; // 0..1
}

const DEFAULTS: AudioSettings = {
  music: false,      // ปิดไว้ก่อน — เปิดเมื่อผู้ใช้เลือก (มือถือประหยัดแบต)
  sfx: true,
  ambience: false,
  reduceIntense: false,
  volume: 0.7,
};

const STORAGE_KEY = 'rda_audio_settings';

interface AudioContextValue {
  settings: AudioSettings;
  update: (patch: Partial<AudioSettings>) => void;
  play: (name: SfxName) => void;
  unlocked: boolean;
  unlock: () => void;
}

const AudioCtx = createContext<AudioContextValue | null>(null);

function loadSettings(): AudioSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      music: typeof parsed.music === 'boolean' ? parsed.music : DEFAULTS.music,
      sfx: typeof parsed.sfx === 'boolean' ? parsed.sfx : DEFAULTS.sfx,
      ambience: typeof parsed.ambience === 'boolean' ? parsed.ambience : DEFAULTS.ambience,
      reduceIntense: typeof parsed.reduceIntense === 'boolean' ? parsed.reduceIntense : DEFAULTS.reduceIntense,
      volume: typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULTS.volume,
    };
  } catch {
    return DEFAULTS;
  }
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AudioSettings>(DEFAULTS);
  const [unlocked, setUnlocked] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const settingsRef = useRef<AudioSettings>(DEFAULTS);

  // โหลดค่าที่บันทึกไว้ (หลัง mount เพื่อไม่ให้ SSR mismatch)
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    settingsRef.current = loaded;
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage ปิด (private mode) — ใช้ค่าในหน่วยความจำพอ
    }
  }, [settings]);

  const unlock = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === 'suspended') {
      void ctxRef.current.resume();
    }
    setUnlocked(true);
  }, []);

  const play = useCallback((name: SfxName) => {
    const s = settingsRef.current;
    playSfx(ctxRef.current, name, {
      sfxEnabled: s.sfx,
      volume: s.volume,
      reduceIntense: s.reduceIntense,
    });
  }, []);

  const update = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  // ปลดล็อก audio เมื่อผู้ใช้มี interaction แรก (pointerdown/คีย์บอร์ด)
  useEffect(() => {
    const handler = () => unlock();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [unlock]);

  const value = useMemo(
    () => ({ settings, update, play, unlocked, unlock }),
    [settings, update, play, unlocked, unlock]
  );

  return <AudioCtx.Provider value={value}>{children}</AudioCtx.Provider>;
}

/** ใช้ใน component — ถ้าไม่มี Provider จะได้ no-op (ปลอดภัยกับ SSR/เทสต์) */
export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (ctx) return ctx;
  return {
    settings: DEFAULTS,
    update: () => undefined,
    play: () => undefined,
    unlocked: false,
    unlock: () => undefined,
  };
}

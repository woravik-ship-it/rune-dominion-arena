'use client';

// AudioProvider — ศูนย์ควบคุมเสียงของเกม (Phase 12 ตั้งต้น · Phase 21 ทำให้มีเสียงจริง)
//
// ผู้ใช้สั่ง 2026-09-26: "Projects Game Card มีเมนูเสียง แต่ไม่เห็นมีเสียงเลย ทำเสียงประกอบด้วย"
// สิ่งที่แก้:
//   1) **เพลงและเสียงบรรยากาศเล่นจริง** (ก่อนหน้านี้มีแต่สวิตช์ ไม่มีตัวเล่น)
//   2) ปลดล็อก audio อัตโนมัติทุก interaction + resume เมื่อถูกระงับ (เดิมเสียงแรกหาย)
//   3) บัสเสียงแยกชั้น (SFX/เพลง/บรรยากาศ) + มาสเตอร์วอลุ่ม + โหมดลดเอฟเฟกต์รุนแรง
//   4) debug API `window.__rdaAudio` สำหรับตรวจว่ามีเสียงออกจริง (QA)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isBattleSfx, playSfx, SfxName } from '@/lib/sfx';
import {
  applyLayerGains,
  bandEnergyShare,
  BATTLE_DUCK,
  createAudioGraph,
  describeAudio,
  readLevel,
  type AudioGraph,
} from '@/lib/audio-engine';
import { createAmbiencePlayer, createMusicPlayer, type Player } from '@/lib/audio-players';

interface AudioSettings {
  music: boolean;
  sfx: boolean;
  ambience: boolean;
  reduceIntense: boolean;
  volume: number; // 0..1
}

const DEFAULTS: AudioSettings = {
  music: true,      // Phase 21: เปิดเพลงเป็นค่าเริ่มต้น (ผู้ใช้บ่นว่าเงียบ) — เล่นหลัง interaction แรก
  sfx: true,
  ambience: true,   // เสียงบรรยากาศเบา ๆ เปิดคู่กับเพลงได้
  reduceIntense: false,
  // Phase 22: 0.7 ไม่พอ (ผู้ใช้แจ้ง "เปิดสุดแทบไม่ได้ยิน") → 0.85 + ยกเกนฐานทุกชั้น + compressor
  volume: 0.85,
};

const STORAGE_KEY = 'rda_audio_settings';

interface AudioContextValue {
  settings: AudioSettings;
  update: (patch: Partial<AudioSettings>) => void;
  play: (name: SfxName) => void;
  unlocked: boolean;
  unlock: () => void;
  /** ระดับเสียงที่ออกจริงตอนนี้ (0..1) */
  level: () => number;
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
  const graphRef = useRef<AudioGraph | null>(null);
  const musicRef = useRef<Player | null>(null);
  const ambienceRef = useRef<Player | null>(null);
  const settingsRef = useRef<AudioSettings>(DEFAULTS);
  /** จับเวลา "คืนระดับเพลง" หลัง duck (Phase 24.2) */
  const duckTimerRef = useRef<number | null>(null);

  // โหลดค่าที่บันทึกไว้ (หลัง mount เพื่อไม่ให้ SSR mismatch)
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    settingsRef.current = loaded;
  }, []);

  /** สร้างกราฟเสียง + ตัวเล่น (ครั้งเดียวต่อการเปิดหน้า) */
  const ensureGraph = useCallback((): AudioGraph | null => {
    if (typeof window === 'undefined') return null;
    if (graphRef.current) return graphRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const graph = createAudioGraph(ctx);
    graphRef.current = graph;
    applyLayerGains(graph, settingsRef.current);
    musicRef.current = createMusicPlayer(ctx, graph.musicBus);
    ambienceRef.current = createAmbiencePlayer(ctx, graph.ambienceBus, {
      reduceIntense: settingsRef.current.reduceIntense,
    });
    return graph;
  }, []);

  /**
   * ปลดล็อก/ปลุก audio — เรียกซ้ำได้เสมอ
   * เบราว์เซอร์บล็อก autoplay: ต้องมี user gesture อย่างน้อยหนึ่งครั้งก่อนเสียงจะดัง
   */
  const unlock = useCallback(() => {
    const graph = ensureGraph();
    if (!graph) return;
    if (graph.ctx.state !== 'running') {
      void graph.ctx.resume().catch(() => undefined);
    }
    setUnlocked(true);
    const s = settingsRef.current;
    if (s.music) musicRef.current?.start();
    if (s.ambience) ambienceRef.current?.start();
  }, [ensureGraph]);

  /**
   * เล่นเสียง SFX — ปลุกก่อนเสมอ จึงไม่มีเสียงตกหล่นแม้เป็นเสียงแรกที่กด
   *
   * Phase 24.2 (ผู้ใช้สั่ง: "เสียงต่อสู้ เบา"): เสียงต่อสู้จะ **duck** เพลง/บรรยากาศลงชั่วคราว
   * (sidechain แบบเดียวกับงานมิกซ์จริง) ⇒ ได้ยินเสียงกระบี่ชัดขึ้นโดยไม่ต้องเพิ่มความดังจนแตก
   */
  const play = useCallback(
    (name: SfxName) => {
      const s = settingsRef.current;
      if (!s.sfx) return;
      const graph = ensureGraph();
      if (!graph) return;
      if (graph.ctx.state !== 'running') {
        void graph.ctx.resume().catch(() => undefined);
        setUnlocked(true);
      }
      playSfx(graph.ctx, name, {
        sfxEnabled: true,
        volume: s.volume,
        reduceIntense: s.reduceIntense,
        destination: graph.sfxBus,
      });

      if (isBattleSfx(name) && (s.music || s.ambience)) {
        // ลดลงเร็ว (20 ms) ให้ทันจังหวะกระแทก แล้วคืนระดับใน 0.3 วิ
        applyLayerGains(graph, s, true, BATTLE_DUCK.attackSeconds);
        if (duckTimerRef.current !== null) window.clearTimeout(duckTimerRef.current);
        duckTimerRef.current = window.setTimeout(() => {
          duckTimerRef.current = null;
          const current = graphRef.current;
          if (current) {
            applyLayerGains(current, settingsRef.current, false, BATTLE_DUCK.releaseSeconds);
          }
        }, BATTLE_DUCK.holdSeconds * 1000);
      }
    },
    [ensureGraph]
  );

  /**
   * หยุดเสียงทั้งหมดชั่วคราว — ใช้เมื่อผู้ใช้สลับไปแอป/แท็บอื่น
   * ผู้ใช้แจ้ง 2026-09-26: "เวลาเปลี่ยนไปแอพอื่น ทำไมเสียงไม่หาย"
   * ⇒ หยุดตัวเล่น + suspend AudioContext (ประหยัดแบต และไม่รบกวนตอนไม่ได้ดูเกม)
   */
  const pauseAll = useCallback(() => {
    musicRef.current?.stop();
    ambienceRef.current?.stop();
    const ctx = graphRef.current?.ctx;
    if (ctx && ctx.state === 'running') void ctx.suspend().catch(() => undefined);
  }, []);

  /** เล่นต่อเมื่อกลับเข้าหน้าเกม (ถ้าผู้ใช้ยังเปิดสวิตช์ไว้) */
  const resumeAll = useCallback(() => {
    const graph = ensureGraph();
    if (!graph) return;
    if (graph.ctx.state !== 'running') void graph.ctx.resume().catch(() => undefined);
    const s = settingsRef.current;
    if (s.music) musicRef.current?.start();
    if (s.ambience) ambienceRef.current?.start();
  }, [ensureGraph]);

  const update = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const level = useCallback((): number => {
    const graph = graphRef.current;
    if (!graph) return 0;
    // ขณะหยุด (suspended) analyser ยังเก็บข้อมูลเฟรมสุดท้ายค้างอยู่ → ต้องรายงานเป็น 0
    // ไม่งั้นตัวตรวจจะเข้าใจผิดว่ายังมีเสียงออกทั้งที่หยุดแล้ว
    if (graph.ctx.state !== 'running') return 0;
    return readLevel(graph.analyser);
  }, []);

  // บันทึกค่า + ปรับกราฟเสียง + เปิด/ปิดเพลง–บรรยากาศตามสวิตช์
  useEffect(() => {
    settingsRef.current = settings;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage ปิด (private mode) — ใช้ค่าในหน่วยความจำพอ
    }

    const graph = graphRef.current;
    if (!graph) return;
    applyLayerGains(graph, settings);

    // ต้องปลดล็อกแล้วเท่านั้นจึงจะเริ่มเล่นได้ (ไม่งั้นเบราว์เซอร์ไม่เล่นให้)
    if (!unlocked) return;

    if (settings.music) musicRef.current?.start();
    else musicRef.current?.stop();

    if (settings.ambience) ambienceRef.current?.start();
    else ambienceRef.current?.stop();
  }, [settings, unlocked]);

  // ปลดล็อก audio ทุก interaction + หยุดเสียงเมื่อออกจากแอป และเล่นต่อเมื่อกลับมา
  useEffect(() => {
    let pauseTimer: number | null = null;

    const schedulePause = () => {
      // กันการกระพริบ blur/focus รัว ๆ (เช่น สลับหน้าต่างเร็ว ๆ)
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      pauseTimer = window.setTimeout(() => {
        pauseTimer = null;
        if (document.hidden || !document.hasFocus()) pauseAll();
      }, 250);
    };

    const handleFocus = () => {
      if (pauseTimer !== null) {
        window.clearTimeout(pauseTimer);
        pauseTimer = null;
      }
      if (!document.hidden) resumeAll();
    };

    const handleInteraction = () => unlock();
    const handleBlur = () => schedulePause();
    const handleVisibility = () => {
      if (document.hidden) schedulePause();
      else handleFocus();
    };

    window.addEventListener('pointerdown', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    window.addEventListener('touchstart', handleInteraction, { passive: true } as AddEventListenerOptions);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (pauseTimer !== null) window.clearTimeout(pauseTimer);
      window.removeEventListener('pointerdown', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [pauseAll, resumeAll, unlock]);

  // debug/QA API — ใช้ตรวจว่ามีเสียงออกจริง (ไม่เปิดเผยข้อมูลผู้ใช้)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const api = {
      state: () => graphRef.current?.ctx.state ?? 'none',
      level: () => level(),
      settings: () => ({ ...settingsRef.current }),
      gains: () => describeAudio(settingsRef.current),
      musicPlaying: () => musicRef.current?.isPlaying() ?? false,
      ambiencePlaying: () => ambienceRef.current?.isPlaying() ?? false,
      play: (name: SfxName) => play(name),
      unlock: () => unlock(),
      stopMusic: () => musicRef.current?.stop(),
      stopAmbience: () => ambienceRef.current?.stop(),
      pause: () => pauseAll(),
      resume: () => resumeAll(),
      ctxState: () => graphRef.current?.ctx.state ?? 'none',
      /** สัดส่วนพลังงานเสียงในย่านความถี่ (Phase 24.2) — ยืนยันว่าเสียงอยู่ในย่านที่มือถือออกได้ */
      bands: (lowHz = 250, highHz = 4000) => {
        const graph = graphRef.current;
        if (!graph || graph.ctx.state !== 'running') return null;
        return bandEnergyShare(graph.analyser, lowHz, highHz);
      },
      /**
       * ค่าเกน "จริง" บนบัสเสียงตอนนี้ (ต่างจาก gains() ที่คำนวณจากการตั้งค่า)
       * Phase 24.2: ใช้ตรวจว่า ducking ทำงานจริง (เพลงลดลงขณะเสียงต่อสู้ แล้วคืนระดับ)
       */
      bus: () => ({
        sfx: graphRef.current?.sfxBus.gain.value ?? 0,
        music: graphRef.current?.musicBus.gain.value ?? 0,
        ambience: graphRef.current?.ambienceBus.gain.value ?? 0,
      }),
    };
    (window as unknown as { __rdaAudio?: typeof api }).__rdaAudio = api;
    return () => {
      delete (window as unknown as { __rdaAudio?: typeof api }).__rdaAudio;
    };
  }, [level, pauseAll, play, resumeAll, unlock]);

  // หยุดเสียงทั้งหมดเมื่อออกจากแอป
  useEffect(
    () => () => {
      if (duckTimerRef.current !== null) window.clearTimeout(duckTimerRef.current);
      musicRef.current?.stop();
      ambienceRef.current?.stop();
      const ctx = graphRef.current?.ctx;
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
    },
    []
  );

  const value = useMemo(
    () => ({ settings, update, play, unlocked, unlock, level }),
    [settings, update, play, unlocked, unlock, level]
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
    level: () => 0,
  };
}

// Anti-cheat — Bot Pattern Detection — Phase 10
// ตรวจพฤติกรรม "เร็วผิดปกติ" และ "จังหวะสม่ำเสมอผิดมนุษย์" จาก timestamp ของการกระทำ
// เป็น pure module (ไม่แตะ DB) — ผู้เรียกเป็นคน log SecurityEvent / ตอบ 429 เอง

export interface BotCheckResult {
  flagged: boolean;
  reason?: 'FAST_ACTIONS' | 'UNIFORM_CADENCE';
  detail?: string;
}

/** interval สั้นกว่านี้ถือว่า "เร็วผิดปกติ" (มนุษย์คลิกเร็วสุด ~200-300ms ต่อ action เดียว ทำซ้ำต่อเนื่องไม่ได้) */
export const BOT_FAST_INTERVAL_MS = 250;
/** จำนวน interval ติดกันที่สั้นผิดปกติก่อนตั้งธง */
export const BOT_FAST_STREAK = 6;
/** cadence สม่ำเสมอ: ผลต่างของ interval มากสุด/น้อยสุดห่างกันไม่เกินนี้ */
export const BOT_UNIFORM_TOLERANCE_MS = 20;
/** จำนวน interval ล่าสุดที่ใช้ตรวจ cadence */
export const BOT_UNIFORM_WINDOW = 12;
/** cadence สม่ำเสมอจะถือว่าผิดปกติเมื่อ interval สั้น (ยาวๆ เช่นโปรแกรมรันทุก 5 นาที ถือว่าปกติ) */
export const BOT_UNIFORM_MAX_INTERVAL_MS = 2_500;

export interface AntiCheatStore {
  entries: Map<string, number[]>;
}

/** สร้าง store แยกต่างหาก (ใช้ในเทส / อยากได้ scope เฉพาะ) */
export function createAntiCheatStore(): AntiCheatStore {
  return { entries: new Map<string, number[]>() };
}

/** store กลางที่ใช้ทั้งแอป (in-memory — ต่ออินสแตนซ์) */
export const antiCheat = createAntiCheatStore();

/** เก็บ timestamp สูงสุดต่อ key — พอสำหรับหน้าต่างการวิเคราะห์ */
const MAX_TIMESTAMPS_PER_KEY = 64;

/** วิเคราะห์ลำดับ timestamp → ตั้งธงเมื่อพบ pattern ของบอท */
export function analyzeIntervals(timestamps: number[]): BotCheckResult {
  if (timestamps.length < 2) return { flagged: false };

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  // 1) FAST_ACTIONS — action ติดกันหลายครั้งโดยห่างกันผิดปกติ
  let fastStreak = 0;
  for (let i = intervals.length - 1; i >= 0; i--) {
    if (intervals[i] < BOT_FAST_INTERVAL_MS) {
      fastStreak++;
      if (fastStreak >= BOT_FAST_STREAK) {
        return {
          flagged: true,
          reason: 'FAST_ACTIONS',
          detail: `ทำ ${fastStreak} ครั้งติดกันห่างกัน < ${BOT_FAST_INTERVAL_MS}ms`,
        };
      }
    } else {
      break;
    }
  }

  // 2) UNIFORM_CADENCE — จังหวะแทบคงที่เป๊ะ (jitter เกือบศูนย์) = สั่งด้วยโปรแกรม
  const recent = intervals.slice(-BOT_UNIFORM_WINDOW);
  if (recent.length >= BOT_UNIFORM_WINDOW) {
    const max = Math.max(...recent);
    const min = Math.min(...recent);
    if (max - min <= BOT_UNIFORM_TOLERANCE_MS && max < BOT_UNIFORM_MAX_INTERVAL_MS) {
      const avg = Math.round((max + min) / 2);
      return {
        flagged: true,
        reason: 'UNIFORM_CADENCE',
        detail: `จังหวะคงที่ผิดปกติ ~${avg}ms ต่อเนื่อง ${recent.length} ครั้ง (jitter ≤ ${BOT_UNIFORM_TOLERANCE_MS}ms)`,
      };
    }
  }

  return { flagged: false };
}

/**
 * บันทึกการกระทำ 1 ครั้ง แล้วตรวจ pattern ทันที
 * @param key ระบุเป้า เช่น `discover:<userId>`
 * @param reset เริ่มนับใหม่ (เช่นหลังโดนบล็อกแล้วผ่านช่วงห้าม)
 */
export function recordAction(
  store: AntiCheatStore,
  key: string,
  now: number,
  opts: { reset?: boolean } = {}
): BotCheckResult {
  if (opts.reset) {
    store.entries.set(key, [now]);
    return { flagged: false };
  }
  const list = store.entries.get(key) ?? [];
  list.push(now);
  if (list.length > MAX_TIMESTAMPS_PER_KEY) {
    list.splice(0, list.length - MAX_TIMESTAMPS_PER_KEY);
  }
  store.entries.set(key, list);
  return analyzeIntervals(list);
}

/** ล้างสถิติ (ใช้ในเทส) */
export function resetAntiCheat(store: AntiCheatStore = antiCheat): void {
  store.entries.clear();
}

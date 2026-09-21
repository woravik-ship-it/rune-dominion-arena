// Rate Limiting (Core) — Phase 10: Security & Anti-Cheat
// Sliding-window counter แบบ in-memory — เพียงพอสำหรับ deploy อินสแตนซ์เดียว (docker compose / LAN)
// หมายเหตุ: ไฟล์นี้ต้องเป็น pure module (ไม่ import node:crypto / next) เพราะ middleware (edge runtime) ใช้ด้วย
// ถ้า scale หลายอินสแตนซ์ ให้เปลี่ยน store เป็น Redis โดยคง interface checkRateLimit เดิม

export interface RateLimitConfig {
  limit: number;    // จำนวนครั้งสูงสุดต่อ window
  windowMs: number; // ขนาดหน้าต่างเวลา (มิลลิวินาที)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;      // โควตาคงเหลือใน window นี้
  retryAfterMs: number;   // ถ้าโดนบล็อก: รออีกเท่าไร (มิลลิวินาที)
  limit: number;
  windowMs: number;
}

/** ค่าเริ่มต้นต่อ endpoint — ปรับผ่าน env RATE_LIMIT_<SCOPE>_LIMIT ได้ */
export const RATE_LIMITS = {
  // Phase 12: ปรับจาก 120 → 600/นาที เพราะผู้ใช้มือถือในวง LAN/องค์กรมักออก IP เดียวกัน (NAT)
  // 120/นาที = เพียง 2 req/s ต่อ IP ซึ่งผู้ใช้จริง 2-3 คนในบ้านเดียวก็ชนได้แล้ว
  // การป้องกันที่แม่นจริงมาจากชั้น User/Device (DISCOVER/AUTH_* ด้านล่าง) ไม่ใช่ IP
  API_BURST: { limit: 600, windowMs: 60_000 },       // ภาพรวมต่อ IP (ชั้นแรกใน middleware)
  AUTH_LOGIN: { limit: 10, windowMs: 60_000 },       // กัน brute force
  AUTH_REGISTER: { limit: 5, windowMs: 60_000 },
  DISCOVER: { limit: 30, windowMs: 60_000 },         // ถอดรหัสรูน (มี energy cap 5/วัน อยู่แล้ว)
  BATTLE: { limit: 30, windowMs: 60_000 },           // จำลองการต่อสู้
  ARENA_CREATE: { limit: 6, windowMs: 60_000 },      // เปิดห้อง (มี cooldown 5 นาทีแยกต่างหาก)
  ARENA_JOIN: { limit: 30, windowMs: 60_000 },       // เข้าร่วมห้อง (มี daily cap 20 แยกต่างหาก)
  ARENA_CHALLENGE: { limit: 20, windowMs: 60_000 },  // ท้าชิงแชมป์
  QUEST_CLAIM: { limit: 30, windowMs: 60_000 },
  DECK_WRITE: { limit: 20, windowMs: 60_000 },
  CARD_FAVORITE: { limit: 60, windowMs: 60_000 },
  REPLAY: { limit: 60, windowMs: 60_000 },
} as const;

export type RateLimitScope = keyof typeof RATE_LIMITS;

type TimestampStore = Map<string, number[]>;
const stores = new Map<string, TimestampStore>();

/** เพดานจำนวน key ที่จดจำ (กัน memory โดน flood key ใหม่) */
const MAX_TRACKED_KEYS = 50_000;

/** อ่าน config พร้อม env override (RATE_LIMIT_<SCOPE>_LIMIT) */
export function rateLimitConfig(scope: RateLimitScope): RateLimitConfig {
  const base = RATE_LIMITS[scope];
  const raw = process.env[`RATE_LIMIT_${scope}_LIMIT`];
  if (!raw) return { ...base };
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return { limit: Math.floor(n), windowMs: base.windowMs };
  }
  return { ...base };
}

/** ตรวจโควตาแบบ sliding window — คืนผลว่าผ่าน/ไม่ผ่าน พร้อมข้อมูล header */
export function checkRateLimit(
  scope: string,
  identifier: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  let store = stores.get(scope);
  if (!store) {
    store = new Map<string, number[]>();
    stores.set(scope, store);
  }
  if (store.size > MAX_TRACKED_KEYS) {
    // ป้องกัน memory บวมจาก key ปลอม (เช่น IP spoof) — ล้างทั้ง scope (ยอมรับความเสียหายน้อย)
    store.clear();
  }

  const key = identifier;
  const timestamps = store.get(key) ?? [];
  const windowStart = now - config.windowMs;

  // ตัดรายการเก่าออกนอกหน้าต่าง
  while (timestamps.length > 0 && timestamps[0] <= windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= config.limit) {
    const retryAfterMs = (timestamps[0] ?? now) + config.windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(1, retryAfterMs),
      limit: config.limit,
      windowMs: config.windowMs,
    };
  }

  timestamps.push(now);
  store.set(key, timestamps);

  return {
    allowed: true,
    remaining: config.limit - timestamps.length,
    retryAfterMs: 0,
    limit: config.limit,
    windowMs: config.windowMs,
  };
}

/** ล้างสถิติทั้งหมด (ใช้ในเทส) */
export function resetRateLimits(): void {
  stores.clear();
}

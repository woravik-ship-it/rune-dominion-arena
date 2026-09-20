import {
  checkRateLimit,
  resetRateLimits,
  rateLimitConfig,
  RATE_LIMITS,
  RateLimitConfig,
} from '@/lib/rate-limit';

describe('Rate Limiting (Phase 10)', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  test('อนุญาตตามโควตาและนับ remaining ถูกต้อง', () => {
    const cfg: RateLimitConfig = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimit('TEST', 'u1', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('TEST', 'u1', cfg, 2_000).remaining).toBe(1);
    const third = checkRateLimit('TEST', 'u1', cfg, 3_000);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  test('เกินโควตา → บล็อกพร้อม retryAfterMs', () => {
    const cfg: RateLimitConfig = { limit: 2, windowMs: 60_000 };
    checkRateLimit('TEST', 'u1', cfg, 1_000);
    checkRateLimit('TEST', 'u1', cfg, 2_000);
    const blocked = checkRateLimit('TEST', 'u1', cfg, 3_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(cfg.windowMs);
  });

  test('พ้นหน้าต่างเวลาแล้วนับใหม่ (sliding window)', () => {
    const cfg: RateLimitConfig = { limit: 1, windowMs: 5_000 };
    expect(checkRateLimit('TEST', 'u1', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('TEST', 'u1', cfg, 3_000).allowed).toBe(false);
    expect(checkRateLimit('TEST', 'u1', cfg, 7_000).allowed).toBe(true);
  });

  test('identity ต่างระดับ (user/device/ip) ไม่แชร์โควตากัน', () => {
    const cfg: RateLimitConfig = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit('TEST', 'user:a', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('TEST', 'device:d1', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('TEST', 'ip:1.2.3.4', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('TEST', 'user:a', cfg, 1_100).allowed).toBe(false);
  });

  test('scope ต่างกันไม่แชร์โควตากัน', () => {
    const cfg: RateLimitConfig = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit('SCOPE_A', 'u1', cfg, 1_000).allowed).toBe(true);
    expect(checkRateLimit('SCOPE_B', 'u1', cfg, 1_000).allowed).toBe(true);
  });

  test('rateLimitConfig รับ env override (RATE_LIMIT_<SCOPE>_LIMIT)', () => {
    const original = process.env.RATE_LIMIT_API_BURST_LIMIT;
    process.env.RATE_LIMIT_API_BURST_LIMIT = '5';
    try {
      expect(rateLimitConfig('API_BURST').limit).toBe(5);
      expect(rateLimitConfig('API_BURST').windowMs).toBe(RATE_LIMITS.API_BURST.windowMs);
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_API_BURST_LIMIT;
      else process.env.RATE_LIMIT_API_BURST_LIMIT = original;
    }
  });

  test('env override ค่าไม่ถูกต้อง → ใช้ค่าเริ่มต้น', () => {
    const original = process.env.RATE_LIMIT_API_BURST_LIMIT;
    process.env.RATE_LIMIT_API_BURST_LIMIT = 'ไม่ใช่ตัวเลข';
    try {
      expect(rateLimitConfig('API_BURST').limit).toBe(RATE_LIMITS.API_BURST.limit);
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT_API_BURST_LIMIT;
      else process.env.RATE_LIMIT_API_BURST_LIMIT = original;
    }
  });
});

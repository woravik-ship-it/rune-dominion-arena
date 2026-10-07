# Code Review Summary — Rune Dominion Arena

> สรุปจากการตรวจสอบโค้ดทั้งหมดใน `rune-dominion-arena/`  
> ไฟล์นี้เป็น **ไฟล์ comment / บันทึก** เท่านั้น — ไม่ได้ทำการแก้ไข code ใด ๆ  
> สร้างเมื่อ: 2026-09-28

## สรุปโครงสร้าง Code

| หมวด | จำนวน |
|------|-------|
| ไฟล์ TypeScript (.ts/.tsx) | ~600+ (ใน src/) |
| บรรทัดโดยประมาณ | ~33,000 บรรทัด (ไม่นับ node_modules) |
| Unit Tests (Jest) | 51 ไฟล์ |
| E2E Tests | 0 ไฟล์ (โฟลเดอร์ว่าง) |
| API Routes | ~30 ไฟล์ (Battle, Arena, Cards, Items, Decks, Auth, Event) |
| Services | ~35 ไฟล์ (pure, testable) |

**สถาปัตยกรรม:** Next.js 14 (App Router) + TypeScript strict + Prisma/PostgreSQL + Tailwind CSS + Jest

---

## ✅ จุดแข็ง

1. **สถาปัตยกรรมแบ่งชัดเจน** — Services (pure logic) แยกออกจาก UI และ API routes ทำให้ทดสอบได้
2. **ระบบต่อสู้เป็นกันตั้งนิยม** — `simulateBattle()` เป็น pure function + deterministic PRNG → replay verification ทำได้ (Phase 10)
3. **Idempotency ครอบคลุม** — discovery, arena join, arena challenge, raid มี idempotency key ป้องกันการชำระซ้ำ
4. **Security ครบวงจร** — middleware (CORS, rate limit, CSP, security headers) + rate limiting (user→device→IP) + bot pattern detection + anti-cheat + replay tamper detection
5. **ระบบเศรภ์แสรบครบ** — การ์ดมีการ์ดเขต (Element) 6 ธาตุ ให้ความสัมพันธ์กระดานกระตุ้น (Advantage/Disadvantage 1.15× / 0.90×)
6. **ระบบ progression หลายชั้น** — การค้นพบการ์ด → จัดเด็ค (ระบบวงกลม 3 บทบาท + คะแนน) → การต่อสู้ → ดันเจี้ยน (บล็อก 5 ชั้น) → Arena 24 ชม. → Event Boss Raid
7. **Audio engine ครบฟีเจอร์** — แยกชั้น SFX/Music/Ambience + compressor + limiter + sidechain ducking + debug API
8. **Test coverage ดี** — 51 ไฟล์ test คุ้มครอง combat, deck-formation, discovery, wallet, arena, level ฯลฯ

---

## ⚠️ ปัญหา / จุดอ่อน

### 1. Rate limiting เป็น in-memory (หายากกว่า single-instance)
- **ไฟล์**: `src/lib/rate-limit.ts`
- **ปัญหา**: ถ้า deploy หลาย instance แต่ละ instance มี counter เอง → rate limit ไม่ทำงานต่อจริง

### 2. Arena Challenge มี race condition
- **ไฟล์**: `src/app/api/arena/[id]/challenge/route.ts`
- **ปัญหา**: 2 คนท้าทายพร้อมกัน → ทั้งสองได้รับรางวัล “ชนะแชมป์” พร้อมกัน → แชมป์ถูกทับซ้อนโดยไม่มีการล็อก

### 3. CardFace polling หนักเมื่อมีหลายการ์ด
- **ไฟล์**: `src/components/cards/CardFace.tsx`
- **ปัญหา**: Poll ทุก 4 วินาทีต่อการ์ด (ไม่มี exponential backoff) → กดฐานข้อมูลหนักเมื่อมีหลายการ์ดในหน้าเดียวกัน

### 4. Starting Coin น้อยเกินไป
- **ไฟล์**: `src/lib/constants.ts` (`STARTING_COIN = 10`)
- **ปัญหา**: Arena ต้องการ 30 Coin (เปิด) + 10 Coin (เข้า) = 40 Coin → ผู้เล่นใหม่ต้องเล่นหลายวันถึงจะใช้ Arena ได้

### 5. ไม่มี real-time updates ใน Arena
- **ปัญหา**: ไม่มี WebSocket/polling เพื่อแจ้งการอัปเดต leaderboard หรือการท้าชิงแบบเรียลไทม์

### 6. Combat อาจเสมอไม่จบเต็มที่
- **ไฟล์**: `src/services/combat-engine.ts` (`BATTLE_MAX_TURNS = 30`)
- **ปัญหา**: หากทั้งสองทีมมี HP สูง → ใช้เต็ม 30 รอบแล้ว DRAW หรือตาม HP ที่เหลือ

### 7. Dead code ใน arena/route.ts
- **ไฟล์**: `src/app/api/arena/route.ts`
- **ปัญหา**: มี `void resolveUserId; void ARENA_CREATE_COST;` ฯลฯ ที่ประกาศแต่ไม่ใช้งาน

### 8. ไม่มี E2E tests
- **โฟลเดอร์**: `tests/e2e/` ว่างสนิท

### 9. ไม่มีเสสียง SFX ในหน้าการต่อสู้
- **ไฟล์**: `src/app/(game)/battle/[id]/page.tsx`
- **ปัญหา**: มีเพลง/ambience แต่ไม่มีเสสียง effect ขณะ戰鬥 (attack/skill/burn/heal)

---

## 🎮 คำแนะนำเพิ่มความสนุกและราบรื่น

### การเล่น (Gameplay)
| ปัญหา | แนะนำ |
|------|-------|
| Starting Coin น้อย | เพิ่มเป็น 20-30 Coin หรือให้ Coin ฟรีตามเวลา |
| Discovery energy จำกัด 5 | ให้สามารถซื้อพลังงานเพิ่มได้ด้วย Coin |
| การต่อสู้เสมอไม่จบ | เพิ่ม "Overtime" หรือให้ทีมที่มี HP มากกว่าชนะโดยอัตโนมัติหลัง 30 รอบ |
| ไม่มี real-time arena | เติม polling ทุก 30-60 วินาทีในหน้า arena/[id] |
| ไม่มีเสสียง戰鬥 | ให้เล่น SFX ตาม action log (attack, skill, burn, heal) |

### ประสบไอฟ้อง (Performance)
| ปัญหา | แนะนำ |
|------|-------|
| CardFace polling หนัก | ใช้ exponential backoff (4s → 8s → 16s → cap 60s) |
| Rate limit in-memory | เพิ่ม Redis adapter เพื่อรองรับหลาย instance |

### ความเสถียรภาพ (Stability)
| ปัญหา | แนะนำ |
|------|-------|
| Race condition ใน Arena Challenge | ใช้ `prisma.$transaction` หรือ PostgreSQL advisory lock |
| ไม่มี E2E tests | ใช้ Playwright เขียน test สำหรับ user journey |
| Dead code | ทำความสะอาด imports ที่ไม่ได้ใช้ใน arena/route.ts |

### UX
| ปัญหา | แนะนำ |
|------|-------|
| การ์ดรอรูป AI ไม่มี feedback | ให้มี progress bar แทนการหมุนไม่รู้จบ |
| Arena ไม่มีการแจ้งเตือน | เติม in-app notification เมื่อโดนท้าทาย |

---

## 🔧 ลำดับความสำคัญ (prioritization)

### สถานะการแก้ (อัปเดต 2026-10-07 · Hermes)

ตรวจซ้ำกับโค้ดจริงแล้ว — ข้อที่ปิดแล้วมีหลักฐาน ไม่ใช่ติ๊กเปล่า

| ข้อ | สถานะ | หลักฐาน / หมายเหตุ |
|---|---|---|
| 2. Arena Challenge race condition | ✅ แก้แล้ว | `src/app/api/arena/[id]/challenge/route.ts` รวมทุกการเขียนเป็น `prisma.$transaction` + ตั้งแชมป์แบบมีเงื่อนไข `updateMany({ where: { id, championId: คนเก่า } })` → 2 คนท้าพร้อมกันตั้งแชมป์ซ้อนไม่ได้ (commit `7c7420f`) |
| 3. CardFace polling หนัก | ✅ แก้แล้ว | backoff 4→8→16→…→60 วิ (หยุดเมื่อได้ภาพ) ใน `src/components/cards/CardFace.tsx` (commit `7c7420f`) |
| 5. ไม่มี real-time update ใน Arena | ✅ แก้แล้ว | หน้า `/arena/[id]` ดึงสถานะห้องอัตโนมัติทุก 20 วิ (`ARENA_POLL_MS`) ข้ามรอบเมื่อแท็บถูกซ่อน/กำลังยิงคำสั่ง + โชว์เวลาอัปเดตล่าสุด (Phase 45) |
| 6. combat เต็ม 30 รอบอาจ DRAW | ✅ แก้แล้ว | แยก `decideWinner()` เป็นฟังก์ชันบริสุทธิ์ ไล่ชั้น HP รวม → จำนวนใบที่รอด → ATK รวม → DRAW จริง ๆ + เทสต์ 7 เคส (`tests/unit/combat-winner.test.ts`) |
| 7. Dead code ใน `arena/route.ts` | ✅ แก้แล้ว | ตัด `void resolveUserId; void ARENA_CREATE_COST;` (commit `7c7420f`) |
| 8. ไม่มี E2E tests | ✅ แก้แล้ว | `@playwright/test` 1.63.0 + `playwright.config.ts` + `tests/e2e/` (11 เทสต์: auth/discovery/decks/pages) · `npm run test:e2e` → **11 passed / 0 failed** (รันกับ production :3000 จริง) · `scripts/e2e-flow.mjs` (HTTP) → **30/30** · มี `global-teardown` ลบผู้ใช้ทดสอบของรอบนั้นเอง (เดิมค้างใน DB 46 บัญชี) |
| 9. ไม่มีเสียง SFX ในหน้าการต่อสู้ | ✅ แก้แล้ว | `battleSfxFor()` + `useAudio().play()` ตาม action log (attack/skill/burn/heal) ใน `src/app/(game)/battle/[id]/page.tsx` (Phase 22/24.2) |
| 1. Rate limiting เป็น in-memory | ➖ คงไว้โดยเจตนา | ระบบรัน single-instance บนเครื่องเดียว — `DEVELOPMENT_PLAN.md` (Phase 0) ระบุเหตุผลและทางออก (สลับเป็น Redis adapter) ไว้แล้ว ถ้าขยายหลายอินสแตนซ์ต้องทำก่อน |
| 4. Starting Coin 10 น้อยเกินไป | ➖ คงไว้โดยเจตนา | Phase 37 ผู้ใช้สั่งเอง (กันเงินเฟ้อตั้งแต่ต้นเกม) · Arena เปิดห้อง 30 + เข้า 10 ⇒ ต้องเก็บ Coin ก่อนใช้ Arena |
| อื่น ๆ. สำรองฐานข้อมูล | ✅ เพิ่มแล้ว | `rune-dominion-backup.timer` (systemd --user) สำรองรายวัน 04:30 + `KEEP_DAYS=14` · ตรวจกู้คืนจริงด้วย `npm run backup:verify` (39 ตาราง · 73 ผู้ใช้) |
| อื่น ๆ. Admin ไม่มีหน้าจัดการ Events | ✅ แก้แล้ว | เพิ่มหน้า `/admin/events` + API CRUD (`/api/admin/events`, `/api/admin/events/[id]`) + `scripts/verify-admin-events.mjs` → **15/15** กับ production :3000 (401 ไม่ล็อกอิน · 403 ผู้เล่น · 200 แอดมิน · สร้างใหม่ = ปิดเป็นค่าเริ่มต้น · ช่วงเวลาผิด 400 · ลบแล้ว 404 · กิจกรรมเดิมไม่ถูกแตะ) |
| อื่น ๆ. ผู้ใช้ทดสอบค้างใน DB จริง | ⏳ รอผู้ใช้อนุมัติ | พบ **59 บัญชี** (`e2e_` 46 · `itm_` 9 · `verify` 2 · `ntf_` 1 · `audio_` 1) ปนอยู่ในตารางจัดอันดับจริง (อันดับ 4 "E2E a" · อันดับ 5 "Audio Baseline") · แก้ต้นเหตุแล้ว (global-teardown + `npm run clean:test-users`) แต่การลบของเดิมต้องให้ผู้ใช้อนุมัติ |

**ระดับสูง:**
1. ~~แก้ race condition ใน Arena Challenge (ใช้ transaction)~~ ✅
2. ~~เพิ่ม exponential backoff ใน CardFace polling~~ ✅
3. ~~เพิ่มเสียง SFX ในหน้าการต่อสู้~~ ✅
4. ~~ทำความสะอาด dead code ใน `/api/arena/route.ts`~~ ✅

**ระดับกลาง:**
5. ~~ปรับ Starting Coin เป็น 20-30~~ ➖ (ผู้ใช้กำหนดให้เป็น 10 โดยเจตนา)
6. ~~เพิ่ม polling ในหน้า Arena room เพื่ออัปเดต leaderboard~~ ✅
7. ~~เขียน E2E tests พื้นฐานด้วย Playwright~~ ✅ (11 เทสต์ผ่านกับ production จริง)
8. ~~เพิ่ม progress bar สำหรับ image generation~~ ✅ (`CardFace` แสดงสถานะ/Poll จนได้ภาพ)

**ระดับต่ำ:**
9. เพิ่ม Redis สำหรับ rate limiting ➖ (รอตอนขยายหลายอินสแตนซ์)
10. ~~ปรับ combat ให้มีการตัดสินเป็นอย่างยิ่งหลัง 30 รอบ~~ ✅

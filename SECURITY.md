# 🔐 Security & Anti-Cheat Policy (Phase 10)

เอกสารนโยบายความปลอดภัยของ **Rune Dominion Arena** — ครอบคลุมงาน Phase 10 (Security & Anti-Cheat) ตาม `DEVELOPMENT_PLAN.md` และ checklist GDD §20

---

## 1. สถาปัตยกรรมความปลอดภัย

### หลักการพื้นฐาน (จากกฎระหว่างพัฒนา)
- **Server-side เท่านั้น** สำหรับ Combat / Discovery / Reward — ไม่เชื่อ stat, damage, reward จาก client
- **Deterministic** — ห้าม `Math.random()` ในระบบสำคัญ (ใช้ PRNG จาก seed + SERVER_PEPPER)
- **Integer เท่านั้น** สำหรับ Currency
- **Idempotent** — ทุก endpoint ที่กระทบ Currency ต้อง retry ได้โดยไม่หักซ้ำ
- **ไม่เชื่อข้อมูลจาก client** — ทุก request body ผ่าน Zod schema (`src/lib/validation.ts`)

### ชั้นการป้องกัน (Defense in Depth)

| ชั้น | กลไก | ไฟล์ |
|---|---|---|
| 1. Headers | CSP, HSTS (prod), X-Frame-Options, nosniff, Referrer-Policy | `src/middleware.ts` |
| 2. CORS | same-origin เท่านั้น (ปรับได้ผ่าน `CORS_ALLOWED_ORIGINS`) | `src/lib/cors.ts` |
| 3. Rate limit | API burst ต่อ IP ใน middleware + ต่อ endpoint (User → Device → IP) | `src/lib/rate-limit.ts`, `src/lib/api-guard.ts` |
| 4. Input validation | Zod schema ทุก API ที่รับ body | `src/lib/validation.ts` |
| 5. Anti-cheat | Bot pattern detection (เร็วผิดปกติ/จังหวะคงที่) | `src/lib/anti-cheat.ts` |
| 6. Alt-account | Device fingerprint + IP ตอน register/login | `prisma/schema.prisma` (User) |
| 7. Replay verification | คำนวณซ้ำจาก seed + team snapshot เทียบกับที่บันทึก | `src/services/battle-verify.ts` |
| 8. Audit | AdminActionLog (Phase 9) + SecurityEvent (Phase 10) | `src/lib/security-log.ts` |

---

## 2. รายละเอียดกลไก

### Rate Limiting (User / IP / Device)
- Sliding-window counter แบบ in-memory (ต่ออินสแตนซ์) — เพียงพอสำหรับ docker compose / LAN
- **ลำดับ identity:** session user → `x-device-id` header → client IP
- **ชั้นแรก:** middleware จำกัดภาพรวม 120 req/นาที ต่อ IP สำหรับ `/api/*`
- **ชั้นต่อ endpoint:** เช่น AUTH_LOGIN 10/นาที (ต่อ IP **และ** ต่อบัญชีเป้าหมาย), DISCOVER 30/นาที
- ปรับโควตาผ่าน env `RATE_LIMIT_<SCOPE>_LIMIT` (ดูทั้งหมดใน `src/lib/rate-limit.ts`)
- ตอบ **429** พร้อม header `Retry-After`, `X-RateLimit-*` และบันทึก SecurityEvent
- ⚠️ ถ้า scale หลายอินสแตนซ์ → เปลี่ยน store เป็น Redis (คง interface `checkRateLimit` เดิม)

### Bot Pattern Detection
- ตั้งธงเมื่อ: (1) action ติดกัน ≥ 6 ครั้งห่างกัน < 250ms (`FAST_ACTIONS`) หรือ (2) จังหวะคงที่ jitter ≤ 20ms ต่อเนื่อง 12 ครั้งด้วย interval สั้น (`UNIFORM_CADENCE`)
- ผล: ตอบ 429 + SecurityEvent `BOT_PATTERN` (severity MEDIUM)
- ใช้กับ `POST /api/discover` ตอนนี้ (endpoint สร้างมูลค่าหลัก) — ขยายได้ง่ายด้วย `recordAction()`

### Alt-account Fingerprinting
- Client ส่ง header `x-device-id` (แนะนำ: hash ของ UA+screen+hardware ฝั่ง frontend — ไม่ใช่ข้อมูลส่วนบุคคล)
- เก็บ `signupIp / signupDeviceId / lastIp / lastDeviceId` ในตาราง `users`
- สมัคร/ล็อกอินด้วย device เดียวกับบัญชีอื่น → SecurityEvent `ALT_ACCOUNT_SUSPECT`
- หมายเหตุ: ไม่บล็อกอัตโนมัติ (LAN NAT ทำให้ IP ซ้ำเป็นเรื่องปกติ) — เป็นสัญญาณให้ Admin ตรวจ

### Battle Replay Verification
- ตอนสร้าง battle (simulate / arena challenge) จะเก็บ `teams: { A, B }` snapshot + `seed` ใน `battleData`
- `GET /api/battle/:id/replay` จะ **re-simulate** แล้วเทียบ: winner, roundsPlayed, HP คงเหลือ, battle log ทั้งก้อน
- ผลลัพธ์ 3 แบบ: `VERIFIED` / `TAMPERED` (→ SecurityEvent severity HIGH) / `UNVERIFIABLE` (battle เก่าก่อน Phase 10 หรือ combatVersion ต่างกัน)
- Battle ที่สร้างก่อน Phase 10 จะได้ `UNVERIFIABLE` — ไม่ถือว่าผิด แค่ตรวจไม่ได้

### CORS
- ค่าเริ่มต้น: **same-origin เท่านั้น** (app ใช้ session cookie แบบ same-site)
- อนุญาตเพิ่มผ่าน env `CORS_ALLOWED_ORIGINS` (คั่น comma) — preflight ตอบ 204/403

### Security Headers
- `Content-Security-Policy`: default-src 'self'; img-src รวม `https:` (สำหรับภาพ AI); script มี 'unsafe-inline' (จำเป็นของ Next.js hydration) และ 'unsafe-eval' เฉพาะ dev (HMR)
- `Strict-Transport-Security` เปิดเมื่อ NODE_ENV=production
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`

### Input Validation (Zod)
- ทุก API ที่รับ body ผ่าน `parseJsonBody(request, schema)` — ไม่ผ่านตอบ 400 พร้อม path ที่ผิด
- ชื่อห้อง: จำกัด 60 ตัวอักษร + กรองคำหยาบ (ไทย/อังกฤษ) ใน `validateRoomName` (services/arena.ts)
- SQL Injection: Prisma จัดการ (parameterized) — **ไม่มี** `$queryRaw/$executeRaw` ในโค้ดเลย
- XSS: React escape อัตโนมัติ + **ไม่มี** `dangerouslySetInnerHTML` + CSP รองรับ

---

## 3. Security Audit Log

### ตาราง `security_events` (SecurityEvent)
| ฟิลด์ | คำอธิบาย |
|---|---|
| type | `RATE_LIMIT_BLOCKED` / `BOT_PATTERN` / `ALT_ACCOUNT_SUSPECT` / `REPLAY_TAMPERED` / `AUTH_FAILURE_SPIKE` / `CORS_BLOCKED` |
| severity | `LOW` / `MEDIUM` / `HIGH` |
| userId / ip / deviceId | ใคร จากไหน |
| detail | JSON รายละเอียด (endpoint, reason, mismatches ฯลฯ) |

- ดูได้ผ่าน **GET /api/admin/security** (เฉพาะ ADMIN/MODERATOR): `?page=1&limit=20&type=BOT_PATTERN`
- Admin actions ยังบันทึกใน `admin_action_logs` ตาม Phase 9 (before/after ครบ)

---

## 4. Penetration Test เบื้องต้น (ผลการทดสอบอัตโนมัติ)

รัน: `npm test` — ชุดเทสความปลอดภัยอยู่ใน `tests/unit/`

| # | การทดสอบ | เทส | ผล |
|---|---|---|---|
| 1 | Rate limit บล็อกเมื่อเกินโควตา + reset หลังพ้น window | `rate-limit.test.ts` | ✅ |
| 2 | Rate limit แยก identity (user/device/ip) ไม่ชนกัน | `rate-limit.test.ts` | ✅ |
| 3 | Bot detection: ยิงเร็ว / cadence คงที่ → ตั้งธง | `anti-cheat.test.ts` | ✅ |
| 4 | Bot detection: ไม่ false positive กับการใช้งานมนุษย์/cron | `anti-cheat.test.ts` | ✅ |
| 5 | Replay verification: แก้ winner/HP/log → จับได้ | `battle-verify.test.ts` | ✅ |
| 6 | CORS: origin แปลกปลอม → 403 / same-origin → ผ่าน | `cors.test.ts` | ✅ |
| 7 | Validation: payload พิษ (ทศนิยม, สตริง, เกินขอบ, path ผิด) → 400 | `validation.test.ts` | ✅ |
| 8 | Auth: กัน user enumeration (ตอบข้อความเดียวกัน) | มีตั้งแต่ Phase 0 | ✅ |

### Checklist ที่ตรวจด้วย manual (ก่อน launch)
- [ ] รัน `docker compose up` แล้วยิง 429 จริงด้วย load tool (เช่น `hey -n 200 -c 10`)
- [ ] ยิง SQLi payload ใส่ search fields (`' OR 1=1 --`) → ต้องไม่ error/leak
- [ ] ยิง XSS payload ใส่ displayName/ชื่อห้อง → ต้อง render เป็น text
- [ ] ตรวจว่า replay ของ battle เก่าตอบ `UNVERIFIABLE` ไม่ crash
- [ ] ทดสอบล็อกอินผิด 11 ครั้งติด → ต้องโดน 429 + มี SecurityEvent
- [ ] ตรวจ cookie: `httpOnly`, `sameSite=lax`, `secure` บน HTTPS จริง

---

## 5. ข้อจำกัดที่ยอมรับ (Accepted Risks)

1. **Rate limit store อยู่ใน memory** — รีสตาร์ทแล้วนับใหม่, หลายอินสแตนซ์ไม่แชร์โควตา (แก้ด้วย Redis เมื่อ scale)
2. **CSP ยังมี 'unsafe-inline'** — จำเป็นของ Next.js แบบไม่ทำ nonce-based CSP; ปรับเป็น nonce ได้ในอนาคต
3. **`x-device-id` เชื่อตาม client ที่ส่งมา** — ปลอมได้ แต่ต้องตั้งใจ (ใช้เป็นสัญญาณ ไม่ใช่หลักฐานเด็ดขาด)
4. **`images.remotePatterns` เปิด `hostname: '**'`** — จำเป็นชั่วคราวสำหรับภาพ AI จาก external URL; ควร whitelist โดเมนเมื่อรู้ provider ชัดเจน
5. **Alt-account ไม่บล็อกอัตโนมัติ** — เพื่อลด false positive บน LAN NAT; Admin ตัดสินจาก SecurityEvent

---

## 6. การรายงานช่องโหว่

พบช่องโหว่ → รายงานที่ repo issue พร้อม label `security` — **อย่า**เปิดเผยรายละเอียดสาธารณะก่อนแก้เสร็จ


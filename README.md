# Rune Dominion Arena

Fantasy Trading Card Game / Auto Battle / Competitive Arena — เกมแนวสะสมการ์ด
ที่ผู้เล่น "ถอดรหัสรูน" เพื่อค้นพบการ์ดแบบ deterministic แล้วจัดทีม 5 ใบเข้าอารีน่า

> สถานะ: **Phase 0–12 เสร็จครบทุกข้อ** ตาม [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md)

## หลักฐานการทำงานจริง (2026-09-21 — เครื่องนี้)

| การตรวจ | คำสั่ง | ผล |
|---|---|---|
| Unit/Integration tests | `npm test` | **260 passed / 21 suites** |
| Type check | `npx tsc --noEmit` | ผ่าน (exit 0) |
| Production build | `npm run build` | ผ่าน — 26 หน้า · shared JS 87.3 kB · middleware 28.1 kB |
| E2E critical flow (local) | `npm run e2e:flow` | **31/31 ผ่าน** |
| E2E critical flow (ผ่าน tunnel สาธารณะ) | `npm run e2e:flow -- --base https://…trycloudflare.com` | **25/25 ผ่าน** |
| Load test 120 ผู้ใช้ | `npm run load-test -- --users 120 --duration 10` | 6,679 คำขอ · ให้บริการ 197.9 req/s · success 100% · p95 795ms (ส่วนที่เหลือ 429 = rate limit ต่อ IP ทำงานถูกต้อง) |
| Backup + restore จริง | `npm run backup && npm run backup:verify` | 30 ตาราง · checksum ตรง · restore สำเร็จ |

## ฟีเจอร์เด่น (Phase 13)

| ฟีเจอร์ | รายละเอียด |
|---|---|
| การ์ดเริ่มต้น 5 ใบ | ผู้เล่นใหม่ได้การ์ด 5 ใบตอนสมัคร (เลือกให้จัดทีมได้จริง — ธาตุเดียวกันไม่เกิน 3 ใบ) → ลงทีมได้ทันที · บัญชีเก่าเติมได้ด้วย `npm run db:grant-starter` |
| ใบซ้ำ = อีกใบ | ค้นพบการ์ดใบเดิม → ได้อีกใบ นับเป็น ×2, ×3 (คอลัมน์ `user_cards.quantity`) แสดงในหน้าการ์ด/คอลเลกชัน/modal |
| เพิ่มลงทีมได้จริง | ปุ่ม "เพิ่มลงทีม" (หน้าเปิดการ์ด + หน้ารายละเอียด) เติมเข้าทีมเดิมหรือสร้างทีมใหม่ให้แล้วพาไปหน้าจัดทีม (`POST /api/decks/quick-add`) |
| ล้างรูนอัตโนมัติ | ถอดรหัสสำเร็จ → กระดานรูนว่างทันที พร้อมค้นรอบใหม่ |
| งานศิลป์หลากหลาย | ภาพการ์ดเป็น SVG หลายชั้น 6 ฉาก × 6 ลายธาตุ × 6 ตราบทบาท + ฝุ่นแสง + กรอบตามระดับ (การ์ดคนละใบภาพคนละแบบ แต่ใบเดิมภาพเดิมเสมอ) |
| ชื่อการ์ดหลากหลาย | ชื่อไทย "ชื่อเฉพาะ + ฉายาบทบาท/ธาตุ" และชื่ออังกฤษ `Name, Epithet Title` + คำนำหน้าตามระดับ rarity (มหา/ราชัน/เทวะ) · การ์ดเดิมรีเฟรชชื่อได้ด้วย `npm run db:refresh-meta` |

## Getting Started

### สิ่งที่ต้องมี

- Node.js 18.17+ (ทดสอบจริงด้วย Node 22)
- PostgreSQL 14+ (เครื่องนี้ใช้ PostgreSQL 18.6 portable ที่ `~/pg-portable`)
- Docker **ไม่จำเป็น** — `docker-compose.yml` มีไว้ให้ผู้ที่อยากรัน Postgres ในคอนเทนเนอร์

### โหมดพัฒนา (dev)

```bash
npm install
cp .env.example .env            # ตั้ง DATABASE_URL / AUTH_SECRET / SERVER_PEPPER
npm run db:generate
npx prisma migrate deploy       # ใช้ migrate dev แทนเมื่อกำลังแก้ schema
npm run db:seed                 # สร้างการ์ด 100 ใบ + เควสต์ตั้งต้น
npm run dev                     # http://localhost:3000
```

### โหมด production บนเครื่องนี้ (systemd user service)

```bash
cp deploy/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now rune-dominion-postgres rune-dominion-arena
npm run tunnel                  # (ทางเลือก) เปิด public URL + ส่งลิงก์เข้า Telegram
```

- App: `http://localhost:3000` (รันด้วย `next start`, `NODE_ENV=production`)
- Postgres: PostgreSQL 18.6 portable ที่ `~/pg-portable` พอร์ต 5432
- Public URL (เมื่อเปิด tunnel): `~/.rune-dominion-tunnel/url.txt`
- runbook / rollback / migration: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

## Tech Stack (ตรงกับโค้ดจริง)

| ชั้น | ที่ใช้จริง | หมายเหตุ |
|---|---|---|
| Framework | Next.js 14 (App Router) + React 18 | ทุกหน้าอยู่ใน `src/app` |
| ภาษา | TypeScript strict | `tsc --noEmit` ผ่านเป็นเกณฑ์ CI |
| Database | PostgreSQL + Prisma 5 | 29 ตาราง · `prisma/migrations/0_init` เป็น baseline |
| Validation | Zod (`src/lib/validation.ts`) | ทุก API ที่รับ body ต้อง parse ก่อนใช้ |
| Auth | JWT HS256 (Node `crypto`) + cookie `rda_session` + scrypt hash | ไม่ใช้ NextAuth |
| UI | Tailwind CSS + component ของเราเอง (`src/components/ui/*`) | ไม่ใช้ shadcn/ui |
| State/Data | React state + `src/lib/api-client.ts` | ไม่ใช้ Zustand/TanStack Query |
| Queue/งานเบื้องหลัง | ตาราง `image_jobs` (DB-backed) + webhook | ไม่ใช้ Redis/BullMQ (single instance) |
| เสียง | Web Audio API สังเคราะห์ใน `src/lib/sfx.ts` | ไม่มีไฟล์เสียง/License |
| เทสต์ | Jest + ts-jest (unit/route) · `scripts/e2e-flow.mjs` (E2E ยิง HTTP จริง) | Playwright ไม่ได้ติดตั้ง (แทนด้วย E2E ผ่าน API) |

## โครงสร้างโปรเจกต์

```
src/
├── app/
│   ├── (auth)/            login, register
│   ├── (game)/            discover · cards · decks · battle · arena · quests · wallet · events · inventory · settings
│   ├── admin/             จัดการผู้ใช้/การ์ด/เควสต์/ภาพ/ความปลอดภัย
│   └── api/               REST API ทั้งหมด (ดู docs/API.md)
├── components/            ui · layout · cards · rune · battle · arena · events · providers
├── lib/                   session · validation · rate-limit · anti-cheat · logger · cors · sfx · request-context
└── services/              seed · discovery · deck · combat-engine · battle-verify · arena · wallet · quest · event · image
deploy/systemd/            unit files สำหรับรันถาวร (postgres · arena · tunnel)
scripts/                   e2e-flow · audit-plan · load-test · backup-db · verify-backup · start-tunnel
prisma/                    schema.prisma · migrations/0_init · seed.ts
```

## สคริปต์ที่มีให้

| คำสั่ง | หน้าที่ |
|---|---|
| `npm run dev` / `build` / `start` | รัน dev · build production · รัน production |
| `npm test` | unit + route tests (Jest) |
| `npm run e2e:flow` | E2E critical flow: Discovery → Deck → Battle → Arena → Quest (ยิง HTTP จริง) |
| `npm run audit` | ตรวจว่าแผนพัฒนามีหลักฐานในโค้ดจริงกี่ข้อ |
| `npm run load-test -- --users 120` | ทดสอบภาระ (ไม่ต้องติดตั้ง k6) |
| `npm run backup` / `backup:verify` | สำรอง DB + ทดสอบ restore เข้า DB ชั่วคราว |
| `npm run migrate:check` / `migrate:test` | ตรวจ drift ของ migration / ทดสอบ `migrate deploy` บน DB เปล่า |
| `npm run tunnel` | เปิด Cloudflare quick tunnel + แจ้งลิงก์เข้า Telegram |
| `npm run db:seed` / `db:studio` | seed การ์ด+เควสต์ / เปิด Prisma Studio |
| `npm run db:refresh-meta` | รีเฟรชชื่อ/คำอธิบาย/lore ของการ์ดเดิมตามคลังคำใหม่ (ไม่แตะค่า gameplay) · `-- --dry` เพื่อดูก่อน |
| `npm run admin:grant -- --list` | ดูว่าใครเป็น ADMIN/MODERATOR (ค่าเริ่มต้นของทุกคนคือ PLAYER) |
| `npm run admin:grant -- <username> [ADMIN\|MODERATOR\|PLAYER]` | ตั้ง/ถอดสิทธิ์ผู้ดูแลระบบ (ตั้งจาก server เท่านั้น — สมัครเองไม่ได้) |
| `npm run db:grant-starter` | เติมการ์ดเริ่มต้นให้บัญชีที่มีในคลังไม่ครบ 5 ใบ · `-- --dry` เพื่อดูก่อน |

## Environment Variables

| ตัวแปร | จำเป็น | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `AUTH_SECRET` | ✅ | ใช้เซ็น session JWT — production ต้องสุ่มใหม่ ≥32 ตัวอักษร |
| `SERVER_PEPPER` | ✅ | ผสมตอน hash seed ของรูน — **เปลี่ยนแล้วการ์ดเดิมจะ hash ไม่ตรง** |
| `NEXT_PUBLIC_APP_URL` | — | URL ที่ใช้แสดง/แชร์ (ค่าเริ่มต้น `http://localhost:3000`) |
| `CORS_ALLOWED_ORIGINS` | — | origin เพิ่มเติม (คั่นด้วย comma) — ไม่ตั้ง = same-origin เท่านั้น |
| `LOG_LEVEL`, `SLOW_REQUEST_MS` | — | ระดับ log / เกณฑ์เตือน slow request |
| `AI_IMAGE_API_KEY`, `AI_IMAGE_API_URL` | — | ต่อผู้ให้บริการสร้างภาพ (ไม่ตั้ง = ใช้ SVG placeholder) |
| `WORKER_TOKEN` | — | token สำหรับ cron เรียก `/api/admin/images/*` |
| `REDIS_URL` | — | เลิกใช้โดยเจตนา (คงไว้ใน `.env.example` เพื่อความเข้ากันได้) |

## กฎการพัฒนา

1. TypeScript strict — ไม่มี `any`
2. Currency เป็น **integer** เท่านั้น (ห้าม float)
3. การคำนวณสำคัญ (combat / discovery / reward) ทำฝั่ง server เท่านั้น
4. ห้ามใช้ `Math.random()` ในระบบสำคัญ — ใช้ deterministic seed
5. Endpoint ที่กระทบ Currency ต้อง idempotent
6. UI เป็นภาษาไทย + mobile-first

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [`docs/API.md`](docs/API.md) | รายการ endpoint · rate limit · ตัวอย่าง curl |
| [`docs/PLAYER_GUIDE_TH.md`](docs/PLAYER_GUIDE_TH.md) | คู่มือผู้เล่นภาษาไทย (เริ่มได้ใน 3 นาที) |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | pipeline · env · runbook · rollback · backup · systemd · tunnel |
| [`docs/ERROR_AND_LOADING.md`](docs/ERROR_AND_LOADING.md) | error boundary · skeleton · แนวทางแอนิเมชัน |
| [`SECURITY.md`](SECURITY.md) | สถาปัตยกรรมความปลอดภัย 8 ชั้น + accepted risks |
| [`docs/MARKETING_ASSETS.md`](docs/MARKETING_ASSETS.md) | รายการภาพ/วิดีโอ + ข้อความโพสต์ |
| [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md) | แผนพัฒนา Phase 0–12 พร้อมหลักฐาน/ผลทดสอบจริง |

## License

All rights reserved.

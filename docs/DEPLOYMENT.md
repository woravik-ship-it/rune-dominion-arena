# Deployment — Rune Dominion Arena (Phase 12)

## 1. ภาพรวม Pipeline

```
feature branch ──PR──> master ──(CI: typecheck + lint + test)──> Staging ──(smoke test)──> Production
```

| ขั้น | สิ่งที่รัน | เกณฑ์ผ่าน |
|---|---|---|
| CI (`ci.yml`) | `prisma generate` → `tsc --noEmit` → `next lint` → `jest` | ทุกคำสั่ง exit 0 · เทสต์ผ่านทั้งหมด |
| Load test | `npm run load-test -- --users 120` | success rate ≥99% · p95 < 1500ms · ไม่มี error |
| Smoke test | `curl /api/health` → `status: ok` · เปิดหน้าแรกได้ | `200` + DB ok |
| Backup | `npm run backup` → `npm run backup:verify` | checksum ตรง · restore เข้า DB ชั่วคราวได้ |

> เกณฑ์ปัจจุบัน (เครื่อง dev 12 cores): **138 req/s ที่ให้บริการได้จริง, success 100%, p95 106ms**

## 2. Environment ที่ต้องตั้ง

| ตัวแปร | Staging | Production |
|---|---|---|
| `DATABASE_URL` | Postgres แยกจาก prod | Postgres ของ prod (สำรองก่อน migrate) |
| `AUTH_SECRET` | ค่าเฉพาะ staging | **สุ่มใหม่ ≥32 ตัวอักษร** |
| `SERVER_PEPPER` | ค่าเฉพาะ staging | **สุ่มใหม่** — ⚠️ เปลี่ยนแล้วการ์ดเดิมจะคำนวณ hash ไม่ตรง |
| `NODE_ENV` | `production` | `production` |
| `CORS_ALLOWED_ORIGINS` | โดเมน staging | โดเมนจริง (ไม่ตั้ง = same-origin เท่านั้น) |
| `LOG_LEVEL` | `debug` | `info` |
| `SLOW_REQUEST_MS` | 1000 | 500 |
| `USER_ID_FALLBACK` | ห้ามตั้ง | **ห้ามตั้งเด็ดขาด** |

## 3. ขั้นตอน Deploy (manual runbook)

```bash
# 0) เตรียม
git checkout master && git pull
npm ci

# 1) สำรองก่อนแตะ DB (สำคัญที่สุด)
npm run backup && npm run backup:verify

# 2) อัปเดต schema (migration-based — ตรวจก่อนใช้จริง)
npm run migrate:check      # ตรวจว่า migration ตรงกับ schema (ไม่มี drift)
npm run migrate:test       # ทดสอบ migrate deploy บน DB เปล่า (จำลอง production)
npx prisma migrate deploy  # ใช้กับ DB จริง (ไม่ใช่ db push)
npx prisma generate

# 3) ตรวจสอบคุณภาพ
npx tsc --noEmit && npm run lint && npm test

# 4) Build + start
npm run build
npm run start                  # หรือ systemd/pm2

# 5) Smoke test
curl -s localhost:3000/api/health | grep '"status":"ok"'
npm run load-test -- --users 60 --duration 10
```

### Migration (baseline)

โปรเจกต์นี้เริ่มจาก `db push` จึงมี **baseline migration** ชื่อ `0_init` (สร้างจาก schema ปัจจุบันและตรวจแล้วว่าไม่มี drift):

```bash
# DB ที่มีข้อมูลอยู่แล้วและยังไม่มี _prisma_migrations → baseline ครั้งเดียว
npx prisma migrate resolve --applied 0_init

# หลังจากนั้นทุกการเปลี่ยน schema
#   1) แก้ prisma/schema.prisma
#   2) สร้าง migration ใหม่:  npx prisma migrate dev --name <ชื่อ>
#   3) deploy:                npx prisma migrate deploy
```

> ⚠️ `db push` ใช้ได้เฉพาะ dev — บน production ต้อง `migrate deploy` เพื่อมีประวัติและ rollback ได้

## 4. Rollback

```bash
# กรณีโค้ดมีปัญหา
git revert <commit> && npm run build && npm run start

# กรณีข้อมูลเสียหาย — กู้จาก backup
gunzip -c ~/backups/rune-dominion/rune_dominion-<STAMP>.sql.gz | psql "$DATABASE_URL"
npx prisma generate && npm run start
```

**หลัก:** สำรอง **ก่อน** ทุกครั้งที่แตะ schema — และตรวจว่า restore ได้จริงด้วย `npm run backup:verify`

## 5. Backup Strategy

| หัวข้อ | ค่า |
|---|---|
| ความถี่ที่แนะนำ | ทุกวัน 03:00 (cron) + ก่อน deploy ทุกครั้ง |
| เก็บย้อนหลัง | 7 วัน (ปรับ `KEEP_DAYS`) |
| ที่เก็บ | `~/backups/rune-dominion` (ควรเป็นดิสก์/เครื่องอื่นด้วย) |
| การตรวจสอบ | checksum (sha256) + restore เข้า DB ชั่วคราวอัตโนมัติ |
| ตัวอย่าง cron | `0 3 * * * cd /path/to/app && npm run backup >> /var/log/rda-backup.log 2>&1` |

## 6. CDN สำหรับ Static Assets (Next.js)

- `next.config.js` ตั้ง `Cache-Control: public, max-age=604800, immutable` ให้ `/images` และ `/sounds` แล้ว
- รูปการ์ดเป็น deterministic SVG จาก `/api/cards/[id]/image` → ตั้ง CDN cache ตาม `Cache-Control` ได้
- เมื่อมีผู้ให้บริการจริง: ชี้ `AI_IMAGE_API_URL` ไปที่ storage (S3/R2) แล้วใส่ `remotePatterns` เพิ่มใน `next.config.js`

## 7. Monitoring ที่มีในระบบ

| กลไก | รายละเอียด |
|---|---|
| `GET /api/health` | uptime + DB latency + version → ใช้กับ uptime checker (คืน 503 เมื่อ DB ล่ม) |
| Structured log | JSON 1 บรรทัด/คำขอ พร้อม `requestId`, `durationMs`, `status` |
| Slow request | เกิน `SLOW_REQUEST_MS` → `level: "warn"`, `msg: "slow_request"` |
| Security events | ตาราง `security_events` (rate limit, bot pattern, alt account, replay tamper) |
| Admin action log | ตาราง `admin_action_logs` (before/after ทุก action) |
| Client error | error boundary แสดง digest + `console.error` (พร้อมต่อ Sentry) |

**การค้นหาปัญหา:** เอา `x-request-id` จาก response (หรือรหัส digest บนหน้าจอ error) ไป grep ใน log

## 8. รันถาวรบนเครื่องนี้ (systemd user service)

unit files ถูกเก็บใน repo ที่ `deploy/systemd/` — ติดตั้งด้วย:

```bash
cp deploy/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now rune-dominion-postgres rune-dominion-arena
```

| Unit | หน้าที่ | หมายเหตุ |
|---|---|---|
| `rune-dominion-postgres.service` | PostgreSQL 18.6 portable (`~/pg-portable`, พอร์ต 5432) | ตั้ง `LD_LIBRARY_PATH=~/pg-portable/lib` ให้เอง · `KillSignal=SIGINT` = fast shutdown |
| `rune-dominion-arena.service` | `next start` โหมด production (พอร์ต 3000) | โหลด `.env` แล้วทับด้วย `NODE_ENV=production`, `LOG_LEVEL=info`, `SLOW_REQUEST_MS=500` |
| `rune-dominion-tunnel.service` | Cloudflare quick tunnel → HTTPS สาธารณะ | รอ `/api/health` ตอบก่อน · ส่งลิงก์เข้า Telegram · `PartOf` ทำให้ restart ตามแอป |
| `rune-dominion-images.service` | worker สร้างภาพการ์ดด้วย AI (วนต่อเนื่องจนครบ) | ผู้ให้บริการฟรีกักคิว 1 งาน/IP → ตั้ง `DELAY`/`PAUSE_BETWEEN_ROUNDS` · restart อัตโนมัติ |

```bash
# ตรวจสถานะ/ล็อก
systemctl --user status rune-dominion-arena
journalctl --user -u rune-dominion-arena -f
curl -s localhost:3000/api/health | grep '"status":"ok"'

# รีสตาร์ทหลัง deploy (tunnel จะรีสตาร์ทตามเอง)
systemctl --user restart rune-dominion-arena
```

### Tunnel สาธารณะ

```bash
npm run tunnel               # เท่ากับ scripts/start-tunnel.sh
cat ~/.rune-dominion-tunnel/url.txt   # URL ปัจจุบัน
```

> ⚠️ quick tunnel เป็น URL ชั่วคราว — **เปลี่ยนทุกครั้งที่รีสตาร์ท** และไม่ควรใช้เป็น production จริงระยะยาว
> ถ้าต้องการโดเมนคงที่ ให้ใช้ named tunnel + DNS ของโดเมนตัวเอง หรือย้ายขึ้น host ที่มี HTTPS ให้

### หลักฐานการรันจริง (2026-09-21, เครื่องนี้)

| การตรวจ | ผล |
|---|---|
| `npm test` | 232 passed / 20 suites |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | ผ่าน (26 หน้า · shared JS 87.3 kB) |
| `npm run e2e:flow` (localhost) | **25/25 ผ่าน** |
| `npm run e2e:flow --base <public URL>` | **25/25 ผ่าน** (ผ่าน Cloudflare) |
| `npm run backup` | 30 ตาราง · gzip/checksum ผ่าน |
| `npm run load-test -- --users 120 --duration 10` | 197.9 req/s ที่ให้บริการ · success 100% · p95 795ms (429 = rate limit ต่อ IP) |
| `/api/health` ผ่าน tunnel | `{"status":"ok", database ok}` |

### การสร้างภาพการ์ดด้วย AI (Phase 14)

```bash
npm run images:generate                 # เฉพาะการ์ดที่ยังไม่มีภาพ
npm run images:generate -- --all        # สร้างใหม่ทุกใบ
bash scripts/run-image-generation.sh    # วนต่อเนื่องจนครบ (แนะนำสำหรับผู้ให้บริการฟรี)
```

- ค่าเริ่มต้นใช้ **pollinations** (`AI_IMAGE_PROVIDER=pollinations`) — ฟรี ไม่ต้องมี key, โมเดล `sana` (~1–3 วิ/ใบ) หรือ `flux` (สวยกว่า แต่ ~30 วิ/ใบ)
- ⚠️ ผู้ให้บริการฟรีกักคิว **1 งาน/IP** → ตั้ง `--delay` ให้พอเหมาะ (ค่าเริ่มต้น 1.2–4 วิ) และรันเป็นงานเบื้องหลัง
  - ถ้าเจอ `429 Queue full` ให้รอ (สคริปต์ retry ให้เอง) — และตรวจว่าไม่ได้รันหลายโปรเซสพร้อมกัน (จะแย่งคิวกันเอง)
  - เครื่องที่ต่อ dual-stack แล้วค้างที่ IPv6: โค้ดตั้ง `dns.setDefaultResultOrder('ipv4first')` ให้แล้ว
- สลับไปผู้ให้บริการที่มี key (คุณภาพ/ความเร็วสูงกว่า): `AI_IMAGE_PROVIDER=generic`, `AI_IMAGE_API_URL=<endpoint>`, `AI_IMAGE_API_KEY=<key>`
- ไฟล์ภาพเก็บที่ `var/card-art/` (gitignored) และเสิร์ฟผ่าน `/api/cards/[id]/art` · การ์ดที่ยังไม่มีภาพจะแสดงการ์ดวาดเอง (SVG) แทนโดยอัตโนมัติ

### ข้อจำกัดที่ควรรู้ก่อนเปิดสาธารณะ

- **บัญชีผู้ดูแลระบบ:** ผู้สมัครทุกคนได้ role `PLAYER` — ตั้งสิทธิ์จาก server ด้วย `npm run admin:grant -- <username>` (ดู `docs/API.md` §11) แล้วล็อกอินใหม่ 1 ครั้ง
- Rate limit และ anti-cheat เก็บในหน่วยความจำของโปรเซส (single instance) — ขยายหลายอินสแตนซ์ต้องย้ายไป Redis
- ยังไม่มี Sentry — ได้แค่ structured log + `x-request-id` + digest บนหน้า error
- `/api/arena/settle` เปิดให้เรียกได้โดยไม่มี auth (ออกแบบให้ scheduler เรียก) — ถ้าเปิดสาธารณะควรจำกัดที่ network/secret
- ภาพการ์ดยังเป็น SVG placeholder (Phase 8 รอต่อผู้ให้บริการ AI image)

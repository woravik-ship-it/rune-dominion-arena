# Rune Dominion Arena — API Reference

> อัปเดตล่าสุด: Phase 12 (2026-09-21) · 46 endpoints
> ทุก endpoint อยู่ใต้ `/api` และตอบ JSON

## หลักการทั่วไป

| หัวข้อ | รายละเอียด |
|---|---|
| **Identity** | API ยึด **session cookie** (`rda_session`) เป็นหลัก — client ไม่ต้องส่ง `userId` |
| **Fallback** | ส่ง `userId` (cuid หรือ username) ได้สำหรับ CLI/เทสต์/แอดมิน — session ยังชนะเสมอ |
| **ไม่มี identity** | ตอบ `401 { "error": "ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ" }` |
| **Rate limit** | 429 + header `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` |
| **Request id** | ทุก response มี header `x-request-id` (ใช้ correlate log) |
| **Validation** | Zod ทุก body/query — ผิดรูปแบบตอบ `400` พร้อมระบุ path |
| **Idempotency** | endpoint ที่กระทบเงิน/รางวัลรับ `idempotencyKey` (ยิงซ้ำได้ผลเดิม) |
| **Currency** | Coin และ Veil Shards เป็น **integer** เท่านั้น |

### รูปแบบ response

```jsonc
// สำเร็จ
{ "success": true, "data": { /* ... */ } }
// ล้มเหลว
{ "error": "ข้อความภาษาไทย" }              // 400/401/403/404/429/500
{ "success": false, "message": "..." }     // business rule (เช่น ยังไม่ถึงเกณฑ์)
```

### Rate limit scopes (ค่าเริ่มต้น)

| Scope | ใช้ที่ | Limit |
|---|---|---:|
| `API_BURST` | ทุก `/api` (per IP, middleware) | 120/นาที |
| `DISCOVER` | `POST /api/discover` | 30/นาที |
| `AUTH_LOGIN` | `POST /api/auth/login` | 10/นาที |
| `AUTH_REGISTER` | `POST /api/auth/register` | 10/นาที |
| `BATTLE` | `POST /api/battle/simulate` | 30/นาที |
| `ARENA_CREATE` / `ARENA_JOIN` / `ARENA_CHALLENGE` | อารีน่า | 10 / 20 / 30 ต่อนาที |
| `DECK_WRITE` | สร้าง/แก้เด็ค | 30/นาที |
| `QUEST_CLAIM` | รับรางวัลภารกิจ | 30/นาที |
| `CARD_FAVORITE` | ปักหมุดการ์ด | 60/นาที |

ปรับได้ผ่าน env `RATE_LIMIT_<SCOPE>_LIMIT`

---

## 1. System

### `GET /api/health`
Uptime + สถานะ DB (ไม่ต้องล็อกอิน)

```json
{ "status": "ok", "version": "beta", "environment": "development",
  "uptimeSeconds": 120, "timestamp": "2026-09-21T03:00:00.000Z",
  "checks": { "database": { "ok": true, "detail": "3ms" } } }
```
- `200` ปกติ · `503` เมื่อ DB ใช้ไม่ได้ (`status: "degraded"`)

---

## 2. Auth

### `POST /api/auth/register`
```jsonc
// body
{ "username": "player1", "email": "me@test.local", "password": "testpass123", "displayName": "ผู้กล้า" }
```
- กติกา: username `a-z A-Z 0-9 _` 3–20 ตัว · password ≥ 8 ตัว
- `201` + set cookie `rda_session` (HttpOnly, SameSite=Lax, Secure เมื่อ HTTPS)
- `409` ชื่อผู้ใช้/อีเมลซ้ำ

## 3. Discovery / Card

### `POST /api/discover` — ถอดรหัสรูน
```jsonc
{ "runes": [101,202,303,404,505,606,707,808], "idempotencyKey": "uuid-optional" }
```
- `runes`: 8–16 จำนวนเต็ม 0–9999 (ตำแหน่งบนกริด 100×100) — **ลำดับมีผลต่อการ์ด**
- Deterministic: ลำดับเดิม → `seedHash` เดิม → การ์ดใบเดิมเสมอ
- หักพลังค้นหา 1 (สูงสุด 5/วัน, เติมอัตโนมัติเมื่อขึ้นวันใหม่)
- ตรวจ bot pattern (action เร็ว/จังหวะสม่ำเสมอ) → `429`
- การ์ดใหม่ → เข้าคิวสร้างภาพอัตโนมัติ (`imageStatus: PENDING` → `READY`)

```jsonc
// 200
{ "success": true,
  "card": { "id": "...", "nameTh": "ผู้พิทักษ์ แสง", "element": "DAWNSWORN", "rarity": "EPIC",
            "role": "TANK", "stats": { "atk": 117, "def": 52, "hp": 93, "spd": 20, "manaCost": 6 },
            "skills": [ { "name": "แสงศักดิ์สิทธิ์", "manaCost": 2 } ] },
  "discovery": { "isFirstDiscovery": true, "isDuplicate": false, "seedHash": "a271...", "canonicalString": "version=1|runes=0101,..." },
  "owned": { "quantity": 1 },
  "energy": { "remaining": 4, "max": 5 } }
```
- `400` พลังค้นหาไม่พอ / runes ผิดกติกา · `401` ยังไม่ล็อกอิน
- **ใบซ้ำนับเป็นอีกใบ (Phase 13):** ถอดรหัสได้การ์ดที่ตัวเองมีอยู่แล้ว → `discovery.isDuplicate: true` และ `owned.quantity` เพิ่มขึ้น (×2, ×3, …) ไม่ทิ้งใบซ้ำ

### `GET /api/energy` → `{ "success": true, "energy": { "remaining": 4, "max": 5 } }`

### `GET /api/cards`
Query: `page`, `limit` (≤100), `element`, `rarity`, `search`
```jsonc
{ "success": true, "data": [ { "id", "cardId", "nameTh", "element", "rarity", "role",
  "stats": {...}, "imageUrl", "imageStatus", "obtainedMethod", "isFavorite",
  "quantity": 2 } ],
  "pagination": { "page": 1, "limit": 12, "total": 6, "totalPages": 1 } }
```
- `quantity` = จำนวนใบที่ถือครอง (ค้นพบซ้ำแล้วได้อีกใบ)

### `GET /api/cards/[id]` — รายละเอียดการ์ด + สถิติการค้นพบ
- เพิ่ม `quantity` (ของเรา), `isFavorite`, `ownerCount` (จำนวนผู้เล่นที่ถือการ์ดใบนี้)

### `GET /api/cards/[id]/image`
- `200 image/svg+xml` placeholder แบบ deterministic (ตามธาตุ/rarity) เมื่อยังไม่มีภาพจริง
- ใช้กับ `<img>` ได้ตรง ๆ (`imageUrl` ของการ์ดชี้มาที่นี่เมื่อเจนเสร็จ)

### `POST /api/cards/favorite`
```jsonc
{ "cardId": "...", "isFavorite": true }
```
- `200` · `404` ไม่มีการ์ดนี้ในคอลเลกชัน · ยึด session (ปักหมุดการ์ดคนอื่นไม่ได้)

---

## 4. Deck

### `GET /api/decks` — รายการเด็ค + สล็อต 5 ใบ + `teamPower`
### `POST /api/decks`
```jsonc
{ "name": "ทีมทดสอบ", "description": "optional",
  "slots": [ { "cardId": "...", "position": 0 }, /* ... ครบ 5 ตำแหน่ง 0-4 */ ] }
```
- ต้องเป็นการ์ดที่ตัวเองเป็นเจ้าของทั้งหมด · `400` ถ้าตำแหน่งซ้ำ/ไม่ครบ
- `201` + `{ "data": { "id", "name", "teamPower": 1317 } }`

### `GET /api/decks/[id]` — รายละเอียดเด็ค
### `PUT /api/decks/[id]` — อัปเดต (name/description/isActive/slots) — `403` ถ้าไม่ใช่เจ้าของ
### `DELETE /api/decks/[id]` — ลบเด็ค — `403` ถ้าไม่ใช่เจ้าของ

### `POST /api/decks/quick-add` — "เพิ่มลงทีม" จากการ์ดใบเดียว (Phase 13)
```jsonc
{ "cardId": "..." }
```
พฤติกรรม (เรียงตามลำดับที่ระบบเลือกให้):
1. การ์ดอยู่ในทีมอยู่แล้ว → `200 { "added": false, "reason": "alreadyInDeck" }`
2. มีทีมที่ยังไม่ครบ 5 ใบและเพิ่มได้โดยไม่ผิดกติกา → เติมเข้าทีมนั้น → `201`
3. ไม่มี → สร้างทีมใหม่ 5 ใบจากคลัง (บังคับให้การ์ดใบนี้อยู่ในทีม) → `201 { "created": true }`
4. การ์ดในคลังไม่พอจัดทีม → `400` พร้อมเหตุผล

```jsonc
// 201
{ "success": true,
  "data": { "deckId": "...", "deckName": "ทีมด่วน 2", "added": true, "created": true,
            "filled": 5, "message": "สร้างทีม \"ทีมด่วน 2\" ให้แล้ว (5/5)" } }
```
- `400` ยังไม่มีการ์ดใบนี้ในคลัง · `401` ยังไม่ล็อกอิน · rate limit `DECK_WRITE`

---

## 5. Battle

### `POST /api/battle/simulate`
```jsonc
{ "attackerDeckId": "...", "defenderDeckId": "optional", "bot": true, "idempotencyKey": "optional" }
```
- Server คำนวณทั้งหมด (client ส่งได้แค่ ID) · deterministic ตาม seed
- `400` เด็คไม่ครบ 5 ใบ/ไม่ใช่เจ้าของ · `429` ยิงถี่

```jsonc
{ "success": true, "data": { "battleId": "...", "winner": "A", "roundsPlayed": 7,
  "teamAHpRemaining": 320, "teamBHpRemaining": 0 } }
```

### `GET /api/battle/[id]/log` — log การต่อสู้ทีละ action (`messageTh` ภาษาไทย)
### `GET /api/battle/[id]/replay` — ตรวจสอบความถูกต้องของผล (Phase 10)
```jsonc
{ "success": true, "data": { "verdict": "VERIFIED" | "TAMPERED" | "UNVERIFIABLE", "recomputed": { "winner": "A" } } }
```
- `TAMPERED` → บันทึก SecurityEvent ระดับ HIGH

### `POST /api/auth/login`
```jsonc
{ "identifier": "player1", "password": "testpass123" }   // identifier = username หรือ email
```
- `200` + set cookie · `401` รหัสผิด · ล็อกอินผิดซ้ำ ๆ → `429` + SecurityEvent `AUTH_FAILURE_SPIKE`

### `POST /api/auth/logout` — ล้าง cookie (`200`)

### `GET /api/auth/me` — ผู้ใช้ปัจจุบัน + กระเป๋า
```json
{ "success": true, "data": { "user": { "id": "...", "username": "player1", "role": "PLAYER", "discoveryEnergy": 5 },
  "wallet": { "balance": 100, "totalEarned": 100, "totalSpent": 0 } } }
```

---

## 6. Arena (ห้องแข่ง 24 ชั่วโมง)

### `GET /api/arena` — รายการห้องที่ยังไม่หมดอายุ (86400 วิ)
### `POST /api/arena/create`
```jsonc
{ "name": "ห้องทดสอบ", "deckId": "...", "idempotencyKey": "optional" }
```
- ค่าเปิดห้อง **30 Coin** · ชื่อห้องกรองคำไม่เหมาะสม · ห้องหมดอายุใน 24 ชม.
- `400` Coin ไม่พอ · `429` เกินโควตาสร้าง

### `GET /api/arena/[id]` — รายละเอียดห้อง + ผู้เข้าร่วม + แชมป์ปัจจุบัน
### `POST /api/arena/[id]/join`
```jsonc
{ "deckId": "...", "idempotencyKey": "optional" }
```
- ค่าเข้า **10 Coin** · จำกัด **20 ครั้ง/วัน/ผู้เล่น**

### `POST /api/arena/[id]/challenge` — ท้าทายแชมป์ (auto battle)
```jsonc
{ "deckId": "...", "idempotencyKey": "optional" }
```
- ชนะ → เป็นแชมป์ใหม่ · `idempotencyKey` ซ้ำ → คืนผลเดิม

### `POST /api/arena/settle` — ปิดห้องและจ่ายรางวัล
- รางวัล = `min(100 + จำนวนผู้เข้าร่วม × 5, 500)` Coin (integer)

---

## 7. Wallet

### `GET /api/wallet` → `{ "balance": 100, "totalEarned": 100, "totalSpent": 0 }`
### `GET /api/wallet/transactions`
Query: `page`, `limit`, `filter=ALL|IN|OUT`
```jsonc
{ "success": true, "data": [ { "id", "amount", "type", "referenceType", "description",
  "balanceBefore", "balanceAfter", "createdAt" } ],
  "pagination": { "page": 1, "limit": 30, "total": 12, "totalPages": 1 } }
```
- ทุกธุรกรรมต้องมี `balanceBefore`/`balanceAfter` (audit ได้) — Coin เป็น integer เท่านั้น

---

## 8. Quest

### `GET /api/quests` — บอร์ดภารกิจ (daily / weekly / achievement / event)
```jsonc
{ "success": true, "data": {
  "daily": [ { "questId", "code", "nameTh", "descriptionTh", "type", "metric",
               "targetValue": 3, "currentValue": 1, "isCompleted": false,
               "rewardClaimed": false, "rewardAmount": 30, "periodKey": "2026-09-21" } ],
  "weekly": [], "achievement": [], "event": [],
  "resets": { "dailyAt": "2026-09-22T17:00:00.000Z", "weeklyAt": "2026-09-27T17:00:00.000Z" } } }
```
- metric ที่นับ: `DISCOVERY`, `BATTLE`, `BATTLE_WIN`, `ARENA_WIN`, `SPEND`
- งวด: รายวัน = เที่ยงคืน · รายสัปดาห์ = ISO week (จันทร์)

### `POST /api/quests/[id]/claim` — รับรางวัล (idempotent)
- `200 { "data": { "rewardAmount": 30, "message": "..." } }`
- `400` ยังไม่ครบเป้า/รับไปแล้ว


---

## 9. Seasonal Event (Phase 11 — "เสียงเรียกจากประตูไร้จันทร์")

### `GET /api/events` — Event Hub (กิจกรรมที่เปิดอยู่)
```jsonc
{ "success": true, "data": {
  "id": "...", "nameTh": "เสียงเรียกจากประตูไร้จันทร์", "status": "ACTIVE",
  "currencyName": "Veil Shards", "msLeft": 1205000000,
  "boss": { "id", "nameTh", "maxHp": 1000000, "currentHp": 993210, "percent": 99,
            "phase": 1, "phaseNameTh": "ผู้เฝ้ารอยแยก", "isDefeated": false },
  "community": { "totalDamage": 25000, "participantCount": 3 },
  "quests": [ ... ], "shopItems": [ ... ],
  "me": { "veilShards": 39, "eventPoints": 7468, "damageDealt": 6790, "raidsToday": 2, "raidDailyCap": 10 } } }
```
- `data: null` เมื่อยังไม่มีกิจกรรมที่เปิด

### `POST /api/events/[id]/raid` — เข้า Boss Raid
```jsonc
{ "bossId": "...", "deckId": "...", "idempotencyKey": "optional" }
```
- ค่าเข้า **10 Veil Shards** · **10 ครั้ง/วัน** · แพ้ได้ participation 2 · ชนะเพิ่ม clear bonus 5
- ดาเมจคำนวณจาก **combat engine จริง (5v5 กับทีมบอสตาม Phase)** — client ส่งความตั้งใจไม่ได้
- ทีม 4 ธาตุขึ้นไป → Event Points **+10%**

```jsonc
// 200
{ "success": true, "data": {
  "damageDealt": 3610, "eventPoints": 3971, "shardsSpent": 10, "shardsEarned": 7,
  "won": false, "elementBonus": false, "bossPhaseBefore": 1, "bossPhaseAfter": 1,
  "mechanics": [ { "noteTh": "Dawn Resonance สลาย Veil Shield (ลดเกราะเหลือ 20%)", "damageMultiplier": 0.8 } ],
  "boss": { "currentHp": 989600, "maxHp": 1000000, "percent": 99, "isDefeated": false },
  "participation": { "veilShards": 39, "eventPoints": 7468, "damageDealt": 6790 },
  "simulation": { "won": false, "roundsPlayed": 5, "teamHpRemaining": 0, "bossTeamHpRemaining": 1335, "seed": "ea17..." } } }
```
- `400` บอสถูกปราบ / Shards ไม่พอ / เด็คไม่ครบ · `429` เกิน 10 ครั้ง/วัน

### `GET /api/events/[id]/milestones` — สถานะ milestone (personal + community)
```jsonc
[ { "id", "scope": "PERSONAL", "tier": 1, "threshold": 2000, "titleTh": "ผู้สัมผัสม่าน",
    "rewardType": "COIN", "rewardAmount": 100, "progress": 7468, "reached": true, "claimed": false } ]
```
### `POST /api/events/[id]/milestones` — รับรางวัล
```jsonc
{ "milestoneId": "..." }
```
- `200` · `400` ยังไม่ถึงเกณฑ์ / รับไปแล้ว (idempotent)
- รางวัล COIN → เข้ากระเป๋า · CARD/COSMETIC/TITLE/CRAFTING_DUST/STORY → เข้าคลัง (`/api/inventory`)

### `GET /api/events/[id]/quests` — บอร์ด event quest + ความคืบหน้าจริง
```jsonc
[ { "questId", "nameTh": "สำรวจรอยแยก", "metric": "RAID", "type": "DAILY",
    "targetValue": 3, "currentValue": 3, "isCompleted": true, "rewardClaimed": false,
    "currencyReward": 5, "coinReward": 30, "periodKey": "2026-09-21" } ]
```
### `POST /api/events/[id]/quests` — รับรางวัล event quest
```jsonc
{ "eventQuestId": "..." }   // → { "claimed": true, "veilShards": 12, "coin": 30, "message": "..." }
```

### `POST /api/events/[id]/shop` — ซื้อของด้วย Veil Shards
```jsonc
{ "itemId": "...", "idempotencyKey": "optional" }
```
- `200 { "data": { "success": true, "message": "ซื้อ \"เครื่องประดับม่าน\" สำเร็จ", "veilShards": 32 } }`
- `400` Shards ไม่พอ / เกินจำกัดต่อผู้ใช้

### `GET /api/events/[id]/story` — บทเนื้อเรื่องตาม community damage
```jsonc
[ { "chapterNo": 1, "titleTh": "รอยแยกเปิดออก", "bodyTh": "...", "unlockAtDamage": 0, "unlocked": true } ]
```

---

## 10. Inventory (Phase 11.3)

### `GET /api/inventory` — ของสะสมของผู้เล่น
```jsonc
{ "success": true,
  "data": [ { "id", "itemType": "COSMETIC", "code": "AVATAR_FRAME", "nameTh": "Avatar Frame: ม่านไร้จันทร์",
              "quantity": 1, "source": "EVENT_MILESTONE:PERSONAL:4", "eventId": "...", "acquiredAt": "..." } ],
  "summary": { "CARD": 1, "COSMETIC": 2, "CRAFTING_DUST": 50 } }
```
- `itemType`: `CARD` | `COSMETIC` | `TITLE` | `CRAFTING_DUST` | `STORY_CHAPTER`
- `source` บอกที่มา: `EVENT_MILESTONE:<scope>:<tier>` หรือ `EVENT_SHOP:<code>`


---

## 11. Admin (ต้องเป็น ADMIN/MODERATOR — ยกเว้นที่มี worker token)

> ทุก endpoint ในกลุ่มนี้ใช้ `isPrivileged(request)` → session role ADMIN/MODERATOR หรือ header `x-worker-token` ตรงกับ `WORKER_TOKEN`
> ทุก action ที่แก้ข้อมูลบันทึกลง `admin_action_logs` (before/after)

**การสร้างผู้ดูแลระบบ:** ค่าเริ่มต้นของผู้สมัครทุกคนคือ `PLAYER` — สมัครเป็นแอดมินเองไม่ได้ (ตั้งใจออกแบบให้ตั้งจากฝั่ง server เท่านั้น)

```bash
npm run admin:grant -- --list                  # ดูว่าใครเป็นอะไรอยู่
npm run admin:grant -- woravik                 # ตั้งเป็น ADMIN
npm run admin:grant -- somchai MODERATOR       # ตั้งเป็น MODERATOR
npm run admin:grant -- woravik PLAYER          # ถอดสิทธิ์
```
- role ถูกฝังใน session JWT ตอนล็อกอิน → **ต้องล็อกอินใหม่** หลังเปลี่ยนสิทธิ์จึงจะมีผล
- หน้าเว็บแผงแอดมินอยู่ที่ `/admin` (layout guard: ถ้าไม่ใช่ ADMIN/MODERATOR จะ redirect กลับหน้าแรก)

| Endpoint | หน้าที่ |
|---|---|
| `GET /api/admin/analytics` | สถิติรวม (ผู้ใช้/การ์ด/การต่อสู้/งานภาพ/ความปลอดภัย) |
| `GET /api/admin/cards` | รายการการ์ดทั้งหมด (pagination/filter) |
| `GET` · `PATCH /api/admin/cards/[id]` | ดู/แก้การ์ด (ชื่อ ภาพ สถานะ) |
| `GET /api/admin/quests` · `PATCH /api/admin/quests/[id]` | ดู/แก้ภารกิจ |
| `GET /api/admin/users` | รายการผู้เล่น |
| `POST /api/admin/users/[id]/energy` | เติมพลังค้นหา (`mode: refill \| add \| set`, `amount`) |
| `GET /api/admin/images` | สถานะคิวภาพ (group by status) |
| `POST /api/admin/images/requeue` | นำงาน FAILED กลับเข้าคิว |
| `POST /api/admin/images/process` | worker tick ประมวลผลคิว (≤20 งาน/ครั้ง) |
| `GET /api/admin/security` | Security events (`?page=&limit=&type=BOT_PATTERN`) |
| `GET` · `POST /api/admin/events/sync` | ดูสถานะกิจกรรม / สั่ง sync lifecycle (+ `seed: true` เพื่อ seed เนื้อหา) |

---

## 12. Error ที่พบบ่อย

| สถานะ | ตัวอย่างข้อความ | สาเหตุ |
|---:|---|---|
| 400 | `ข้อมูลไม่ถูกต้อง (runes: ...)` | Zod validation ไม่ผ่าน |
| 400 | `พลังค้นหาไม่เพียงพอ` | energy = 0 (รอรีเซ็ตวันถัดไป) |
| 400 | `Veil Shards ไม่พอ (ต้องใช้ 10 ชิ้น)` | อีเวนต์: Shards ไม่พอ |
| 400 | `ยังไม่ถึงเกณฑ์` / `รับรางวัลนี้ไปแล้ว` | milestone/quest |
| 401 | `ไม่พบผู้ใช้ — กรุณาเข้าสู่ระบบ` | ไม่มี session และไม่มี fallback userId |
| 403 | `Origin นี้ไม่ได้รับอนุญาต` | CORS (prod ต้องตั้ง `CORS_ALLOWED_ORIGINS`) |
| 403 | `ต้องเป็นผู้ดูแลระบบหรือ worker` | ไม่ใช่ ADMIN/MODERATOR |
| 404 | `ไม่พบห้อง` / `ไม่พบเด็ค` | id ไม่มีอยู่ |
| 429 | `คำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่` | rate limit / bot pattern / daily cap |
| 500 | `เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์` | ดู `x-request-id` แล้วค้นใน log |

---

## 13. Environment Variables

| ตัวแปร | จำเป็น | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection |
| `AUTH_SECRET` | ✅ | เซ็น session (HS256) |
| `SERVER_PEPPER` | ✅ | hash seed ของการ์ด + battle seed |
| `WORKER_TOKEN` | — | ให้ cron/worker เรียก admin image/event endpoints |
| `AI_IMAGE_API_URL` / `AI_IMAGE_API_KEY` | — | ผู้ให้บริการสร้างภาพ (ไม่มี → ใช้ placeholder SVG) |
| `CORS_ALLOWED_ORIGINS` | prod | origin เพิ่มเติม (คั่น comma) |
| `RATE_LIMIT_<SCOPE>_LIMIT` | — | ปรับโควตา rate limit |
| `LOG_LEVEL` | — | `debug`/`info`/`warn`/`error` (default: info บน prod) |
| `SLOW_REQUEST_MS` | — | เกณฑ์ตัดสิน slow request (default 1000) |
| `USER_ID_FALLBACK` | dev | ใช้เมื่อยังไม่ล็อกอิน (ห้ามตั้งบน production) |

---

## 14. ตัวอย่างเรียกใช้ (curl)

```bash
# ล็อกอินและเก็บ cookie
curl -c cj.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"player1","password":"testpass123"}'

# ถอดรหัสรูน (ใช้ session cookie — ไม่ต้องส่ง userId)
curl -b cj.txt -X POST http://localhost:3000/api/discover \
  -H 'Content-Type: application/json' -H 'x-device-id: my-device' \
  -d '{"runes":[101,202,303,404,505,606,707,808],"idempotencyKey":"disc-1"}'

# เข้า Boss Raid ในกิจกรรม
curl -b cj.txt -X POST http://localhost:3000/api/events/<eventId>/raid \
  -H 'Content-Type: application/json' \
  -d '{"bossId":"<bossId>","deckId":"<deckId>"}'

# ตรวจสุขภาพระบบ
curl -i http://localhost:3000/api/health | grep -i 'x-request-id\|HTTP/'
```


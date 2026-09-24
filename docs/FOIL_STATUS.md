# Foil + แสงเรืองตีบวก (aura) — บันทึกสถานะ

> วันที่: 2026-09-23 · ทำโดย Cline (Telegram session)

## รอบ 6 (2026-09-24) — เอฟเฟกต์ **Canvas 2D** (additive + shadowBlur) — ดีไซน์ `neon`

**คำสั่งผู้ใช้ (ส่ง prompt มาให้ทำตาม):**
*"เขียนทับด้วยระบบพิกัด 2D ธรรมดา จะใช้คุณสมบัติการเรืองแสงและการเบลอของ Canvas
`ctx.globalCompositeOperation = 'lighter'` … `ctx.shadowBlur = 20; ctx.shadowColor = '#00ffff';`
เพื่อสร้างออร่ารอบตัวการ์ด"*

### ทำอะไร (ตาม prompt ตรง ๆ)
| ชั้น | เทคนิค Canvas |
|---|---|
| ออร่านีออนรอบกรอบ | `shadowColor`/`shadowBlur` + `lineWidth` → stroke 3 รอบ (ฟุ้ง → แกน → สว่างสุด) ด้วย `globalCompositeOperation='lighter'` |
| ลำแสงไหลรอบขอบ | `setLineDash()` + `lineDashOffset` วิ่งตามเวลา (ครบรอบเส้นพอดี → ไร้รอยต่อ) |
| อนุภาคไหล (เหมือนน้ำ) | จุดสว่าง + หาง 4 จุด วิ่งตามเส้นรอบการ์ด (พารามิเตอร์เส้นรอบเป็น arc length) |
| เปลวไฟ | เส้นโค้ง quadratic ลุกขึ้นจากขอบล่าง แกว่งตามเวลา + `shadowBlur` ให้เรือง |

- วาดใน **ระบบพิกัดการ์ด 420×600** แล้ว `ctx.setTransform()` สเกลตามขนาดจริง (คมทุกขนาด, DPR ≤ 2)
- **clip 2 ชั้น**: `outsideArt` (ห้ามแสงทับช่องภาพ) + `ring` (วงแหวนขอบการ์ดสำหรับเปลว) ⇒ ภาพ/ข้อความคม 100%
- เคารพ `prefers-reduced-motion` (วาดนิ่ง), "ลดเอฟเฟกต์รุนแรง" (alpha ÷2), COMMON/UNCOMMON ไม่วาด
- ประหยัดแรง: หยุดวาดเมื่อแท็บซ่อน/การ์ดพ้นจอ (IntersectionObserver)/การ์ดเล็กกว่า 120px

### ไฟล์
`src/lib/card-canvas.ts` (pure: สเปก/เรขาคณิตเส้นรอบ/อนุภาค — เทสต์ได้) ·
`src/components/cards/CardAuraCanvas.tsx` (วาดจริง + rAF) ·
`src/lib/card-aura.ts` (+variant `neon`, `isCanvasVariant`) ·
`CardFace.tsx` (เลือกคอมโพเนนต์) · `globals.css` (`.card-aura-canvas`) ·
`scripts/inspect-card-canvas.mjs` (`npm run inspect:canvas`) ·
`scripts/shoot-aura-preview.mjs` (+`--freeze` แช่เวลาให้ภาพนิ่งเทียบกันได้) ·
`tests/unit/card-canvas.test.ts` (17 เทสต์)

### ตรวจแล้ว (พิกเซลจริง ไม่ใช่คำบรรยาย)
`npm run inspect:canvas --base http://localhost:3000 --query 'variant=neon&rarity=LEGENDARY'`:
- ✅ วาดจริง 112,937 พิกเซลสว่าง (maxA=255) · ✅ แสงที่ขอบการ์ด alpha=18
- ✅ **ไม่มีแสงทับช่องภาพเลย** (alpha กลางภาพ 0 · มุมภาพ 0/0)
`tsc` 0 error · `next lint` ไม่มี warning · **jest 347 ผ่าน / 26 suites** · build + deploy production แล้ว

---


ผู้ใช้รีวิวการ์ดจริง (ดีไซน์ `inner` ระดับ LEGENDARY):
*"แบบนี้ใกล้เคียง แต่แสงทำให้การ์ดเสียความคมชัด แล้วที่อยากได้ อยากได้ เหมือนเปรวไฟ หรือการไหล เหมือนน้ำ"*
แล้วย้ำภายหลัง: *"ต้องการเป็น Inner ไม่ใช่ Outter"*

### สาเหตุที่ภาพดูเสียความคม (พบจริงในโค้ด)
ชั้น `sparks` (ประกายลอย) **ไม่ได้ถูกตัด** → ลอยผ่านตัวภาพด้วย `mix-blend-mode: screen` + `feGaussianBlur`
⇒ แก้โดยตัดทุกชั้นไม่ให้ทับตัวการ์ด: `inner` → clip ที่ขอบช่องภาพ (`art-outside`)

### ดีไซน์ `flow` (รอบสุดท้าย = **Inner**)
ทุกชั้นถูกตัดด้วย **`ring` = วงแหวนขอบการ์ด (30 หน่วยในกรอบ)** เพราะภายในกรอบมีแค่ 2 อย่าง:
- `scope` กลางการ์ด = ภาพ + กล่องข้อความ + สเตตัส (กินหมดแล้ว ห้ามทับ)
- `ring` ขอบการ์ด = ที่เดียวที่แสง/เปลวอยู่ได้โดยไม่ทำการ์ดเสีย

| ชั้น | ทำอะไร |
|---|---|
| `flow-core` | ลำแสง **ไหลวนบนเส้นขอบการ์ด** (1 ช่วงแสง/รอบ · `stroke-dasharray` + animate `dashoffset` = ไร้รอยต่อ) |
| `flow-glow` | แสงเรืองที่ไหลตามขอบ **คลิปให้อยู่ในกรอบ** (`insideCard`) → ไม่ล้นออกนอกการ์ด |
| `flames` | **เปลวไฟลุกขึ้นบนขอบล่าง** (2 ลูกต่อจุดยึด · ย่อสัดส่วนให้สูงสุด 28 หน่วย) · บิดรูปด้วย `feTurbulence`+`feDisplacementMap` · ลุก/หุบ/สะบัดด้วย CSS |
| `sparks` | ประกายลอย (clip ที่ขอบช่องภาพ) |

### ข้อควรรู้
- **ใช้ได้ทุกหน้าโดยไม่ต้องแก้ layout** (แบบเดียวกับ `inner` — ไม่มีแสงล้นออกนอกการ์ด)
- `prefers-reduced-motion`: เปลว/แสงไหลหยุดขยับ เหลือแสงนิ่ง (ไม่ซ่อนทั้งชั้น)
- `DEFAULT_AURA_VARIANT` **ยังเป็น `inner`** → การ์ดจริงยังไม่เปลี่ยนจนกว่าผู้ใช้จะเลือก

### 🐞 กับดักตอนพัฒนา (เจอจริง 2026-09-24)
`next dev` **เขียนทับ `.next` ของ production build** → `next start` ล้มด้วย
`Could not find a production build in the '.next' directory` แล้ว service จะ restart วน
⇒ หลังใช้ dev server ให้ **`NODE_ENV=production npm run build` ใหม่เสมอ** ก่อนกลับไปใช้ production
(หรือรัน dev คนละ worktree/copy)

### หลักฐาน
`tsc` 0 error · `next lint` ไม่มี warning · **jest 330 ผ่าน / 25 suites** (aura 37 = +18)
ภาพจริง: `public/_shots/inner-flow-LEGENDARY-flow.png` · `innerflow-s1-LEGENDARY-flow.png` · พรีวิว `/aura-preview?variant=flow`

---

## สถานะปัจจุบัน (รอบ 4, 2026-09-23): ✅ **ผู้ใช้เลือกดีไซน์ `inner` → ผูกเข้ากับการ์ดทุกหน้าแล้ว + deploy ขึ้น production**

> - ดีไซน์ที่ใช้จริง: `inner` (ตัดแสงในกรอบการ์ด) — ตั้งค่าที่ `DEFAULT_AURA_VARIANT` ใน `src/lib/card-aura.ts`
> - `CardFace` วาดชั้น aura ให้เอง → ทุกหน้าที่ใช้การ์ดได้แสงนี้อัตโนมัติ (คอลเลกชัน/เด็ค/แอดมิน/โมดัลเปิดการ์ด)
> - พรีวิวเทียบทุกดีไซน์: `/aura-preview` (บน production แล้ว)
> - ภาพจริง: `public/_shots/real-cards-inner.png` (หน้าคอลเลกชันจริง) · `real-admin-inner.png` · `aura-MYTHIC-inner.png` · `v-tier-*.png`


## เอฟเฟกต์ที่ผ่านและยังคงอยู่
- แสงเลื่อมบนตัวการ์ด (foil) ชั้น CSS ล้วน: tint (เฉดขอบการ์ด) · prism (วงรุ้งในช่องภาพ) · sweep (แสงกวาด) · sparkle (ประกาย เฉพาะ LEGENDARY/MYTHIC)
- กติกา: COMMON/UNCOMMON ไม่มีแสง · RARE+ เข้มขึ้นตามระดับ — โค้ดอยู่ที่ `src/lib/card-foil.ts`, `src/components/cards/CardFoil.tsx`, `src/app/globals.css` (ส่วน card-foil)

## สิ่งที่ลองและ **ไม่ผ่าน** (ผู้ใช้ปฏิเสทั้งหมด — ห้ามทำซ้ำแบบเดิม)
1. **aura box-shadow รอบขอบ** (รุ่นแรก) — ดูเป็น "กรอบสี่เหลี่ยขยับนิดๆ" ผู้ใช้บอกไม่มีแสง + ดูแปลก → ลองแก้ `.85/.5/.3` alpha ก็ยังไม่พอใจ (ถูกลบใน `00863b4`)
2. **เปลวไฟ (B1) — "item ตีบวก เหมือน MU online" / แบบเปรวไฟ** — ลูกเปลว 9 ลูกกระพริบรอบขอบ (`347cae0`) → ผู้ใช้บอก "พอๆ ไม่ได้" → ถูก revert ทั้งหมด → **ถือว่าทำไม่สำเร็จ** (revert ล่าสุด `00863b4`)
- ผู้ใช้สรุป: **เหลือแค่แสงเลื่อมบนตัวการ์ดเท่านั้น** ห้ามมีของที่ยื่นออกนอกกรอบการ์ดชั่วคราวจนกว่าจะมอรายการใหม่ที่ออกแบบได้ดีจริง

## เทียบเคียง (ถ้าจะลองใหม่ต้องบอกผู้ใช้ก่อน)
- ทิศทางที่เคยเสนอแต่ยังไม่ได้ลอง: canvas particle เปลวไฟจริง, SVG feTurbulence displacement (เปลวเหลว)
- ข้อจำกัดที่พังซ้ำเสมอ: กล่อง grid มี `overflow-hidden` ตัดเงานอกการ์ด; box-shadow ใน headless/บาง browser ดูจืด

---

## รอบ 3 (2026-09-23) — "แสงเรืองแบบไอเทมตีบวก (MU Online)" ทำใหม่ด้วย SVG glow

ผู้ใช้สั่ง: *"ทำ Effect การ์ด ให้เหมือน Item ตีบวกในเกม Mu Online ที่เป็นแสงๆ สวย"* (หลังของเดิมถูก revert)

### ทำไมรอบนี้ต่างจากของเดิม
| ของเดิม (ไม่ผ่าน) | รอบนี้ |
|---|---|
| `box-shadow` รอบขอบ → เป็นกรอบสี่เหลี่ยมแข็ง | **SVG `feGaussianBlur` + gradient** — แสงเกาะรูปทรงการ์ด (rounded rect) เหมือนแสงเกาะไอเทมจริง |
| เปลวไฟ 9 ลูกกระพริบรอบขอบ | เลเยอร์แสงจริง 4 แบบ: ขอบเรือง · ประกายดาว 4 แฉก · เสาแสงแนวตั้ง · ประกายลอยขึ้น |
| ความนุ่ม/ขนาดขึ้นกับ px ของกล่อง → ดูไม่เหมือนกันในแต่ละหน้า | **หน่วย user unit ของ SVG** → สเกลตามขนาดการ์ดทุกขนาด (80–330px) |
| แสงล้นออกนอกการ์ดจนถูก `overflow-hidden` ตัด | เลือกได้: ดีไซน์ `inner` ตัดแสงในกรอบ (ใช้ได้ทุกหน้า) หรือดีไซน์นอกกรอบ (ต้องมีที่ว่าง 12%) |
| แสงฟุ้งทับตัวภาพ (ผู้ใช้ไม่ชอบ "ฝ้า") | **`clip-path` รู evenodd** → วงแสงอยู่ "นอกการ์ด" และ "นอกช่องภาพ" เท่านั้น · การ์ดคม 100% |

### ระดับแสง (เทียบเคียง MU)
`COMMON/UNCOMMON = ไม่มี` · `RARE = +7 ขอบเรือง` · `EPIC = +9 + ประกายดาว` · `LEGENDARY = +11 + เสาแสง` · `MYTHIC = +13 ครบชุด + ประกายลอย`

### 5 ดีไซน์ให้เลือก
`tier` (บันไดระดับ — แนะนำ) · `bloom` (ขอบเรือง) · `radiant` (+ ประกายดาว) · `ascend` (+ เสาแสง + ประกายลอย) · `inner` (ตัดในกรอบ)

### ไฟล์ที่เพิ่ม
- `src/lib/card-aura.ts` — สเปก/เรขาคณิต/ความต่างต่อใบ (pure module, deterministic)
- `src/components/cards/CardAura.tsx` — วาดเลเยอร์ SVG
- `src/app/aura-preview/page.tsx` — หน้าพรีวิวเทียบดีไซน์ × ระดับ
- `src/app/globals.css` — บล็อก `card-aura` + keyframes (หายใจ/หมุน/ไหลขึ้น/ลอย)
- `scripts/shoot-aura-preview.mjs` — `npm run shoot:aura` ถ่ายภาพจริงด้วย Chrome
- `tests/unit/card-aura.test.ts` — 22 เทสต์ (กติกา/บันได/determinism/geometry/clip path)

### ตรวจแล้ว
`tsc --noEmit` 0 error · `next lint` ไม่มี warning ใหม่ · `jest` 312 ผ่าน (25 suites) · ภาพจริง 11 ใบใน `public/_shots/`
- เคารพ `prefers-reduced-motion` (เหลือแสงนิ่ง) และ "ลดเอฟเฟกต์รุนแรง" ในหน้าตั้งค่า (ความเข้ม ÷ 2)

### ยังไม่ได้ทำ / ข้อควรระวัง
- ดีไซน์นอกกรอบ (`tier`/`bloom`/`radiant`/`ascend`) ถ้าจะเปลี่ยนไปใช้ ต้องปลด `overflow-hidden` ในกล่องการ์ดของหน้านั้น + เว้นที่ 12% รอบการ์ด
- ยังไม่มีเอฟเฟกต์อื่นนอกเหนือจากนี้ (ผู้ใช้ยังไม่สั่งเพิ่ม)

---

## รอบ 4 (2026-09-23) — ผู้ใช้เลือก `inner` แล้วผูกเข้ากับการ์ดจริง

ผู้ใช้สั่ง: *"ลองทำแบบ inner"* (เลือกจาก 5 ดีไซน์ในรอบ 3)

### สิ่งที่ทำ
1. **`DEFAULT_AURA_VARIANT = 'inner'`** ใน `src/lib/card-aura.ts` — จุดเดียวที่กำหนดดีไซน์ทั้งเกม
2. **`CardFace` วาด `CardAura` ให้เอง** (มี prop `auraVariant?` ไว้ทดลองดีไซน์อื่น) → ทุกหน้าได้แสงทันที
   โดยไม่ต้องแก้หน้าไหนเลย เพราะ `inner` ตัดแสงในกรอบการ์ด (`inset: 0` · viewBox `0 0 420 600`)
3. หน้าพรีวิว `/aura-preview` ส่ง `auraVariant` ให้ `CardFace` แทนการวาดซ้ำ → **แก้บั๊กแสงซ้อน 2 ชั้น**
4. `scripts/inspect-cards-page.mjs` เพิ่ม flag `--aura` → วัดชั้นแสงจากหน้าจริง (ไม่ต้องดูด้วยตา)
5. เทสต์เพิ่ม 4 ตัว (ดีไซน์ตั้งต้น = inner · พอดีกรอบ · องค์ประกอบครบ · COMMON/UNCOMMON ยังเรียบ)

### หลักฐานจากหน้าจริง (Chrome จริง + session แอดมิน)
| หน้า | ขนาดการ์ด | aura ที่เรนเดอร์ | พอดีกล่องการ์ด | อนิเมชัน | เข้าถึง/คลิก |
|---|---|---|---|---|---|
| `/cards` (คอลเลกชัน) | 222×317 | 4 ใบ (RARE/EPIC) จาก 12 ใบ | ✅ ทุกใบ | ✅ 4/4 | `pointer-events:none` + `aria-hidden` ✅ |
| `/admin/cards` (ทุกใบ) | 80×114 | 13 ใบ | ✅ ทุกใบ | ✅ 13/13 | ✅ |

- การ์ดที่วัดได้: `svgViewBox 0 0 420 600` · `feGaussianBlur` 3 ตัว · `clipPath` 2 รู (evenodd) · ประกาย 4 (RARE) / 6 (EPIC) · `mix-blend-mode: screen`
- ระดับต่ำ (COMMON/UNCOMMON) ไม่มีชั้น aura เลย → การ์ดธรรมดายังเรียบตามกติกาเดิม
- `prefers-reduced-motion` → เหลือแสงนิ่ง (ไม่มี animation)

### บทเรียนที่ต้องจำ (สำหรับ deploy บนเครื่องนี้)
- **`.env` ของโปรเจกต์ตั้ง `NODE_ENV="development"`** → ถ้าสั่ง `npm run build` ตรงๆ Next จะเข้าโหมด dev แล้ว **build ล้ม** (เจอ "Export encountered errors" หลายหน้า)
  ต้องสั่ง `NODE_ENV=production npm run build` (systemd ทับค่าให้ตอนรันจริงอยู่แล้ว)
- ชั้นแสงเป็น `mix-blend-mode: screen` + SVG → วัดด้วย `npm run inspect:cards -- --aura` ได้ทุกครั้ง (ไม่ต้องเดาจากคำบรรยาย)

### รอบ 4.1 (2026-09-23) — ถอด "ประกายดาว" (flare) ออกจาก `inner`

ผู้ใช้รีวิวบนการ์ดจริงหลัง deploy: *"ยังไม่ถูกใจ โดยเฉพาะประกายดาว ไม่เหมาะเลย"*

- `auraLayers('inner')` → `flare: false` → ดีไซน์ที่ใช้จริงเหลือ **ขอบเรือง (halo) + ประกายลอย (sparks)** เท่านั้น
- องค์ประกอบ/เรขาคณิตอื่นคงเดิม · ดีไซน์ `tier`/`radiant` ในหน้าพรีวิวยังมีประกายดาวไว้เทียบ (ไม่ได้ลบทิ้ง)
- รีวิวโค้ดรอบเดียวกันแก้เพิ่ม: กัน `/aura-preview?variant=ผิด` พัง (500) · uid ของ SVG รวม variant (กัน id ชน) · `CardAura` default = `DEFAULT_AURA_VARIANT`


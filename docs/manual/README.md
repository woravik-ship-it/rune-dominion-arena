# หนังสือคู่มือการเล่น — Rune Dominion Arena (Beta)

คู่มือฉบับสมบูรณ์ที่ทำเป็น **หนังสือ** พร้อมภาพประกอบจากเกมจริง (ไม่ใช่ภาพจำลอง)

> ⚠️ **หนังสือเล่มนี้เป็นเอกสารสำหรับ "ผู้เล่น" ล้วน ๆ** — มีแต่กติกาเกมเพลย์ วิธีเล่น และเคล็ดลับ
> **ไม่เปิดเผยรายละเอียดทางเทคนิคภายใน** (สถาปัตยกรรม/สูตรภายใน/ระบบความปลอดภัย) ตามที่ผู้ใช้ออกแบบไว้
> ส่วนเทคนิคของตัวเกมดูได้ที่ [`../API.md`](../API.md) · [`../../SECURITY.md`](../../SECURITY.md) · [`../../DEVELOPMENT_PLAN.md`](../../../DEVELOPMENT_PLAN.md)

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| [`RuneDominion-Manual-TH.pdf`](RuneDominion-Manual-TH.pdf) | **ตัวเล่ม** ขนาด A5 · 77 หน้า · ส่งต่อ/ปริ้นได้ทันที |
| [`index.html`](index.html) | ต้นฉบับของเล่ม (เปิดในเบราว์เซอร์อ่านบนจอได้ · มี print CSS ในตัว) |
| [`images/`](images) | ภาพประกอบ 29 ภาพ (ภาพหน้าจอเกมจริง + ตัวอย่างการ์ดแต่ละระดับความหายาก) |

## เนื้อหาในเล่ม

1. ปฐมบท — รู้จักเกม · โลกของ Aetherra · วงจรการเล่น · เริ่มเล่นครั้งแรก
2. รูนและการ์ด — กระดานรูน 100×100 · ธาตุ/บทบาท/ระดับหายาก · สถิติและสูตร · คอลเลกชัน · งานศิลป์และเอฟเฟกต์
3. ทีมและการต่อสู้ — วงแหวน 5 ช่องและบทบาทช่อง · คะแนนทีม · สูตรดาเมจ · สกิล · สถานะ · อ่านหน้าสนามรบ/Replay
4. การแข่งขันและรางวัล — อารีน่า 24 ชม. · ภารกิจ · เศรษฐกิจ Coin
5. กิจกรรมฤดูกาล — Boss Raid 4 เฟส · กลไกบอส · Milestone ส่วนตัว/ชุมชน · ร้านค้า · เนื้อเรื่อง
6. ภาคผนวก — ตั้งค่า/เสียง · ปัญหาที่พบบ่อย · คำศัพท์ · แผน 7 วันแรก · ตารางค่าคงที่ทั้งหมด

## สร้างเล่มใหม่ (เมื่อเกมเปลี่ยน UI หรือตัวเลข)

```bash
# 1) ภาพประกอบ — ถ่ายจากเกมจริง (ต้องให้เกมรันที่ localhost:3000 และมี session token ของผู้เล่นจริง)
node scripts/capture-manual-shots.mjs --token "<rda_session>" --out docs/manual/images
node scripts/capture-manual-shots.mjs --anon --port 9362 --out docs/manual/images   # หน้า login/register

# 2) พิมพ์เป็น PDF (ขนาด A5 ตาม @page ใน index.html)
cd docs/manual
google-chrome --headless=new --no-sandbox --disable-gpu --no-pdf-header-footer \
  --virtual-time-budget=60000 --print-to-pdf="$PWD/RuneDominion-Manual-TH.pdf" \
  "file://$PWD/index.html"
```

หมายเหตุ

- ตรวจว่า "เกมมีเสียงออกจริง" ด้วยสคริปต์วัดสัญญาณ (Phase 21):
  `npm run inspect:audio -- --token "<rda_session>"` — เปิด Chrome (headless) ปลดล็อก audio แล้ววัด RMS
  ของเพลง/บรรยากาศ/เอฟเฟกต์ทุกชื่อ ผ่านครบจึงจะ exit 0
- ส่งเข้า Telegram (ในเครื่องนี้) ใช้ช่องทางสำรอง Bot API ตรง:
  `python3 ~/E2_Lab/cline-ctl/tg/tg-send.py --document docs/manual/RuneDominion-Manual-TH.pdf --caption "..."`
  (สคริปต์จำกัดไฟล์ ≤50MB ตามข้อจำกัดของ Bot API)
- `capture-manual-shots.mjs` ใช้ Chrome headless + CDP แบบเดียวกับ `scripts/inspect-*.mjs`
  และมี ID ตัวอย่าง (เด็ค/การ์ด/ห้องอารีน่า/ศึก/กิจกรรม) อยู่ต้นไฟล์ — ถ้าข้อมูลตัวอย่างถูกลบ ให้แก้ `IDS` ก่อนรัน
- **ห้าม commit session token** ลง git (สคริปต์ไม่บันทึก token ลงไฟล์ใด ๆ อยู่แล้ว)
- ภาพการ์ดแต่ละระดับความหายาก (`fig-rarity-*.png`) คัดจาก `public/_shots/v-tier-*.png`
- ตัวเลขในเล่มอ้างจากค่าคงที่ของเกม ณ วันที่จัดทำ — ถ้ามีการปรับสมดุล ต้องแก้ `index.html` แล้วพิมพ์ PDF ใหม่

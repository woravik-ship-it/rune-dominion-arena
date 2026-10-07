-- Phase 43: "ของแต่ละชิ้นมีระดับบวกของตัวเอง" (ผู้ใช้สั่ง 2026-10-04)
--
--  เดิม: user_items 1 แถวต่อ (ผู้เล่น, Item) และ enhance_level มีผลกับ "ทั้งกอง"
--  ใหม่: 1 แถวต่อ (ผู้เล่น, Item, ระดับบวก) = กองแยกระดับ
--        การตีบวก = ดึง 1 ชิ้นออกจากกองระดับเดิม → ย้ายเข้าอีกกองหนึ่ง ระดับจึงอยู่กับ "ชิ้นนั้น"
--  ช่องใส่ Item ผูกกับชิ้นจริง (user_item_id) ⇒ สถานะที่บวกใช้ระดับของชิ้นที่ใส่

-- 1) user_items — ปลด unique เดิม + สร้าง unique ระดับกอง
DROP INDEX IF EXISTS "user_items_user_id_item_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "user_items_user_id_item_id_enhance_level_key"
    ON "user_items"("user_id", "item_id", "enhance_level");

-- 2) card_item_slots — เพิ่มคอลัมน์ชี้ "ชิ้นที่ใส่จริง"
ALTER TABLE "card_item_slots" ADD COLUMN IF NOT EXISTS "user_item_id" TEXT;
CREATE INDEX IF NOT EXISTS "card_item_slots_user_item_id_idx" ON "card_item_slots"("user_item_id");
ALTER TABLE "card_item_slots"
    ADD CONSTRAINT "card_item_slots_user_item_id_fkey"
    FOREIGN KEY ("user_item_id") REFERENCES "user_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) เติมข้อมูลเดิม: ช่องที่ใส่ Item อยู่ → ชี้ไปกองของ Item นั้นของผู้เล่นเจ้าของการ์ด
--    (ก่อน Phase 43 มีได้เพียงแถวเดียวต่อ (ผู้เล่น, Item) ⇒ ค่าที่เติมไม่กำกวม)
--    หมายเหตุ: อ้าง alias ของตารางเป้าหมายได้เฉพาะใน WHERE (ไม่ใช่ใน JOIN ... ON)
UPDATE "card_item_slots" AS s
SET "user_item_id" = ui."id"
FROM "user_cards" AS uc, "user_items" AS ui
WHERE s."user_card_id" = uc."id"
  AND ui."user_id" = uc."user_id"
  AND ui."item_id" = s."item_id"
  AND s."user_item_id" IS NULL;

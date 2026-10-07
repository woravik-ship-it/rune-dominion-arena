-- Phase: ระบบตีบวก Item (+0..+15) — เพิ่มระดับบวกให้ UserItem + วัสดุ "อัญมณีตีบวก" (เฉพาะไป +10..+15)
ALTER TABLE "user_items" ADD COLUMN "enhance_level" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "InventoryItemType" ADD VALUE IF NOT EXISTS 'ENHANCE_JEWEL';
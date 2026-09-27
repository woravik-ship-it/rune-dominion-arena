-- Phase 39: ไอเทมช่างต้องใช้ Coin ตอนคราฟต์
ALTER TABLE "item_definitions" ADD COLUMN "coin_cost" INTEGER NOT NULL DEFAULT 0;

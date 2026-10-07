-- Phase: Map เลือกจุดอิสระ + เก็บข้อมูลการต่อสู้เพื่อดู replay (ผู้ใช้สั่ง 2026-10-03)
ALTER TABLE "map_farm_logs" ADD COLUMN "deck_id" TEXT;
ALTER TABLE "map_farm_logs" ADD COLUMN "battle_data" JSONB;
-- Phase 33: EXP/Level ของผู้เล่น (สูงสุด 350) — เลเวลคำนวณจาก exp ในโค้ด (src/lib/level.ts)
ALTER TABLE "users" ADD COLUMN "exp" INTEGER NOT NULL DEFAULT 0;

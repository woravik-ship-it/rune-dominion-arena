-- Phase: ระบบแผนที่ฟาร์ม (Map) — Stamina/ตำแหน่งเส้นทาง + ประวัติฟาร์ม
ALTER TABLE "users" ADD COLUMN "map_stamina" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "users" ADD COLUMN "map_stamina_reset_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "map_position" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "map_farm_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL,
    "stamina_cost" INTEGER NOT NULL,
    "rewards" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "map_farm_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "map_farm_logs_run_id_key" ON "map_farm_logs"("run_id");
CREATE INDEX "map_farm_logs_user_id_idx" ON "map_farm_logs"("user_id");
-- CreateTable
CREATE TABLE "dungeon_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dungeon_code" TEXT NOT NULL,
    "best_floor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dungeon_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dungeon_runs" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "dungeon_code" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "deck_id" TEXT NOT NULL,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "rounds_played" INTEGER NOT NULL DEFAULT 0,
    "team_hp_remaining" INTEGER NOT NULL DEFAULT 0,
    "enemy_hp_remaining" INTEGER NOT NULL DEFAULT 0,
    "dust_earned" INTEGER NOT NULL DEFAULT 0,
    "shards_earned" INTEGER NOT NULL DEFAULT 0,
    "item_dropped" TEXT,
    "item_name_th" TEXT,
    "coins_spent" INTEGER NOT NULL DEFAULT 0,
    "battle_data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dungeon_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dungeon_progress_user_id_idx" ON "dungeon_progress"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_progress_user_id_dungeon_code_key" ON "dungeon_progress"("user_id", "dungeon_code");

-- CreateIndex
CREATE UNIQUE INDEX "dungeon_runs_run_id_key" ON "dungeon_runs"("run_id");

-- CreateIndex
CREATE INDEX "dungeon_runs_user_id_dungeon_code_idx" ON "dungeon_runs"("user_id", "dungeon_code");

-- CreateIndex
CREATE INDEX "dungeon_runs_createdAt_idx" ON "dungeon_runs"("createdAt");

-- AddForeignKey
ALTER TABLE "dungeon_progress" ADD CONSTRAINT "dungeon_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dungeon_runs" ADD CONSTRAINT "dungeon_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

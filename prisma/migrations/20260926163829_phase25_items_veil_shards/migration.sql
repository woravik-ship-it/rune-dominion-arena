-- CreateEnum
CREATE TYPE "ItemSlot" AS ENUM ('ATTACK', 'DEFENSE', 'SUPPORT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "veil_shards" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "item_definitions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "description_th" TEXT,
    "slot" "ItemSlot" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "atk" INTEGER NOT NULL DEFAULT 0,
    "def" INTEGER NOT NULL DEFAULT 0,
    "hp" INTEGER NOT NULL DEFAULT 0,
    "spd" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL DEFAULT '🗡️',
    "craft_cost" INTEGER NOT NULL DEFAULT 0,
    "dust_cost" INTEGER NOT NULL DEFAULT 0,
    "buy_cost" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "first_acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_item_slots" (
    "id" TEXT NOT NULL,
    "user_card_id" TEXT NOT NULL,
    "slot" "ItemSlot" NOT NULL,
    "item_id" TEXT NOT NULL,
    "equipped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_item_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veil_shard_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veil_shard_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item_definitions_code_key" ON "item_definitions"("code");

-- CreateIndex
CREATE INDEX "item_definitions_slot_idx" ON "item_definitions"("slot");

-- CreateIndex
CREATE INDEX "item_definitions_rarity_idx" ON "item_definitions"("rarity");

-- CreateIndex
CREATE INDEX "user_items_user_id_idx" ON "user_items"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_items_user_id_item_id_key" ON "user_items"("user_id", "item_id");

-- CreateIndex
CREATE INDEX "card_item_slots_item_id_idx" ON "card_item_slots"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "card_item_slots_user_card_id_slot_key" ON "card_item_slots"("user_card_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "veil_shard_transactions_idempotency_key_key" ON "veil_shard_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "veil_shard_transactions_user_id_createdAt_idx" ON "veil_shard_transactions"("user_id", "createdAt");

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_items" ADD CONSTRAINT "user_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_item_slots" ADD CONSTRAINT "card_item_slots_user_card_id_fkey" FOREIGN KEY ("user_card_id") REFERENCES "user_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_item_slots" ADD CONSTRAINT "card_item_slots_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "item_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veil_shard_transactions" ADD CONSTRAINT "veil_shard_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

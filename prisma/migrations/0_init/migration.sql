-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "Element" AS ENUM ('EMBERBOUND', 'TIDEBORN', 'SKYRIVEN', 'ROOTFORGED', 'DAWNSWORN', 'VEILMARKED');

-- CreateEnum
CREATE TYPE "Rarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC');

-- CreateEnum
CREATE TYPE "CardRole" AS ENUM ('WARRIOR', 'MAGE', 'HEALER', 'TANK', 'ASSASSIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EARN', 'SPEND', 'REWARD', 'PURCHASE');

-- CreateEnum
CREATE TYPE "ArenaStatus" AS ENUM ('WAITING', 'ACTIVE', 'EXPIRED', 'SETTLING', 'SETTLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestType" AS ENUM ('DAILY', 'WEEKLY', 'ACHIEVEMENT', 'EVENT');

-- CreateEnum
CREATE TYPE "QuestMetric" AS ENUM ('DISCOVERY', 'BATTLE', 'BATTLE_WIN', 'ARENA_WIN', 'SPEND');

-- CreateEnum
CREATE TYPE "ImageJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('SEASONAL', 'WEEKLY', 'SPECIAL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'GRACE_PERIOD', 'ENDED');

-- CreateEnum
CREATE TYPE "EventQuestType" AS ENUM ('DAILY', 'WEEKLY', 'MILESTONE', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "EventMilestoneScope" AS ENUM ('PERSONAL', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "EventRewardType" AS ENUM ('COIN', 'VEIL_SHARDS', 'CRAFTING_DUST', 'CARD', 'COSMETIC', 'TITLE', 'STORY_CHAPTER');

-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('CARD', 'COSMETIC', 'TITLE', 'CRAFTING_DUST', 'STORY_CHAPTER');

-- CreateTable
CREATE TABLE "admin_action_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "admin_username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "user_id" TEXT,
    "ip" TEXT,
    "device_id" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "discovery_energy" INTEGER NOT NULL DEFAULT 5,
    "last_energy_reset_at" TIMESTAMP(3),
    "signup_device_id" TEXT,
    "last_device_id" TEXT,
    "signup_ip" TEXT,
    "last_ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_definitions" (
    "id" TEXT NOT NULL,
    "canonical_seed_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT,
    "description" TEXT,
    "description_th" TEXT,
    "lore" TEXT,
    "lore_th" TEXT,
    "element" "Element" NOT NULL,
    "rarity" "Rarity" NOT NULL,
    "role" "CardRole" NOT NULL,
    "atk" INTEGER NOT NULL,
    "def" INTEGER NOT NULL,
    "hp" INTEGER NOT NULL,
    "spd" INTEGER NOT NULL,
    "mana_cost" INTEGER NOT NULL,
    "skill1_name" TEXT,
    "skill1_desc" TEXT,
    "skill1_mana_cost" INTEGER,
    "skill2_name" TEXT,
    "skill2_desc" TEXT,
    "skill2_mana_cost" INTEGER,
    "image_url" TEXT,
    "image_status" "ImageStatus" NOT NULL DEFAULT 'PENDING',
    "thumbnail_url" TEXT,
    "discovery_count" INTEGER NOT NULL DEFAULT 0,
    "first_discoverer_id" TEXT,
    "first_discovered_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_cards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "obtained_method" TEXT NOT NULL,
    "obtained_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "rune_sequence" TEXT NOT NULL,
    "canonical_string" TEXT NOT NULL,
    "seed_hash" TEXT NOT NULL,
    "is_first_discovery" BOOLEAN NOT NULL,
    "idempotency_key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "total_earned" INTEGER NOT NULL DEFAULT 0,
    "total_spent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "description" TEXT,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_slots" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battle_logs" (
    "id" TEXT NOT NULL,
    "attacker_id" TEXT NOT NULL,
    "defender_id" TEXT NOT NULL,
    "attacker_deck_id" TEXT,
    "defender_deck_id" TEXT,
    "winner_id" TEXT,
    "battle_data" JSONB NOT NULL,
    "reward_amount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_rooms" (
    "id" TEXT NOT NULL,
    "host_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ArenaStatus" NOT NULL DEFAULT 'WAITING',
    "max_players" INTEGER NOT NULL DEFAULT 8,
    "current_round" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "entry_fee" INTEGER NOT NULL DEFAULT 10,
    "reward_pool" INTEGER NOT NULL DEFAULT 100,
    "champion_id" TEXT,
    "champion_deck_id" TEXT,
    "expires_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arena_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_participants" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deck_id" TEXT,
    "placement" INTEGER,
    "prize_amount" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arena_challenges" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "challenger_id" TEXT NOT NULL,
    "challenger_deck_id" TEXT NOT NULL,
    "defender_id" TEXT NOT NULL,
    "defender_deck_id" TEXT NOT NULL,
    "winner_id" TEXT,
    "battle_log_id" TEXT,
    "idempotency_key" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arena_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "description" TEXT,
    "description_th" TEXT,
    "type" "QuestType" NOT NULL,
    "metric" "QuestMetric" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "reward_amount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quest_progress" (
    "id" TEXT NOT NULL,
    "quest_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "reward_claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quest_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "image_jobs" (
    "id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "status" "ImageJobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "image_prompt" TEXT,
    "error_message" TEXT,
    "result_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "image_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "description" TEXT,
    "description_th" TEXT,
    "event_type" "EventType" NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "grace_period_end" TIMESTAMP(3),
    "currency_name" TEXT NOT NULL,
    "max_currency" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_quests" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "description" TEXT,
    "description_th" TEXT,
    "type" "EventQuestType" NOT NULL,
    "target_value" INTEGER NOT NULL,
    "reward_amount" INTEGER NOT NULL,
    "currency_reward" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_quest_progress" (
    "id" TEXT NOT NULL,
    "event_quest_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "current_value" INTEGER NOT NULL DEFAULT 0,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "reward_claimed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_quest_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "currency_earned" INTEGER NOT NULL DEFAULT 0,
    "currency_spent" INTEGER NOT NULL DEFAULT 0,
    "event_points" INTEGER NOT NULL DEFAULT 0,
    "damage_dealt" INTEGER NOT NULL DEFAULT 0,
    "milestones_reached" TEXT[],
    "rewards_claimed" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_bosses" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "max_hp" INTEGER NOT NULL,
    "current_hp" INTEGER NOT NULL,
    "total_damage" INTEGER NOT NULL DEFAULT 0,
    "is_defeated" BOOLEAN NOT NULL DEFAULT false,
    "defeated_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_bosses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_raid_attempts" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "boss_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "participation_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "damage_dealt" INTEGER NOT NULL DEFAULT 0,
    "event_points" INTEGER NOT NULL DEFAULT 0,
    "shards_spent" INTEGER NOT NULL DEFAULT 0,
    "shards_earned" INTEGER NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,
    "element_bonus" BOOLEAN NOT NULL DEFAULT false,
    "boss_phase_before" INTEGER NOT NULL,
    "boss_phase_after" INTEGER NOT NULL,
    "elements_used" TEXT[],
    "battle_data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_raid_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_milestones" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "scope" "EventMilestoneScope" NOT NULL,
    "tier" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "title_th" TEXT NOT NULL,
    "reward_type" "EventRewardType" NOT NULL,
    "reward_amount" INTEGER NOT NULL DEFAULT 0,
    "reward_label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_shop_items" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "description_th" TEXT,
    "price" INTEGER NOT NULL,
    "reward_type" "EventRewardType" NOT NULL,
    "reward_amount" INTEGER NOT NULL DEFAULT 0,
    "per_user_limit" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_shop_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_shop_purchases" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "price_paid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_shop_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_story_chapters" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "title_th" TEXT NOT NULL,
    "body_th" TEXT NOT NULL,
    "unlock_at_damage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_story_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_community_progress" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "total_damage" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "raid_count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_community_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_inventory_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "item_type" "InventoryItemType" NOT NULL,
    "code" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT,
    "event_id" TEXT,
    "metadata" JSONB,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_action_logs_created_at_idx" ON "admin_action_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_action_logs_admin_id_idx" ON "admin_action_logs"("admin_id");

-- CreateIndex
CREATE INDEX "security_events_type_idx" ON "security_events"("type");

-- CreateIndex
CREATE INDEX "security_events_user_id_idx" ON "security_events"("user_id");

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_signup_device_id_idx" ON "users"("signup_device_id");

-- CreateIndex
CREATE INDEX "users_last_device_id_idx" ON "users"("last_device_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "card_definitions_canonical_seed_hash_key" ON "card_definitions"("canonical_seed_hash");

-- CreateIndex
CREATE INDEX "card_definitions_element_idx" ON "card_definitions"("element");

-- CreateIndex
CREATE INDEX "card_definitions_rarity_idx" ON "card_definitions"("rarity");

-- CreateIndex
CREATE INDEX "card_definitions_image_status_idx" ON "card_definitions"("image_status");

-- CreateIndex
CREATE INDEX "user_cards_user_id_idx" ON "user_cards"("user_id");

-- CreateIndex
CREATE INDEX "user_cards_card_id_idx" ON "user_cards"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_cards_user_id_card_id_key" ON "user_cards"("user_id", "card_id");

-- CreateIndex
CREATE UNIQUE INDEX "discovery_logs_idempotency_key_key" ON "discovery_logs"("idempotency_key");

-- CreateIndex
CREATE INDEX "discovery_logs_user_id_idx" ON "discovery_logs"("user_id");

-- CreateIndex
CREATE INDEX "discovery_logs_seed_hash_idx" ON "discovery_logs"("seed_hash");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_type_idx" ON "wallet_transactions"("type");

-- CreateIndex
CREATE INDEX "wallet_transactions_createdAt_idx" ON "wallet_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "decks_user_id_idx" ON "decks"("user_id");

-- CreateIndex
CREATE INDEX "deck_slots_deck_id_idx" ON "deck_slots"("deck_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_slots_deck_id_card_id_key" ON "deck_slots"("deck_id", "card_id");

-- CreateIndex
CREATE INDEX "battle_logs_attacker_id_idx" ON "battle_logs"("attacker_id");

-- CreateIndex
CREATE INDEX "battle_logs_defender_id_idx" ON "battle_logs"("defender_id");

-- CreateIndex
CREATE INDEX "arena_rooms_status_idx" ON "arena_rooms"("status");

-- CreateIndex
CREATE INDEX "arena_rooms_expires_at_idx" ON "arena_rooms"("expires_at");

-- CreateIndex
CREATE INDEX "arena_participants_room_id_idx" ON "arena_participants"("room_id");

-- CreateIndex
CREATE UNIQUE INDEX "arena_participants_room_id_user_id_key" ON "arena_participants"("room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "arena_challenges_idempotency_key_key" ON "arena_challenges"("idempotency_key");

-- CreateIndex
CREATE INDEX "arena_challenges_room_id_idx" ON "arena_challenges"("room_id");

-- CreateIndex
CREATE INDEX "arena_challenges_challenger_id_idx" ON "arena_challenges"("challenger_id");

-- CreateIndex
CREATE UNIQUE INDEX "quests_code_key" ON "quests"("code");

-- CreateIndex
CREATE INDEX "quests_type_idx" ON "quests"("type");

-- CreateIndex
CREATE INDEX "quests_isActive_idx" ON "quests"("isActive");

-- CreateIndex
CREATE INDEX "quest_progress_user_id_period_key_idx" ON "quest_progress"("user_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "quest_progress_quest_id_user_id_period_key_key" ON "quest_progress"("quest_id", "user_id", "period_key");

-- CreateIndex
CREATE INDEX "image_jobs_status_idx" ON "image_jobs"("status");

-- CreateIndex
CREATE INDEX "image_jobs_priority_idx" ON "image_jobs"("priority");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_start_date_idx" ON "events"("start_date");

-- CreateIndex
CREATE INDEX "event_quests_event_id_idx" ON "event_quests"("event_id");

-- CreateIndex
CREATE INDEX "event_quest_progress_user_id_period_key_idx" ON "event_quest_progress"("user_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "event_quest_progress_event_quest_id_user_id_period_key_key" ON "event_quest_progress"("event_quest_id", "user_id", "period_key");

-- CreateIndex
CREATE INDEX "event_participations_event_id_idx" ON "event_participations"("event_id");

-- CreateIndex
CREATE INDEX "event_participations_user_id_idx" ON "event_participations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participations_event_id_user_id_key" ON "event_participations"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_bosses_event_id_idx" ON "event_bosses"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_raid_attempts_idempotency_key_key" ON "event_raid_attempts"("idempotency_key");

-- CreateIndex
CREATE INDEX "event_raid_attempts_event_id_user_id_idx" ON "event_raid_attempts"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_raid_attempts_boss_id_idx" ON "event_raid_attempts"("boss_id");

-- CreateIndex
CREATE INDEX "event_raid_attempts_createdAt_idx" ON "event_raid_attempts"("createdAt");

-- CreateIndex
CREATE INDEX "event_milestones_event_id_idx" ON "event_milestones"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_milestones_event_id_scope_tier_key" ON "event_milestones"("event_id", "scope", "tier");

-- CreateIndex
CREATE INDEX "event_shop_items_event_id_idx" ON "event_shop_items"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_shop_items_event_id_code_key" ON "event_shop_items"("event_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "event_shop_purchases_idempotency_key_key" ON "event_shop_purchases"("idempotency_key");

-- CreateIndex
CREATE INDEX "event_shop_purchases_event_id_user_id_idx" ON "event_shop_purchases"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_shop_purchases_item_id_idx" ON "event_shop_purchases"("item_id");

-- CreateIndex
CREATE INDEX "event_story_chapters_event_id_idx" ON "event_story_chapters"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_story_chapters_event_id_chapter_no_key" ON "event_story_chapters"("event_id", "chapter_no");

-- CreateIndex
CREATE UNIQUE INDEX "event_community_progress_event_id_key" ON "event_community_progress"("event_id");

-- CreateIndex
CREATE INDEX "user_inventory_items_user_id_item_type_idx" ON "user_inventory_items"("user_id", "item_type");

-- CreateIndex
CREATE UNIQUE INDEX "user_inventory_items_user_id_item_type_code_key" ON "user_inventory_items"("user_id", "item_type", "code");

-- AddForeignKey
ALTER TABLE "card_definitions" ADD CONSTRAINT "card_definitions_first_discoverer_id_fkey" FOREIGN KEY ("first_discoverer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_logs" ADD CONSTRAINT "discovery_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_logs" ADD CONSTRAINT "discovery_logs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decks" ADD CONSTRAINT "decks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_slots" ADD CONSTRAINT "deck_slots_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_slots" ADD CONSTRAINT "deck_slots_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_logs" ADD CONSTRAINT "battle_logs_attacker_id_fkey" FOREIGN KEY ("attacker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_logs" ADD CONSTRAINT "battle_logs_defender_id_fkey" FOREIGN KEY ("defender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_rooms" ADD CONSTRAINT "arena_rooms_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_participants" ADD CONSTRAINT "arena_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "arena_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_participants" ADD CONSTRAINT "arena_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arena_challenges" ADD CONSTRAINT "arena_challenges_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "arena_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_quest_id_fkey" FOREIGN KEY ("quest_id") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "image_jobs" ADD CONSTRAINT "image_jobs_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_quests" ADD CONSTRAINT "event_quests_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_quest_progress" ADD CONSTRAINT "event_quest_progress_event_quest_id_fkey" FOREIGN KEY ("event_quest_id") REFERENCES "event_quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_quest_progress" ADD CONSTRAINT "event_quest_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participations" ADD CONSTRAINT "event_participations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participations" ADD CONSTRAINT "event_participations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bosses" ADD CONSTRAINT "event_bosses_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_raid_attempts" ADD CONSTRAINT "event_raid_attempts_boss_id_fkey" FOREIGN KEY ("boss_id") REFERENCES "event_bosses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_raid_attempts" ADD CONSTRAINT "event_raid_attempts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_raid_attempts" ADD CONSTRAINT "event_raid_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_raid_attempts" ADD CONSTRAINT "event_raid_attempts_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "event_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_milestones" ADD CONSTRAINT "event_milestones_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shop_items" ADD CONSTRAINT "event_shop_items_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shop_purchases" ADD CONSTRAINT "event_shop_purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "event_shop_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shop_purchases" ADD CONSTRAINT "event_shop_purchases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_shop_purchases" ADD CONSTRAINT "event_shop_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_story_chapters" ADD CONSTRAINT "event_story_chapters_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_community_progress" ADD CONSTRAINT "event_community_progress_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_inventory_items" ADD CONSTRAINT "user_inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('IMAGE_READY', 'IMAGE_FAILED', 'BATTLE_RESULT', 'ARENA_RESULT', 'EVENT', 'ANNOUNCEMENT', 'SYSTEM');

-- AlterTable
ALTER TABLE "image_jobs" ADD COLUMN     "started_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'th',
ADD COLUMN     "notify_prefs" JSONB;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title_th" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "body_th" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "href" TEXT,
    "icon" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title_th" TEXT NOT NULL,
    "title_en" TEXT NOT NULL,
    "body_th" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "href" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "announcements_is_active_published_at_idx" ON "announcements"("is_active", "published_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

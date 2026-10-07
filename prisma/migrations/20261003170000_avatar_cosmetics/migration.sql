-- Phase 43: เครื่องประดับ + ฉายา (ของแต่งตัวจาก Event — ใส่ที่โปรไฟล์, หน้าตาล้วน ไม่มีผลต่อสู้)
ALTER TABLE "users" ADD COLUMN "avatar_frame_code" TEXT;
ALTER TABLE "users" ADD COLUMN "title_code" TEXT;
ALTER TABLE "users" ADD COLUMN "title_th" TEXT;
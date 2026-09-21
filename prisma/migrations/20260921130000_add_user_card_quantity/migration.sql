-- การ์ดใบซ้ำ: นับจำนวนการถือครอง (x2, x3, ...) แทนที่จะทิ้งใบซ้ำไป
ALTER TABLE "user_cards" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

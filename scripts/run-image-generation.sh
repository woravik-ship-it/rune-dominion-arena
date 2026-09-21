#!/bin/bash
# ตัวช่วยรันสร้างภาพการ์ดแบบต่อเนื่อง (ผู้ให้บริการฟรีจำกัดคิว 1 งาน/IP → ทำเรียงทีละใบ)
# วนซ้ำจนกว่าทุกการ์ดจะมีภาพครบ แล้วหยุดเอง (ปลอดภัยที่จะรันใน systemd/cron)
#
# วิธีใช้:
#   bash scripts/run-image-generation.sh              # วนจนครบ (หน่วง 4 วิ/ใบ)
#   DELAY=2000 MAX_ROUNDS=3 bash scripts/run-image-generation.sh
#   RUN_ONCE=1 bash scripts/run-image-generation.sh   # ทำรอบเดียว
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

DELAY="${DELAY:-4000}"
MAX_ROUNDS="${MAX_ROUNDS:-200}"
PAUSE_BETWEEN_ROUNDS="${PAUSE_BETWEEN_ROUNDS:-20}"
RUN_ONCE="${RUN_ONCE:-0}"

round=0
while [ "$round" -lt "$MAX_ROUNDS" ]; do
    round=$((round + 1))
    echo "=== รอบที่ $round : เริ่มสร้างภาพการ์ด ==="
    npx tsx scripts/generate-card-images.ts --delay "$DELAY" 2>&1 | grep -vE 'prisma:query'

    missing=$(npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { hasCardArt } from './src/lib/card-art-store';
const prisma = new PrismaClient();
const cards = await prisma.cardDefinition.findMany({ select: { id: true } });
let missing = 0;
for (const card of cards) { if (!(await hasCardArt(card.id))) missing += 1; }
console.log(missing);
await prisma.\$disconnect();
" 2>/dev/null | tail -1)

    echo "=== การ์ดที่ยังไม่มีภาพ: ${missing:-?} ใบ ==="
    if [ "${missing:-1}" = "0" ]; then
        echo "🎉 ครบทุกใบแล้ว"
        break
    fi
    [ "$RUN_ONCE" = "1" ] && break
    sleep "$PAUSE_BETWEEN_ROUNDS"
done

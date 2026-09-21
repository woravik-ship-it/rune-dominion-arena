#!/bin/bash
# Backup ฐานข้อมูล — Phase 12: ตรวจสอบ + สำรอง + ตรวจความสมบูรณ์ + ลบไฟล์เก่า
#
# วิธีใช้:
#   bash scripts/backup-db.sh                    # สำรองไปที่ ~/backups/rune-dominion
#   BACKUP_DIR=/mnt/backup bash scripts/backup-db.sh
#   KEEP_DAYS=14 bash scripts/backup-db.sh       # เก็บ 14 วัน (ค่าเริ่มต้น 7)
#
# หมายเหตุ: สคริปต์นี้อ่าน DATABASE_URL จาก .env และใช้ pg_dump ที่ตรงกับเซิร์ฟเวอร์
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/rune-dominion}"
KEEP_DAYS="${KEEP_DAYS:-7}"
ENV_FILE="${ENV_FILE:-$DIR/.env}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/rune_dominion-$STAMP.sql.gz"

# --- อ่าน DATABASE_URL ---
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ ไม่พบ $ENV_FILE (ต้องมี DATABASE_URL)" >&2
  exit 1
fi
DB_URL="$(sed -n 's/^DATABASE_URL=["'"'"']\{0,1\}\([^"'"'"']*\)["'"'"']\{0,1\}$/\1/p' "$ENV_FILE" | head -1)"
if [ -z "$DB_URL" ]; then
  echo "❌ อ่าน DATABASE_URL จาก $ENV_FILE ไม่ได้" >&2
  exit 1
fi
# ตัด query param เฉพาะ Prisma (?schema=public) ที่ pg_dump ไม่รับ
DB_URL="${DB_URL%%\?*}"

# --- หา pg_dump (ระบบ portable ที่เครื่องนี้ใช้ ~/pg-portable) ---
PG_DUMP="$(command -v pg_dump || true)"
if [ -z "$PG_DUMP" ] && [ -x "$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/pg_dump" ]; then
  PG_DUMP="$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/pg_dump"
  export LD_LIBRARY_PATH="$HOME/pg-portable/lib"
fi
if [ -z "$PG_DUMP" ]; then
  echo "❌ ไม่พบ pg_dump — ติดตั้ง postgresql-client หรือใช้ pg-portable" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "💾 สำรองฐานข้อมูล → $OUT"
start=$(date +%s)

# --no-owner/--no-privileges: ย้ายข้ามเครื่องได้ง่าย
DUMP_ERR="$(mktemp)"
if ! "$PG_DUMP" "$DB_URL" --no-owner --no-privileges 2>"$DUMP_ERR" | gzip -9 > "$OUT"; then
  echo "❌ สำรองไม่สำเร็จ — pg_dump แจ้ง:" >&2
  head -5 "$DUMP_ERR" >&2
  rm -f "$OUT" "$DUMP_ERR"
  exit 1
fi
rm -f "$DUMP_ERR"

# --- ตรวจความสมบูรณ์: ไฟล์ต้องไม่ว่าง + gzip เปิดได้ + มีตารางที่รู้จัก ---
if [ ! -s "$OUT" ]; then
  echo "❌ ไฟล์สำรองว่างเปล่า" >&2
  rm -f "$OUT"
  exit 1
fi
if ! gzip -t "$OUT" 2>/dev/null; then
  echo "❌ ไฟล์ gzip เสียหาย" >&2
  exit 1
fi

TABLES="$(gunzip -c "$OUT" | grep -c 'CREATE TABLE')"
if [ "$TABLES" -lt 5 ]; then
  echo "⚠️  พบตารางเพียง $TABLES ตาราง — ตรวจสอบว่าฐานข้อมูลถูกต้อง" >&2
fi

SIZE="$(du -h "$OUT" | cut -f1)"
DURATION=$(( $(date +%s) - start ))

# --- checksum สำหรับตรวจการคัดลอก ---
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$OUT" > "$OUT.sha256"
fi

# --- ลบไฟล์เก่า ---
DELETED=0
if [ -d "$BACKUP_DIR" ]; then
  while IFS= read -r old; do
    rm -f "$old" "$old.sha256"
    DELETED=$((DELETED + 1))
  done < <(find "$BACKUP_DIR" -name 'rune_dominion-*.sql.gz' -type f -mtime "+$KEEP_DAYS")
fi

echo "✅ สำเร็จ: $SIZE · $TABLES ตาราง · ใช้เวลา ${DURATION}s"
echo "   ลบไฟล์เก่ากว่า ${KEEP_DAYS} วัน: $DELETED ไฟล์"
echo "   ไฟล์ล่าสุด: $OUT"

# --- แนะนำ restore ---
echo ""
echo "♻️  วิธีกู้คืน:"
echo "   gunzip -c \"$OUT\" | psql \"\$DATABASE_URL\""

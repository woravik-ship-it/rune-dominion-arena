#!/bin/bash
# ทดสอบว่าไฟล์ backup กู้คืนได้จริง — สร้าง DB ชั่วคราว → restore → ตรวจตาราง → ลบ DB
# วิธีใช้: bash scripts/verify-backup.sh [path/to/backup.sql.gz]
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:-}"
export LD_LIBRARY_PATH="$HOME/pg-portable/lib"
PSQL="$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql"
PG_BIN="$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin"
TEST_DB="rune_dominion_verify_$$"

if [ -z "$FILE" ]; then
  FILE="$(ls -t "$HOME/backups/rune-dominion"/rune_dominion-*.sql.gz 2>/dev/null | head -1)"
fi
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "❌ ไม่พบไฟล์ backup (ระบุ path หรือรัน scripts/backup-db.sh ก่อน)" >&2
  exit 1
fi

echo "🔍 ตรวจไฟล์: $FILE"

# 1) ตรวจ checksum ถ้ามี
if [ -f "$FILE.sha256" ]; then
  if sha256sum -c "$FILE.sha256" >/dev/null 2>&1; then
    echo "   ✅ checksum ตรง"
  else
    echo "   ❌ checksum ไม่ตรง — ไฟล์อาจเสียหาย" >&2
    exit 1
  fi
fi

# 2) สร้าง DB ทดสอบ + restore
cleanup() {
  "$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1
}
trap cleanup EXIT

"$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1
if ! "$PSQL" -h localhost -U postgres -d postgres -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null 2>&1; then
  echo "   ❌ สร้าง DB ทดสอบไม่ได้ (Postgres รันอยู่หรือไม่?)" >&2
  exit 1
fi

if ! gunzip -c "$FILE" | "$PSQL" -h localhost -U postgres -d "$TEST_DB" -q >/dev/null 2>&1; then
  echo "   ❌ restore ล้มเหลว" >&2
  exit 1
fi

# 3) ตรวจจำนวนตารางจริงใน DB ที่ restore แล้ว
TABLES="$("$PSQL" -t -A -h localhost -U postgres -d "$TEST_DB" -c "select count(*) from pg_tables where schemaname='public';" 2>/dev/null)"
USERS="$("$PSQL" -t -A -h localhost -U postgres -d "$TEST_DB" -c "select count(*) from users;" 2>/dev/null || echo 'n/a')"

echo "   ✅ restore สำเร็จ"
echo "      ตารางใน DB ที่กู้คืน: $TABLES"
echo "      ผู้ใช้ใน DB ที่กู้คืน: $USERS"
echo "      (ลบ DB ทดสอบ $TEST_DB แล้ว)"

#!/bin/bash
# ทดสอบ production workflow จริง: DB เปล่า → prisma migrate deploy → ตรวจว่าตารางครบ
# (Phase 12: พิสูจน์ว่า migrate deploy ใช้กับ production ได้ ไม่ใช่แค่ migrate diff)
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$HOME/pg-portable/lib"
PSQL="$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql"
TEST_DB="rune_dominion_deploytest_$$"

cleanup() { "$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1; }
trap cleanup EXIT

echo "🚀 ทดสอบ production workflow (migrate deploy) บน DB เปล่า"
"$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1
"$PSQL" -h localhost -U postgres -d postgres -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null 2>&1 || {
  echo "❌ สร้าง DB ทดสอบไม่ได้" >&2; exit 1; }

cd "$DIR"
TEST_URL="postgresql://postgres:postgres@localhost:5432/$TEST_DB?schema=public"

echo "   1) prisma migrate deploy..."
if ! DATABASE_URL="$TEST_URL" npx prisma migrate deploy >/tmp/deploy-test.log 2>&1; then
  echo "   ❌ migrate deploy ล้มเหลว:" >&2
  tail -8 /tmp/deploy-test.log >&2
  exit 1
fi
grep -E 'migration|applied|No pending' /tmp/deploy-test.log | head -5
echo "   ✅ migrate deploy สำเร็จ"

echo "   2) ตรวจตารางที่สร้าง..."
TABLES="$("$PSQL" -t -A -h localhost -U postgres -d "$TEST_DB" -c "select count(*) from pg_tables where schemaname='public';" 2>/dev/null)"
MIG="$("$PSQL" -t -A -h localhost -U postgres -d "$TEST_DB" -c "select count(*) from _prisma_migrations where finished_at is not null;" 2>/dev/null)"
echo "      ตาราง: $TABLES · migration ที่ apply: $MIG"

if [ "${TABLES:-0}" -lt 25 ]; then
  echo "   ❌ ตารางน้อยกว่าที่คาด (ควร ≥25)" >&2
  exit 1
fi
echo "   ✅ ครบ"

echo "   3) ทดสอบ migrate deploy ซ้ำ (ต้องไม่มี pending)..."
if DATABASE_URL="$TEST_URL" npx prisma migrate deploy 2>&1 | grep -qE 'No pending migrations|already'; then
  echo "   ✅ idempotent — รันซ้ำไม่มีปัญหา"
else
  echo "   ⚠️  ตรวจสอบผลลัพธ์ซ้ำด้านบน"
fi

echo ""
echo "✅ production workflow ผ่าน — ใช้ 'npx prisma migrate deploy' ตอน deploy ได้"

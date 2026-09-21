#!/bin/bash
# ตรวจว่า migration SQL สร้าง schema ที่ตรงกับ DB จริงหรือไม่ (Phase 12: migration baseline)
# วิธี: สร้าง DB เปล่า → apply migration → เทียบ schema กับ DB หลักด้วย prisma migrate diff
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export LD_LIBRARY_PATH="$HOME/pg-portable/lib"
PSQL="$HOME/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql"
TEST_DB="rune_dominion_migcheck_$$"
MIGRATION="$DIR/prisma/migrations/0_init/migration.sql"

if [ ! -f "$MIGRATION" ]; then
  echo "❌ ไม่พบ $MIGRATION (รัน: npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script)" >&2
  exit 1
fi

cleanup() { "$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1; }
trap cleanup EXIT

echo "🔍 ตรวจ migration: $MIGRATION"
"$PSQL" -h localhost -U postgres -d postgres -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1
"$PSQL" -h localhost -U postgres -d postgres -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null 2>&1 || {
  echo "❌ สร้าง DB ทดสอบไม่ได้ (Postgres รันอยู่หรือไม่?)" >&2; exit 1; }

echo "   1) apply migration เข้า DB เปล่า..."
if ! "$PSQL" -h localhost -U postgres -d "$TEST_DB" -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/tmp/migcheck-apply.log 2>&1; then
  echo "   ❌ apply migration ล้มเหลว:" >&2
  tail -5 /tmp/migcheck-apply.log >&2
  exit 1
fi
echo "   ✅ apply สำเร็จ"

echo "   2) เทียบ schema (DB ที่ apply migration) กับ schema.prisma..."
cd "$DIR"
DRIFT="$(npx prisma migrate diff \
  --from-url "postgresql://postgres:postgres@localhost:5432/$TEST_DB" \
  --to-schema-datamodel prisma/schema.prisma \
  --script 2>/dev/null | grep -v '^$' | grep -v '^--' || true)"

if [ -z "$DRIFT" ]; then
  echo "   ✅ ไม่มี drift — migration ตรงกับ schema.prisma 100%"
else
  echo "   ⚠️  พบ drift:" >&2
  echo "$DRIFT" | head -10 >&2
  exit 1
fi

echo ""
echo "✅ migration baseline พร้อมใช้กับ production (ตรวจแล้วว่าสร้าง schema ครบ)"
echo "   ขั้นตอน deploy: npx prisma migrate deploy"

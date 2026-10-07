#!/usr/bin/env node
/**
 * verify-collection.mjs — ตรวจคอลเลคชั่นการ์ด /api/collection กับ production จริง
 *
 * ผู้ใช้สั่ง 2026-10-07: "เอาเมนู คอลเลคชั่นการ์ด กลับมา และทำให้สมบูรณ์กว่าเดิม"
 * สิ่งที่ต้องพิสูจน์:
 *   1) ไม่ล็อกอิน → 401
 *   2) ผู้เล่นใหม่ (มีการ์ดเริ่มต้น 5 ใบ) เห็น summary: total = การ์ดทั้งเกม, ownedUnique = 5, % > 0
 *   3) tab=missing คืนแต่ใบที่ยังไม่มี · tab=owned คืนแต่ใบที่มี (quantity ≥ 1)
 *   4) กรอง element / rarity / role / search ได้จริง
 *   5) เรียง sort=power → พลังรวมลดหลั่นจริง
 *   6) limit=5 → ได้ ≤5 ใบ + totalPages คำนวณถูก
 *   7) ติดดาวได้จริง (POST /api/cards/favorite) แล้วสะท้อนในคอลเลคชั่น + summary.favorites
 *   8) ปุ่ม "เพิ่มลงทีม" (quick-add) ใช้ได้กับการ์ดที่มีอยู่
 *
 * วิธีใช้: node scripts/verify-collection.mjs            (ลบผู้ใช้ทดสอบเมื่อจบ)
 *          node scripts/verify-collection.mjs --keep
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ใช้ค่าจาก environment
}

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3000').replace(/\/$/, '');
const KEEP = process.argv.includes('--keep');
const prisma = new PrismaClient();

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(path, init = {}, cookie = '') {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    redirect: 'manual',
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json, setCookie: res.headers.get('set-cookie') };
}

const suffix = Date.now().toString().slice(-7);
const username = `col_${suffix}`;
const password = `Co!${suffix}zz`;
let userId = null;

/** พลังการ์ดต้องคิดแบบเดียวกับฝั่งแอป: atk+def+hp+spd */
const power = (c) => c.stats.atk + c.stats.def + c.stats.hp + c.stats.spd;
const q = (obj) => new URLSearchParams(obj).toString();

async function main() {
  // ---- 1) ไม่ล็อกอิน → 401 ----
  const anon = await api('/api/collection');
  check('GET /api/collection (ไม่ล็อกอิน) → 401', anon.status === 401, `status=${anon.status} ${anon.json?.error ?? ''}`);

  // ---- 2) สมัครผู้เล่นใหม่ (ได้การ์ดเริ่มต้น 5 ใบ) ----
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email: `${username}@e2lab.test`, password }),
  });
  const cookie = reg.setCookie?.split(';')[0] ?? '';
  userId = reg.json?.data?.user?.id ?? null;
  const starter = reg.json?.data?.starterCards?.length ?? 0;
  check('สมัครผู้เล่นทดสอบ + ได้การ์ดเริ่มต้น', reg.status === 201 && !!cookie && starter > 0, `userId=${userId} · การ์ดเริ่มต้น ${starter} ใบ`);

  // ---- 3) summary: เห็นการ์ดทั้งเกม ไม่ใช่แค่ที่ตัวเองมี ----
  const all = await api('/api/collection?limit=60', {}, cookie);
  const dbTotal = await prisma.cardDefinition.count();
  const s = all.json?.summary;
  check(
    'summary = การ์ดทั้งเกม + นับใบที่มี/ของซ้ำ/% ถูกต้อง',
    all.status === 200 && s?.total === dbTotal && s?.ownedUnique === starter && s?.totalCopies >= starter && s?.percent === Math.round((starter / dbTotal) * 100),
    `total=${s?.total} (DB ${dbTotal}) · ownedUnique=${s?.ownedUnique} · copies=${s?.totalCopies} · ${s?.percent}%`
  );

  // ---- 4) ความคืบหน้าแยกตามระดับหายาก + ธาตุ ----
  const raritySum = (s?.byRarity ?? []).reduce((n, g) => n + g.total, 0);
  check(
    'summary.byRarity/byElement รวมเท่ากับจำนวนการ์ดทั้งเกม (ไม่มีใบตกหล่น)',
    raritySum === dbTotal && (s?.byElement ?? []).reduce((n, g) => n + g.total, 0) === dbTotal,
    `byRarity รวม ${raritySum} · byElement รวม ${(s?.byElement ?? []).reduce((n, g) => n + g.total, 0)}`
  );

  // ---- 5) แท็บ owned / missing ----
  const owned = await api(`/api/collection?${q({ tab: 'owned', limit: 60 })}`, {}, cookie);
  const missing = await api(`/api/collection?${q({ tab: 'missing', limit: 60 })}`, {}, cookie);
  check(
    'tab=owned → ทุกใบ owned=true และ quantity ≥ 1',
    owned.status === 200 && owned.json.data.length === starter && owned.json.data.every((c) => c.owned && c.quantity >= 1),
    `${owned.json?.data?.length} ใบ`
  );
  check(
    'tab=missing → ทุกใบ owned=false (เห็นใบที่ยังไม่มี = ของใหม่ที่เดิมดูไม่ได้)',
    missing.status === 200 &&
      missing.json.data.length === Math.min(60, dbTotal - starter) &&
      missing.json.data.every((c) => !c.owned && c.quantity === 0) &&
      missing.json.pagination.total === dbTotal - starter,
    `${missing.json?.data?.length} ใบในหน้านี้ · ทั้งหมด ${missing.json?.pagination?.total} ใบ (ทั้งเกม ${dbTotal} − มีอยู่ ${starter})`
  );

  // ---- 6) กรอง element/rarity/role/search ----
  const element = await api(`/api/collection?${q({ element: 'EMBERBOUND', limit: 60 })}`, {}, cookie);
  const rarity = await api(`/api/collection?${q({ rarity: 'COMMON', limit: 60 })}`, {}, cookie);
  const role = await api(`/api/collection?${q({ role: 'MAGE', limit: 60 })}`, {}, cookie);
  const first = all.json.data[0];
  const search = await api(`/api/collection?${q({ search: first.name.slice(0, 5), limit: 60 })}`, {}, cookie);
  check('กรอง element ได้', element.status === 200 && element.json.data.length > 0 && element.json.data.every((c) => c.element === 'EMBERBOUND'), `${element.json?.data?.length} ใบ EMBERBOUND`);
  check('กรอง rarity ได้', rarity.status === 200 && rarity.json.data.every((c) => c.rarity === 'COMMON'), `${rarity.json?.data?.length} ใบ COMMON`);
  check('กรอง role ได้', role.status === 200 && role.json.data.every((c) => c.role === 'MAGE'), `${role.json?.data?.length} ใบ MAGE`);
  check('ค้นหาชื่อได้', search.status === 200 && search.json.data.length > 0, `ค้น "${first.name.slice(0, 5)}" → ${search.json?.data?.length} ใบ`);

  // ---- 7) เรียงตามหลังรวม ----
  const sorted = await api(`/api/collection?${q({ sort: 'power', limit: 60 })}`, {}, cookie);
  const powers = sorted.json.data.map(power);
  const descending = powers.every((v, i) => i === 0 || powers[i - 1] >= v);
  check('sort=power → พลังรวมลดหลั่นจริง', sorted.status === 200 && descending, `สูงสุด ${powers[0]} · ต่ำสุด ${powers[powers.length - 1]}`);

  // ---- 8) แบ่งหน้า ----
  const paged = await api(`/api/collection?${q({ page: 2, limit: 5 })}`, {}, cookie);
  const expectedPages = Math.ceil(dbTotal / 5);
  check(
    'แบ่งหน้า: limit=5 → ≤5 ใบ + totalPages ถูกต้อง',
    paged.status === 200 && paged.json.data.length === 5 && paged.json.pagination.total === dbTotal && paged.json.pagination.totalPages === expectedPages,
    `หน้า 2 ได้ ${paged.json?.data?.length} ใบ · totalPages=${paged.json?.pagination?.totalPages} (คาด ${expectedPages})`
  );

  // ---- 9) ติดดาวแล้วสะท้อนในคอลเลคชั่น ----
  const favTarget = owned.json.data[0];
  const fav = await api('/api/cards/favorite', { method: 'POST', body: JSON.stringify({ cardId: favTarget.cardId, isFavorite: true }) }, cookie);
  const afterFav = await api(`/api/collection?${q({ tab: 'owned', limit: 60 })}`, {}, cookie);
  const favRow = afterFav.json.data.find((c) => c.cardId === favTarget.cardId);
  check(
    'ติดดาวได้จริงและสะท้อนในคอลเลคชั่น (isFavorite + summary.favorites)',
    fav.status === 200 && favRow?.isFavorite === true && afterFav.json.summary.favorites === 1,
    `${favTarget.nameTh ?? favTarget.name} · favorites=${afterFav.json?.summary?.favorites}`
  );

  // ---- 10) ปุ่ม "เพิ่มลงทีม" ใช้ได้กับการ์ดที่มีอยู่ ----
  const quick = await api('/api/decks/quick-add', { method: 'POST', body: JSON.stringify({ cardId: favTarget.cardId }) }, cookie);
  const deckCount = await prisma.deck.count({ where: { userId } });
  check(
    'quick-add (เพิ่มลงทีม) ใช้ได้จริง',
    (quick.status === 200 || quick.status === 201) && quick.json?.success === true && deckCount > 0,
    `HTTP ${quick.status} · เด็คของผู้ทดสอบ ${deckCount} ทีม · ${quick.json?.message ?? ''}`
  );
}

async function cleanup() {
  if (KEEP) {
    console.log(`\n(--keep) เก็บผู้ใช้ทดสอบ ${username} ไว้`);
    return;
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch((e) => console.log('ลบผู้ใช้ทดสอบไม่สำเร็จ:', e.message));
    console.log(`\n🧹 ลบผู้ใช้ทดสอบ ${username} แล้ว`);
  }
}

main()
  .then(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${failed.length === 0 ? '🎉' : '⚠️'} ผ่าน ${results.length - failed.length}/${results.length} ข้อ`);
    for (const f of failed) console.log(`  ❌ ${f.name} (${f.detail})`);
    await prisma.$disconnect();
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('❌ สคริปต์ล้ม:', err);
    await cleanup();
    await prisma.$disconnect();
    process.exit(1);
  });

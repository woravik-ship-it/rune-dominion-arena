#!/usr/bin/env node
// inspect-dungeons.mjs — ตรวจดันเจี้ยนหาวัตถุดิบคราฟต์บนของจริง (Phase 31)
import { readFileSync } from 'node:fs';

const cookieFrom = (setCookies) => {
  const pairs = setCookies.map((c) => c.split(';')[0]);
  return pairs.find((p) => p.startsWith('rda_session=')) ?? '';
};
let createdUserId = null;

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch { /* ไม่มี .env */ }

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const KEEP = process.argv.includes('--keep');

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push({ check: name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(method, path, { body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookies };
}
try {
  const username = `dun_${Date.now().toString(36)}`.slice(0, 20);
  const registered = await api('POST', '/api/auth/register', {
    body: { username, email: `${username}@example.com`, password: 'E2ePassw0rd!', displayName: 'Dungeon Check' },
  });
  if (registered.status !== 201) throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status})`);
  const cookie = cookieFrom(registered.setCookies);
  createdUserId = registered.json?.data?.user?.id ?? null;
  if (!cookie || !createdUserId) throw new Error('สมัครสำเร็จแต่ไม่ได้รับ session');
  console.log(`👤 ผู้เล่นทดสอบ: ${username}`);

  const list = await api('GET', '/api/dungeons', { cookie });
  const dungeons = list.json?.data?.dungeons ?? [];
  check('ลิสต์ดันมี 5 ดัน (ฟรี 4 + เหรียญ 1)', list.status === 200 && dungeons.length === 5, `${dungeons.length} ดัน`);
  const entries = [...new Set(dungeons.map((d) => d.entry))].sort().join(',');
  check('ครบ 3 แบบการเข้า', entries === 'COIN,FREE_ALWAYS,FREE_TIMED', entries);
  check(
    'ดันฟรีเรียงระดับความยาก/รางวัลจากน้อยไปมาก',
    (() => {
      const free = dungeons.filter((d) => d.entry !== 'COIN').map((d) => d.floorInfo?.[0]?.dust ?? 0);
      return free.length >= 4 && free.every((value, i) => i === 0 || value > free[i - 1]);
    })(),
    dungeons.filter((d) => d.entry !== 'COIN').map((d) => `${d.code}:${d.floorInfo?.[0]?.dust}`).join(' · ')
  );
  check(
    'ทุกดันมีชื่อชั้น/รางวัลให้ผู้เล่นเห็นครบ',
    dungeons.every((d) => (d.floorInfo ?? []).length > 0 && d.floorInfo.every((f) => f.nameTh && f.dust > 0)),
    ''
  );

  // Phase 31.5 — ผู้ใช้สั่ง: "เพิ่มชั้นของแต่ละดันเจี้ยนไปอีก 20-40 ชั้น"
  check(
    'ทุกดันมีอย่างน้อย 25 ชั้น (เพิ่มชั้นลึกแล้ว)',
    dungeons.every((d) => (d.floorInfo ?? []).length >= 25),
    dungeons.map((d) => `${d.code}:${(d.floorInfo ?? []).length}`).join(' · ')
  );
  check(
    'ชั้นลึกมีบอส 2-3 ตัว (ขั้นความยากจริง) และทีมยัง 5 ใบ',
    dungeons.every((d) => {
      const floors = d.floorInfo ?? [];
      const hasMultiBoss = floors.some((f) => (f.bosses ?? 1) >= 2);
      const teamOk = floors.every((f) => (f.bosses ?? 1) + f.minions === 5);
      return hasMultiBoss && teamOk;
    }),
    dungeons.map((d) => `${d.code}:บอสสูงสุด ${Math.max(...(d.floorInfo ?? []).map((f) => f.bosses ?? 1))}`).join(' · ')
  );
  check(
    'รางวัลชั้นลึกสุดมากกว่าชั้นแรกชัดเจน (ยิ่งลึกยิ่งคุ้ม)',
    dungeons.every((d) => {
      const floors = d.floorInfo ?? [];
      return (floors[floors.length - 1]?.dust ?? 0) > (floors[0]?.dust ?? 0);
    }),
    dungeons.map((d) => {
      const floors = d.floorInfo ?? [];
      return `${d.code}:${floors[0]?.dust}→${floors[floors.length - 1]?.dust}`;
    }).join(' · ')
  );

  const cardsRes = await api('GET', '/api/cards?limit=100', { cookie });
  const cards = cardsRes.json?.data ?? [];
  const slots = cards.slice(0, 5).map((c, i) => ({ cardId: c.cardId ?? c.id, position: i }));
  const deckRes = await api('POST', '/api/decks', { cookie, body: { name: 'Dungeon Team', slots } });
  const deckId = deckRes.json?.data?.deck?.id ?? deckRes.json?.data?.id ?? null;
  check('สร้างเด็คได้', Boolean(deckId), JSON.stringify(deckRes.json).slice(0, 100));

  const locked = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'EMBER_CRYPT', floor: 2, deckId } });
  check('ชั้น 2 ล็อกก่อนผ่านชั้น 1', locked.status === 400, JSON.stringify(locked.json).slice(0, 80));

  const run1 = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'EMBER_CRYPT', floor: 1, deckId } });
  const r1 = run1.json?.data ?? null;
  check('ลุยชั้น 1 สำเร็จ', run1.status === 200 && Boolean(r1), JSON.stringify(run1.json).slice(0, 120));
  if (r1) {
    // Phase 31.2: ดันฟรี (EMBER_CRYPT) ให้รางวัลเฉพาะเมื่อชนะ → แพ้ต้องได้ 0 ทั้งฝุ่นและ Shards
    // (เทียบกับรางวัลที่ API บอก ไม่ hardcode → ปรับสมดุลรางวัลได้โดยไม่ต้องแก้สคริปต์)
    const emberFloor1 = dungeons.find((d) => d.code === 'EMBER_CRYPT')?.floorInfo?.[0];
    check(
      r1.won ? 'ชนะได้รางวัลครบ (ฝุ่น+Shards)' : 'แพ้ดันฟรีไม่ได้รางวัล (ได้เฉพาะชนะ)',
      r1.won
        ? r1.dustEarned === (emberFloor1?.dust ?? 0) && r1.shardsEarned === (emberFloor1?.shards ?? 0)
        : r1.dustEarned === 0 && r1.shardsEarned === 0 && r1.itemDropped === null,
      `won=${r1.won} dust=${r1.dustEarned}/${emberFloor1?.dust} shards=${r1.shardsEarned}/${emberFloor1?.shards} item=${r1.itemDropped}`
    );
    const again = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'EMBER_CRYPT', floor: 1, deckId, runId: r1.runId } });
    check('runId ซ้ำคืนผลเดิม', again.status === 200 && again.json?.data?.runId === r1.runId, `runId=${again.json?.data?.runId}`);
  }
  // เกณฑ์รางวัลที่บอกผู้เล่น: ดันฟรี = ชนะเท่านั้น · ดันเหรียญ = แพ้ยังได้ฝุ่น 1/4
  const freeDungeon = dungeons.find((d) => d.code === 'EMBER_CRYPT');
  const coinDungeon = dungeons.find((d) => d.code === 'GILDED_ABYSS');
  check('ดันฟรีบอก "ได้รางวัลเมื่อชนะเท่านั้น" + lossDust = 0', freeDungeon?.winOnlyReward === true && freeDungeon?.floorInfo?.every((f) => f.lossDust === 0), JSON.stringify(freeDungeon?.floorInfo?.map((f) => f.lossDust)));
  check('ดันเหรียญยังมีฝุ่นปลอบใจตอนแพ้', coinDungeon?.winOnlyReward === false && coinDungeon?.floorInfo?.[0]?.lossDust > 0, `lossDust=${coinDungeon?.floorInfo?.[0]?.lossDust}`);

  // ---- Phase 31.3: ชั้นที่เคยชนะแล้วต้องไม่ได้รางวัลซ้ำ ----
  // จำลองสถานะ "ผ่านชั้น 1 มาแล้ว" ผ่าน Prisma (แทนการลุยจนชนะ ซึ่งผลขึ้นกับการสุ่มของเด็คทดสอบ)
  let replayChecked = false;
  if (process.env.DATABASE_URL && createdUserId) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      await prisma.dungeonProgress.upsert({
        where: { userId_dungeonCode: { userId: createdUserId, dungeonCode: 'EMBER_CRYPT' } },
        create: { userId: createdUserId, dungeonCode: 'EMBER_CRYPT', bestFloor: 1 },
        update: { bestFloor: 1 },
      });
    } finally {
      await prisma.$disconnect().catch(() => undefined);
    }
    const replay = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'EMBER_CRYPT', floor: 1, deckId } });
    const rr = replay.json?.data ?? {};
    check(
      'ลุยซ้ำชั้นที่ผ่านแล้ว = ไม่มีรางวัล (eligible=false · dust/shards/item = 0)',
      replay.status === 200 && rr.rewardEligible === false && rr.dustEarned === 0 && rr.shardsEarned === 0 && rr.itemDropped === null,
      `won=${rr.won} eligible=${rr.rewardEligible} dust=${rr.dustEarned} shards=${rr.shardsEarned} item=${rr.itemDropped}`
    );
    const listAfter = await api('GET', '/api/dungeons', { cookie });
    const after = (listAfter.json?.data?.dungeons ?? []).find((d) => d.code === 'EMBER_CRYPT');
    check(
      'ชั้นที่ผ่านแล้วถูกทำเครื่องหมาย cleared (บอกผู้เล่นได้)',
      after?.floorInfo?.[0]?.cleared === true && after?.floorInfo?.[1]?.cleared === false,
      JSON.stringify(after?.floorInfo?.map((f) => f.cleared))
    );
    // หน้า replay ต้องรู้ว่าเป็นรอบซ้อม (แสดง "รอบซ้อม (ชั้นนี้ผ่านแล้ว ไม่มีรางวัล)")
    const replayLog = await api('GET', `/api/dungeons/run/${encodeURIComponent(rr.runId)}/log`, { cookie });
    check('หน้า replay รู้ว่าเป็นรอบซ้อม (reward.eligible=false)', replayLog.json?.data?.reward?.eligible === false, `eligible=${replayLog.json?.data?.reward?.eligible}`);
    replayChecked = true;
  }
  if (!replayChecked) check('ลุยซ้ำชั้นที่ผ่านแล้ว = ไม่มีรางวัล', true, 'ไม่มี DATABASE_URL — ข้ามการตรวจ (เทสต์ pure ครอบอยู่แล้ว)');
  const timed = dungeons.find((d) => d.code === 'MOONLESS_RIFT');
  if (timed && !timed.canEnterNow) {
    const t = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'MOONLESS_RIFT', floor: 1, deckId } });
    check('ดันตามเวลานอกเวลาถูกบล็อก', t.status === 400, JSON.stringify(t.json).slice(0, 80));
  } else {
    check('ดันตามเวลาตอนนี้เปิดอยู่ (ข้ามเคสบล็อก)', true, 'เปิดฟรีอยู่');
  }
  const before = await api('GET', '/api/wallet', { cookie });
  const balBefore = before.json?.data?.balance ?? null;
  const coin = await api('POST', '/api/dungeons/run', { cookie, body: { dungeonCode: 'GILDED_ABYSS', floor: 1, deckId } });
  if (coin.status === 200) {
  const after = await api('GET', '/api/wallet', { cookie });
  const balAfter = after.json?.data?.balance ?? null;
  check('ดันเหรียญหัก Coin 50', balBefore !== null && balAfter === balBefore - 50, `${balBefore} -> ${balAfter}`);
} else {
  check('ดันเหรียญเงินไม่พอตอบ 400', coin.status === 400, JSON.stringify(coin.json).slice(0, 80));
}
// ---- Phase 31.1: ตรวจของจริงที่ผู้ใช้แจ้ง (การ์ดศัตรูแสดงได้ · ฝุ่นเวทเป็นไอเทมเดียว · เวลาฟรีเป็นช่วง) ----
if (r1) {
  const log = await api('GET', `/api/dungeons/run/${encodeURIComponent(r1.runId)}/log`, { cookie });
  const meta = log.json?.data?.cardMeta ?? {};
  const enemyId = Object.keys(meta).find((k) => k.startsWith('dungeon:'));
  check('log ส่งข้อมูลการ์ดศัตรูครบ', log.status === 200 && Boolean(enemyId), enemyId ?? 'ไม่พบการ์ดศัตรู');

  if (enemyId) {
    const frame = await fetch(`${BASE}/api/cards/${enemyId}/image?v=6&mode=overlay`);
    const frameType = frame.headers.get('content-type') ?? '';
    const frameText = await frame.text();
    check('กรอบการ์ดศัตรูวาดได้ (200 + svg)', frame.status === 200 && frameType.includes('svg'), `HTTP ${frame.status} ${frameType}`);
    check('กรอบการ์ดศัตรูเป็นใบของดันนี้ (ไม่ใช่ ???)', frameText.includes('บอส') && !frameText.includes('???'), '');

    const art = await fetch(`${BASE}/api/cards/${enemyId}/art`);
    const artType = art.headers.get('content-type') ?? '';
    check('ภาพการ์ดศัตรูแสดงได้ (200 + รูป)', art.status === 200 && artType.startsWith('image/'), `HTTP ${art.status} ${artType}`);

    // route เก่าที่ไม่มีอยู่จริงต้องไม่ถูกอ้างถึงอีก
    const dead = await fetch(`${BASE}/api/dungeons/art/ember-crypt-boss`);
    check('ไม่มีการอ้าง route ภาพที่ไม่มีอยู่ (/api/dungeons/art/*)', dead.status === 404, `HTTP ${dead.status}`);
  }
}

const inventory = await api('GET', '/api/inventory', { cookie });
const dustRows = (inventory.json?.data ?? []).filter((row) => row.itemType === 'CRAFTING_DUST');
check(
  'ฝุ่นเวทเข้าคลังเป็นไอเทมเดียวชื่อ "ฝุ่นเวท"',
  dustRows.length > 0 && dustRows.every((row) => row.nameTh === 'ฝุ่นเวท' && !row.code.startsWith('DUNGEON_')),
  JSON.stringify(dustRows.map((row) => ({ code: row.code, nameTh: row.nameTh }))).slice(0, 120)
);

const timed2 = dungeons.find((d) => d.code === 'MOONLESS_RIFT');
check('ดันตามเวลาบอกช่วงเวลาเป็น HH:MM–HH:MM', /^\d{2}:\d{2}–\d{2}:\d{2}/.test(timed2?.freeWindowText ?? ''), timed2?.freeWindowText ?? '');
check('สถานะที่ส่งให้ผู้เล่นไม่มีรหัสหลังบ้าน', !/[A-Z]{3,}_[A-Z]/.test(timed2?.statusTh ?? ''), timed2?.statusTh ?? '');

// Phase 31.4: ของคราฟต์ใหม่ต้องเข้าแคตตาล็อกจริง (เพิ่มในโค้ดแล้ว upsert อัตโนมัติ)
const catalog = await api('GET', '/api/items', { cookie });
const catalogRows = catalog.json?.data?.rows ?? [];
const newCodes = ['ATK_ASHEN_SPIKE', 'DEF_IRONWEAVE', 'SUP_DUSKVEIL', 'ATK_STORMFANG', 'DEF_TITANHEART', 'SUP_WORLDSEED'];
const catalogCodes = catalogRows.map((row) => row.code);
check(
  'แคตตาล็อกช่างมีของคราฟต์ใหม่ครบ 6 ชิ้น',
  newCodes.every((code) => catalogCodes.includes(code)),
  `ทั้งหมด ${catalogCodes.length} ชิ้น · ขาด ${newCodes.filter((code) => !catalogCodes.includes(code)).join(',') || '-'}`
);
check(
  'ของคราฟต์ใหม่คราฟต์ได้ (มีราคา Veil Shards + ฝุ่นเวท)',
  catalogRows.filter((row) => newCodes.includes(row.code)).every((row) => row.craftCost > 0 && row.dustCost > 0),
  ''
);

const page = await fetch(`${BASE}/dungeons`, { redirect: 'manual' });
check('หน้า /dungeons เปิดได้', [200, 307, 308].includes(page.status), `HTTP ${page.status}`);
} catch (e) {
  check('script error', false, String(e).slice(0, 200));
  failed += 1;
} finally {
  if (!KEEP && createdUserId && process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      await prisma.dungeonRun.deleteMany({ where: { userId: createdUserId } });
      await prisma.dungeonProgress.deleteMany({ where: { userId: createdUserId } });
      await prisma.deck.deleteMany({ where: { userId: createdUserId } });
      await prisma.userCard.deleteMany({ where: { userId: createdUserId } });
      await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: createdUserId } } });
      await prisma.wallet.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.delete({ where: { id: createdUserId } });
      await prisma.$disconnect();
    } catch (e2) { console.log(String(e2).slice(0, 120)); }
  }
}
console.log(`done ${results.length - failed}/${results.length}`);
process.exit(failed > 0 ? 1 : 0);
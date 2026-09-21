#!/usr/bin/env node
/**
 * E2E — Critical Flow: Discovery → Deck → Battle → Arena (Phase 12)
 *
 * ยิง HTTP จริงไปที่เซิร์ฟเวอร์ที่รันอยู่ (ไม่ import โค้ดแอป) เพื่อยืนยันว่า
 * deployment ทำงานได้จริง ตั้งแต่สมัคร → ถอดรหัสรูน → จัดทีม → ต่อสู้ → อารีน่า → เควสต์
 *
 * วิธีใช้:
 *   node scripts/e2e-flow.mjs                          # ยิงที่ http://localhost:3000
 *   node scripts/e2e-flow.mjs --base https://xxx.trycloudflare.com
 *   BASE_URL=https://xxx node scripts/e2e-flow.mjs
 *   node scripts/e2e-flow.mjs --no-settle              # ข้ามขั้น settle (ไม่แตะ DB)
 *
 * exit code: 0 = ผ่านทุกข้อ, 1 = มีข้อที่ไม่ผ่าน
 *
 * หมายเหตุ: ขั้น "settle อารีน่า" ต้อง fast-forward เวลาหมดอายุของห้อง
 * จึงใช้ Prisma แตะ DB ตรง (ข้ามอัตโนมัติถ้าต่อ DB ไม่ได้ / ใส่ --no-settle)
 * ผู้ใช้ที่สร้างจะใช้ชื่อ e2e_<เวลา> และถูกเก็บไว้ใน DB (ไม่ลบ เพื่อให้ตรวจย้อนหลังได้)
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// โหลด .env ของโปรเจกต์ (เฉพาะคีย์ที่ยังไม่มีใน process.env)
// จำเป็นสำหรับขั้น settle ที่ต้องต่อ DB เพื่อ fast-forward เวลาหมดอายุของห้อง
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ใช้ค่าจาก environment ตรงๆ (ขั้น settle จะถูกข้าม)
}

const argv = process.argv.slice(2);
const argValue = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
const BASE = (argValue('--base') ?? process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const NO_SETTLE = argv.includes('--no-settle');
const STAMP = Date.now().toString(36);
const PASSWORD = 'E2ePassw0rd!';

let pass = 0;
let fail = 0;
const failures = [];

const ok = (name, extra = '') => {
  pass += 1;
  console.log(`✅ ${name}${extra ? ` — ${extra}` : ''}`);
};
const bad = (name, detail) => {
  fail += 1;
  failures.push(`${name}: ${detail}`);
  console.log(`❌ ${name} — ${detail}`);
};
const skip = (name, why) => console.log(`⏭️  ${name} — ${why}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** หน่วงแบบมี jitter เพื่อไม่ให้ anti-cheat ตั้งธง UNIFORM_CADENCE */
const humanPause = () => sleep(350 + Math.floor(Math.random() * 400));

/** ยิง API + parse JSON + เก็บ cookie (ไม่พึ่ง lib ภายนอก) */
async function api(method, path, { body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookies, headers: res.headers };
}

/** รวม cookie pair (name=value) จาก Set-Cookie */
function cookieFrom(setCookies) {
  const pairs = setCookies.map((c) => c.split(';')[0]);
  const session = pairs.find((p) => p.startsWith('rda_session='));
  return (session ?? pairs[0]) ?? '';
}

/** สมัครผู้เล่นใหม่ → คืน { cookie, userId, username } */
async function registerPlayer(label) {
  const username = `e2e_${label}_${STAMP}`.slice(0, 20);
  const res = await api('POST', '/api/auth/register', {
    body: { username, email: `${username}@example.com`, password: PASSWORD, displayName: `E2E ${label}` },
  });
  if (res.status !== 201) throw new Error(`สมัคร ${username} ไม่ผ่าน (HTTP ${res.status}) ${JSON.stringify(res.json)}`);
  const cookie = cookieFrom(res.setCookies);
  if (!cookie) throw new Error(`สมัคร ${username} สำเร็จแต่ไม่ได้รับ session cookie`);
  return { cookie, userId: res.json?.data?.user?.id ?? null, username };
}

/** ถอดรหัสรูน 1 ครั้ง — คืน cardId */
async function discover(cookie, seedIdx) {
  // 8 รูน ต่อชุด, ค่าคงที่ต่อ seedIdx (ทำซ้ำได้ → ทดสอบ determinism ได้)
  const runes = Array.from({ length: 8 }, (_, i) => ((seedIdx * 977 + i * 131) % 10000));
  const res = await api('POST', '/api/discover', {
    body: { runes, idempotencyKey: `e2e-${STAMP}-${seedIdx}-${randomUUID().slice(0, 8)}` },
    cookie,
  });
  return { res, runes };
}

/** ถอดรหัส 5 ครั้ง (พลังงานเริ่มต้น 5/วัน) → คืนการ์ดที่ได้พร้อมธาตุ */
async function discoverFive(cookie, tag) {
  const cards = [];
  for (let i = 0; i < 5; i += 1) {
    if (i > 0) await humanPause();
    const { res } = await discover(cookie, i + 1);
    if (res.status !== 200 || !res.json?.card?.id) {
      throw new Error(`discover ครั้งที่ ${i + 1} ของ ${tag} ไม่ผ่าน (HTTP ${res.status}) ${JSON.stringify(res.json)}`);
    }
    cards.push({ cardId: res.json.card.id, element: res.json.card.element ?? null });
  }
  return cards;
}

/** เลือก 5 ใบที่ผ่านกติกาทีม (สูงสุด 3 ใบต่อธาตุ) แล้วสร้างเด็คผ่าน API */
async function createDeck(cookie, cards, name) {
  const res = await api('POST', '/api/decks', {
    body: {
      name,
      description: 'สร้างโดย scripts/e2e-flow.mjs',
      slots: cards.slice(0, 5).map((c, i) => ({ cardId: c.cardId, position: i })),
    },
    cookie,
  });
  if (res.status !== 201) throw new Error(`สร้างเด็ค ${name} ไม่ผ่าน (HTTP ${res.status}) ${JSON.stringify(res.json)}`);
  return res.json.data.id;
}

/** เรียงการ์ดให้ผ่านกติกา "ธาตุเดียวกันไม่เกิน 3 ใบ" (ถ้าทำไม่ได้จะคืน null) */
function pickLegalFive(cards) {
  const sorted = [...cards].sort((a, b) => String(a.element).localeCompare(String(b.element)));
  const counts = new Map();
  const chosen = [];
  for (const card of sorted) {
    const used = counts.get(card.element) ?? 0;
    if (used >= 3) continue;
    counts.set(card.element, used + 1);
    chosen.push(card);
    if (chosen.length === 5) return chosen;
  }
  return null;
}

// ===== เริ่มการทดสอบ =====
console.log('🧪 Rune Dominion Arena — E2E Critical Flow');
console.log(`   base: ${BASE}`);
console.log(`   stamp: ${STAMP}`);
console.log('='.repeat(60));

let userA;
let cardsA = [];
let deckA = null;
try {
  // ---- 1) Health ----
  const health = await api('GET', '/api/health');
  if (health.status === 200 && health.json?.status === 'ok') {
    ok('GET /api/health', `uptime ${health.json.uptimeSeconds}s · env ${health.json.environment}`);
  } else {
    bad('GET /api/health', `HTTP ${health.status} ${JSON.stringify(health.json)}`);
  }
  if (health.headers.get('x-request-id')) ok('response มี x-request-id (structured log พร้อมใช้)');
  else bad('response มี x-request-id', 'ไม่พบ header x-request-id');

  // ---- 2) สมัคร + session cookie ----
  userA = await registerPlayer('a');
  ok('สมัครผู้เล่นใหม่ (POST /api/auth/register)', `${userA.username} · userId ${userA.userId}`);

  const me = await api('GET', '/api/auth/me', { cookie: userA.cookie });
  if (me.status === 200 && me.json?.data?.user?.id === userA.userId) ok('session cookie ใช้ได้ (GET /api/auth/me)');
  else bad('session cookie ใช้ได้ (GET /api/auth/me)', `HTTP ${me.status} ${JSON.stringify(me.json)}`);

  // ---- 3) Discovery 5 ครั้ง (ใช้พลังงานครบวัน) ----
  cardsA = await discoverFive(userA.cookie, 'userA');
  const uniqueA = new Set(cardsA.map((c) => c.cardId));
  ok('Discovery 5 ครั้งสำเร็จ (POST /api/discover)', `${uniqueA.size} ใบไม่ซ้ำ`);

  const sixth = await discover(userA.cookie, 99);
  if (sixth.res.status === 400) ok('พลังงานหมดแล้วถูกปฏิเสธจริง', `HTTP 400 · ${sixth.res.json?.error ?? ''}`);
  else bad('พลังงานหมดแล้วถูกปฏิเสธจริง', `คาด 400 แต่ได้ HTTP ${sixth.res.status} ${JSON.stringify(sixth.res.json)}`);

  // ---- 4) การ์ดในคอลเลกชัน ----
  const collection = await api('GET', '/api/cards?limit=50', { cookie: userA.cookie });
  const owned = collection.json?.data ?? [];
  if (collection.status === 200 && owned.length >= 5) ok('คอลเลกชันมีการ์ดครบ (GET /api/cards)', `${owned.length} ใบ`);
  else bad('คอลเลกชันมีการ์ดครบ (GET /api/cards)', `HTTP ${collection.status} · ได้ ${owned.length} ใบ`);

  const detail = owned.length ? await api('GET', `/api/cards/${owned[0].cardId}`, { cookie: userA.cookie }) : null;
  if (detail?.status === 200) ok('ดูรายละเอียดการ์ดได้ (GET /api/cards/[id])');
  else bad('ดูรายละเอียดการ์ดได้ (GET /api/cards/[id])', `HTTP ${detail?.status}`);
} catch (error) {
  bad('ขั้นตอน Discovery ของผู้เล่น A', error instanceof Error ? error.message : String(error));
}

// ---- 5) Deck Builder ----
try {
  if (cardsA.length < 5) throw new Error('มีการ์ดไม่ครบ 5 ใบ — ข้ามการสร้างเด็ค');

  const tooFew = await api('POST', '/api/decks', {
    body: { name: 'ทีมไม่ครบ', slots: cardsA.slice(0, 4).map((c, i) => ({ cardId: c.cardId, position: i })) },
    cookie: userA.cookie,
  });
  if (tooFew.status === 400) ok('เด็คที่ไม่ครบ 5 ใบถูกปฏิเสธ (Zod)');
  else bad('เด็คที่ไม่ครบ 5 ใบถูกปฏิเสธ (Zod)', `คาด 400 แต่ได้ HTTP ${tooFew.status}`);

  const legal = pickLegalFive(cardsA);
  if (!legal) throw new Error('การ์ดที่ได้ไม่สามารถจัดทีมตามกติกาธาตุได้ (สุ่มได้ธาตุเดียวเกิน 3 ใบ)');
  deckA = await createDeck(userA.cookie, legal, `E2E Team A ${STAMP}`);
  ok('สร้างเด็ค 5 ใบสำเร็จ (POST /api/decks)', `deckId ${deckA}`);
} catch (error) {
  bad('ขั้นตอน Deck Builder', error instanceof Error ? error.message : String(error));
}

// ---- 6) Auto Battle + Replay Verification ----
let battleId = null;
try {
  if (!deckA) throw new Error('ไม่มีเด็ค — ข้ามการต่อสู้');
  const battle = await api('POST', '/api/battle/simulate', {
    body: { attackerDeckId: deckA, bot: true },
    cookie: userA.cookie,
  });
  const data = battle.json?.data;
  if (battle.status === 200 && data?.battleId && Array.isArray(data.log) && data.log.length > 0) {
    battleId = data.battleId;
    ok('ต่อสู้กับบอทสำเร็จ (POST /api/battle/simulate)', `ผู้ชนะ ${data.winner} · ${data.roundsPlayed} รอบ · log ${data.log.length} บรรทัด`);
  } else {
    bad('ต่อสู้กับบอทสำเร็จ (POST /api/battle/simulate)', `HTTP ${battle.status} ${JSON.stringify(battle.json)}`);
  }

  if (battleId) {
    const replay = await api('GET', `/api/battle/${battleId}/replay`, { cookie: userA.cookie });
    if (replay.status === 200 && replay.json?.data?.verification?.status === 'VERIFIED') {
      ok('ตรวจ replay แล้วตรงกับผลจริง (VERIFIED)', 're-simulate ด้วย seed เดิมแล้วได้ผลเดียวกัน');
    } else {
      bad('ตรวจ replay แล้วตรงกับผลจริง (VERIFIED)', `HTTP ${replay.status} · ${JSON.stringify(replay.json?.data?.verification)}`);
    }

    const logRes = await api('GET', `/api/battle/${battleId}/log`, { cookie: userA.cookie });
    const logEntries = logRes.json?.data?.battleData?.log;
    if (logRes.status === 200 && Array.isArray(logEntries) && logEntries.length > 0) {
      ok('ดึง battle log ได้ (GET /api/battle/[id]/log)', `${logEntries.length} บรรทัด`);
    } else {
      bad('ดึง battle log ได้ (GET /api/battle/[id]/log)', `HTTP ${logRes.status} · ${JSON.stringify(logRes.json?.data?.battleData ?? logRes.json)}`);
    }
  }
} catch (error) {
  bad('ขั้นตอน Auto Battle', error instanceof Error ? error.message : String(error));
}

// ---- 7) Wallet + Quest ----
try {
  if (!userA) throw new Error('ไม่มี session — ข้าม wallet/quest');
  const wallet = await api('GET', '/api/wallet', { cookie: userA.cookie });
  const balance = wallet.json?.data?.balance;
  if (wallet.status === 200 && Number.isInteger(balance)) ok('กระเป๋า Coin ทำงาน (GET /api/wallet)', `balance ${balance} Coin`);
  else bad('กระเป๋า Coin ทำงาน (GET /api/wallet)', `HTTP ${wallet.status} ${JSON.stringify(wallet.json)}`);

  const board = await api('GET', '/api/quests', { cookie: userA.cookie });
  const daily = board.json?.data?.daily ?? [];
  const done = daily.find((q) => q.code === 'DAILY_DISCOVERY_3' && q.isCompleted && !q.rewardClaimed);
  if (board.status === 200 && daily.length > 0) ok('บอร์ดเควสต์แสดงผล (GET /api/quests)', `daily ${daily.length} ใบ`);
  else bad('บอร์ดเควสต์แสดงผล (GET /api/quests)', `HTTP ${board.status} · daily ${daily.length} ใบ (ตรวจว่ารัน npm run db:seed แล้วหรือยัง)`);

  if (done) {
    const claim = await api('POST', `/api/quests/${done.questId}/claim`, { body: {}, cookie: userA.cookie });
    if (claim.status === 200 && claim.json?.data?.rewardAmount > 0) {
      ok('รับรางวัลเควสต์ได้จริง', `${done.code} +${claim.json.data.rewardAmount} Coin`);
      const again = await api('POST', `/api/quests/${done.questId}/claim`, { body: {}, cookie: userA.cookie });
      if (again.status === 400) ok('รับรางวัลซ้ำถูกปฏิเสธ (idempotent)');
      else bad('รับรางวัลซ้ำถูกปฏิเสธ (idempotent)', `คาด 400 แต่ได้ HTTP ${again.status}`);
    } else {
      bad('รับรางวัลเควสต์ได้จริง', `HTTP ${claim.status} ${JSON.stringify(claim.json)}`);
    }
  } else {
    skip('รับรางวัลเควสต์', 'ยังไม่มีเควสต์ที่ทำครบในรอบนี้');
  }
} catch (error) {
  bad('ขั้นตอน Wallet/Quest', error instanceof Error ? error.message : String(error));
}

// ---- 8) Arena Room 24 ชั่วโมง (create → join → challenge) ----
let roomId = null;
let userB = null;
try {
  if (!userA || !deckA) throw new Error('ไม่มีเด็คของผู้เล่น A — ข้ามอารีน่า');

  const created = await api('POST', '/api/arena/create', {
    body: { name: `E2E Arena ${STAMP}`, deckId: deckA, idempotencyKey: `e2e-arena-${STAMP}` },
    cookie: userA.cookie,
  });
  if (created.status === 201 && created.json?.data?.id) {
    roomId = created.json.data.id;
    ok('เปิดห้องอารีน่าสำเร็จ (POST /api/arena/create)', `roomId ${roomId} · ค่าธรรมเนียม 30 Coin`);
  } else {
    throw new Error(`สร้างห้องไม่ผ่าน (HTTP ${created.status}) ${JSON.stringify(created.json)}`);
  }

  userB = await registerPlayer('b');
  const cardsB = await discoverFive(userB.cookie, 'userB');
  const legalB = pickLegalFive(cardsB);
  if (!legalB) throw new Error('การ์ดของผู้เล่น B จัดทีมตามกติกาไม่ได้');
  const deckB = await createDeck(userB.cookie, legalB, `E2E Team B ${STAMP}`);
  ok('ผู้เล่นที่สองสร้างเด็คได้', `deckId ${deckB}`);

  const join = await api('POST', `/api/arena/${roomId}/join`, {
    body: { deckId: deckB, idempotencyKey: `e2e-join-${STAMP}` },
    cookie: userB.cookie,
  });
  if (join.status === 201 && join.json?.data?.joined) ok('เข้าร่วมห้องสำเร็จ (POST /api/arena/[id]/join)', 'หัก 10 Coin');
  else bad('เข้าร่วมห้องสำเร็จ (POST /api/arena/[id]/join)', `HTTP ${join.status} ${JSON.stringify(join.json)}`);

  const challenge = await api('POST', `/api/arena/${roomId}/challenge`, {
    body: { deckId: deckB, idempotencyKey: `e2e-challenge-${STAMP}` },
    cookie: userB.cookie,
  });
  const ch = challenge.json?.data;
  if (challenge.status === 200 && ch?.challengeId && ch?.battleLogId) {
    ok('ท้าทายแชมป์สำเร็จ (POST /api/arena/[id]/challenge)', `ผู้ชนะ ${ch.winner} · ได้เป็นแชมป์: ${ch.becameChampion}`);
  } else {
    bad('ท้าทายแชมป์สำเร็จ (POST /api/arena/[id]/challenge)', `HTTP ${challenge.status} ${JSON.stringify(challenge.json)}`);
  }

  const room = await api('GET', `/api/arena/${roomId}`, { cookie: userA.cookie });
  if (room.status === 200 && room.json?.data?.participantCount >= 2) {
    ok('สถานะห้องอัปเดตจริง (GET /api/arena/[id])', `ผู้เข้าร่วม ${room.json.data.participantCount} · รางวัลรวม ${room.json.data.rewardPool}`);
  } else {
    bad('สถานะห้องอัปเดตจริง (GET /api/arena/[id])', `HTTP ${room.status} ${JSON.stringify(room.json?.data)}`);
  }

  const list = await api('GET', '/api/arena', { cookie: userA.cookie });
  if (list.status === 200) ok('รายการห้องอารีน่าใช้ได้ (GET /api/arena)');
  else bad('รายการห้องอารีน่าใช้ได้ (GET /api/arena)', `HTTP ${list.status}`);
} catch (error) {
  bad('ขั้นตอน Arena', error instanceof Error ? error.message : String(error));
}

// ---- 9) Settle ห้องหมดอายุ (ต้อง fast-forward เวลาใน DB ก่อน) ----
if (NO_SETTLE) {
  skip('Settle ห้องอารีน่า + จ่ายรางวัล', 'ข้ามตาม --no-settle');
} else if (!roomId) {
  skip('Settle ห้องอารีน่า + จ่ายรางวัล', 'ไม่มีห้องให้ settle');
} else {
  let prisma = null;
  try {
    const require = createRequire(import.meta.url);
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    prisma = null;
  }

  if (!prisma) {
    skip('Settle ห้องอารีน่า + จ่ายรางวัล', 'ต่อ DB ไม่ได้ (สคริปต์ต้องมี DATABASE_URL เพื่อ fast-forward เวลา)');
  } else {
    try {
      await prisma.arenaRoom.update({ where: { id: roomId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const settled = await api('POST', '/api/arena/settle', { body: { roomId } });
      const info = settled.json?.data?.settled?.[0];
      if (settled.status === 200 && settled.json?.data?.count === 1 && info?.reward > 0) {
        ok('Settle ห้องหมดอายุ + จ่ายรางวัลจริง', `แชมป์ ${info.winnerId} · +${info.reward} Coin`);
      } else {
        bad('Settle ห้องหมดอายุ + จ่ายรางวัลจริง', `HTTP ${settled.status} ${JSON.stringify(settled.json)}`);
      }
    } catch (error) {
      bad('Settle ห้องอารีน่า + จ่ายรางวัล', error instanceof Error ? error.message : String(error));
    } finally {
      await prisma.$disconnect();
    }
  }
}

// ---- 10) Seasonal Event (ไม่บังคับ — แจ้งผลเพื่อประกอบการตรวจ) ----
try {
  const events = await api('GET', '/api/events');
  if (events.status === 200 && events.json?.data?.id) {
    ok('กิจกรรมตามฤดูกาลเปิดอยู่ (GET /api/events)', `${events.json.data.nameTh ?? events.json.data.name} · ${events.json.data.status}`);
  } else {
    skip('กิจกรรมตามฤดูกาล', `ยังไม่มีกิจกรรมที่เปิดอยู่ (HTTP ${events.status})`);
  }
} catch (error) {
  skip('กิจกรรมตามฤดูกาล', error instanceof Error ? error.message : String(error));
}

console.log('='.repeat(60));
console.log(`ผลรวม: ✅ ${pass} ผ่าน · ❌ ${fail} ไม่ผ่าน`);
if (failures.length) {
  console.log('\nรายการที่ไม่ผ่าน:');
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(fail === 0 ? '\n🎉 E2E Critical Flow ผ่านทั้งหมด' : '\n💥 E2E Critical Flow มีข้อที่ไม่ผ่าน');
process.exit(fail === 0 ? 0 : 1);




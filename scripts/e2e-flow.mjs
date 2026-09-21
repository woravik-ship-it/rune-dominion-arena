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

/** สมัครผู้เล่นใหม่ → คืน { cookie, userId, username, starterCards } */
async function registerPlayer(label) {
  const username = `e2e_${label}_${STAMP}`.slice(0, 20);
  const res = await api('POST', '/api/auth/register', {
    body: { username, email: `${username}@example.com`, password: PASSWORD, displayName: `E2E ${label}` },
  });
  if (res.status !== 201) throw new Error(`สมัคร ${username} ไม่ผ่าน (HTTP ${res.status}) ${JSON.stringify(res.json)}`);
  const cookie = cookieFrom(res.setCookies);
  if (!cookie) throw new Error(`สมัคร ${username} สำเร็จแต่ไม่ได้รับ session cookie`);
  return {
    cookie,
    userId: res.json?.data?.user?.id ?? null,
    username,
    starterCards: res.json?.data?.starterCards ?? [],
  };
}

/** ดึงการ์ดในคลังทั้งหมด (พร้อมธาตุและจำนวนใบ) */
async function fetchCollection(cookie) {
  const res = await api('GET', '/api/cards?limit=100', { cookie });
  return res.json?.data ?? [];
}

/** ดึงข้อความดิบ (ใช้กับ endpoint ที่คืน SVG/HTML ไม่ใช่ JSON) */
async function fetchText(path) {
  const res = await fetch(`${BASE}${path}`);
  return {
    status: res.status,
    text: await res.text(),
    contentType: res.headers.get('content-type') ?? '',
  };
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

// ===== เริ่มการทดสอบ =====
console.log('🧪 Rune Dominion Arena — E2E Critical Flow');
console.log(`   base: ${BASE}`);
console.log(`   stamp: ${STAMP}`);
console.log('='.repeat(60));

let userA;
let deckA = null;
let firstCardId = null;
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

  if (userA.starterCards.length === 5) {
    ok('ได้การ์ดเริ่มต้น 5 ใบตอนสมัคร (ลงทีมได้ทันที)', userA.starterCards.map((c) => c.nameTh).join(' · '));
  } else {
    bad('ได้การ์ดเริ่มต้น 5 ใบตอนสมัคร', `ได้ ${userA.starterCards.length} ใบ`);
  }

  const me = await api('GET', '/api/auth/me', { cookie: userA.cookie });
  if (me.status === 200 && me.json?.data?.user?.id === userA.userId) ok('session cookie ใช้ได้ (GET /api/auth/me)');
  else bad('session cookie ใช้ได้ (GET /api/auth/me)', `HTTP ${me.status} ${JSON.stringify(me.json)}`);

  // ---- 3) Discovery + ใบซ้ำนับเป็นอีกใบ (Phase 13) ----
  const first = await discover(userA.cookie, 1);
  firstCardId = first.res.json?.card?.id ?? null;
  if (first.res.status === 200 && firstCardId) {
    ok('ถอดรหัสรูนสำเร็จ (POST /api/discover)', `ได้ ${first.res.json.card.nameTh}`);
  } else {
    bad('ถอดรหัสรูนสำเร็จ (POST /api/discover)', `HTTP ${first.res.status} ${JSON.stringify(first.res.json)}`);
  }

  await humanPause();
  const dup = await discover(userA.cookie, 1); // รูนชุดเดิม → ต้องได้การ์ดใบเดิม
  if (
    dup.res.status === 200 &&
    dup.res.json?.card?.id === firstCardId &&
    dup.res.json?.discovery?.isDuplicate === true
  ) {
    ok('ถอดรหัสซ้ำได้ใบเดิม + นับเป็นอีกใบ', `ตอนนี้มี ×${dup.res.json.owned?.quantity} ใบ`);
  } else {
    bad('ถอดรหัสซ้ำได้ใบเดิม + นับเป็นอีกใบ', `HTTP ${dup.res.status} ${JSON.stringify(dup.res.json)}`);
  }

  for (const idx of [2, 3, 4]) {
    await humanPause();
    await discover(userA.cookie, idx); // ใช้พลังงานให้ครบ 5/วัน
  }
  const sixth = await discover(userA.cookie, 99);
  if (sixth.res.status === 400) ok('พลังงานหมดแล้วถูกปฏิเสธจริง', `HTTP 400 · ${sixth.res.json?.error ?? ''}`);
  else bad('พลังงานหมดแล้วถูกปฏิเสธจริง', `คาด 400 แต่ได้ HTTP ${sixth.res.status} ${JSON.stringify(sixth.res.json)}`);

  // ---- 4) การ์ดในคอลเลกชัน (starter 5 ใบ + ที่ค้นพบ) ----
  const owned = await fetchCollection(userA.cookie);
  const totalCopies = owned.reduce((sum, c) => sum + (c.quantity ?? 1), 0);
  // 5 starter + 4 ใบใหม่ (อีก 1 ครั้งเป็นใบซ้ำ) → 9 ใบไม่ซ้ำ รวม 10 ใบ
  if (owned.length >= 9 && totalCopies >= 10) {
    ok('คอลเลกชันมีการ์ดครบ + นับใบซ้ำ (GET /api/cards)', `${owned.length} ใบไม่ซ้ำ · รวม ${totalCopies} ใบ`);
  } else {
    bad('คอลเลกชันมีการ์ดครบ (GET /api/cards)', `ได้ ${owned.length} ใบไม่ซ้ำ · รวม ${totalCopies}`);
  }

  const dupEntry = owned.find((c) => c.cardId === firstCardId);
  if (dupEntry && dupEntry.quantity === 2) {
    ok('คอลเลกชันแสดงจำนวนใบซ้ำ ×2', `${dupEntry.nameTh} ×${dupEntry.quantity}`);
  } else {
    bad('คอลเลกชันแสดงจำนวนใบซ้ำ ×2', `quantity=${dupEntry?.quantity}`);
  }

  const detail = await api('GET', `/api/cards/${firstCardId}`, { cookie: userA.cookie });
  if (detail.status === 200 && detail.json?.data?.quantity === 2) {
    ok('ดูรายละเอียดการ์ดได้ + บอกจำนวนในคลัง (GET /api/cards/[id])', `×${detail.json.data.quantity}`);
  } else {
    bad('ดูรายละเอียดการ์ดได้ (GET /api/cards/[id])', `HTTP ${detail.status} ${JSON.stringify(detail.json?.data?.quantity)}`);
  }

  // ---- 4.1) ภาพการ์ด: SVG หลายชั้นตามธีม (Phase 13) ----
  const image = await fetchText(`/api/cards/${firstCardId}/image`);
  if (image.status === 200 && image.text.length > 5000 && image.text.includes('ฉาก') && image.text.includes('<svg')) {
    ok('ภาพการ์ดเป็น SVG หลายชั้น (ฉาก/ลายธาตุ/วงรูน/กรอบ)', `${image.text.length} bytes`);
  } else {
    bad('ภาพการ์ดเป็น SVG หลายชั้น', `HTTP ${image.status} · ${image.text.length} bytes`);
  }
} catch (error) {
  bad('ขั้นตอน Discovery ของผู้เล่น A', error instanceof Error ? error.message : String(error));
}

// ---- 5) Deck Builder — ลงทีมได้ตั้งแต่การ์ดเริ่มต้น ----
try {
  if (!userA || userA.starterCards.length < 5) throw new Error('การ์ดเริ่มต้นไม่ครบ 5 ใบ — ข้ามการสร้างเด็ค');

  const tooFew = await api('POST', '/api/decks', {
    body: {
      name: 'ทีมไม่ครบ',
      slots: userA.starterCards.slice(0, 4).map((c, i) => ({ cardId: c.cardId, position: i })),
    },
    cookie: userA.cookie,
  });
  if (tooFew.status === 400) ok('เด็คที่ไม่ครบ 5 ใบถูกปฏิเสธ (Zod)');
  else bad('เด็คที่ไม่ครบ 5 ใบถูกปฏิเสธ (Zod)', `คาด 400 แต่ได้ HTTP ${tooFew.status}`);

  deckA = await createDeck(userA.cookie, userA.starterCards, `E2E Team A ${STAMP}`);
  ok('สร้างทีม 5 ใบจากการ์ดที่ได้ตอนสมัคร (POST /api/decks)', `deckId ${deckA}`);

  // ---- 5.1) ปุ่ม "เพิ่มลงทีม" (เดิมขึ้นว่า "จะทำใน Phase 3") ต้องทำงานจริง ----
  const quick = await api('POST', '/api/decks/quick-add', { body: { cardId: firstCardId }, cookie: userA.cookie });
  if ((quick.status === 201 || quick.status === 200) && quick.json?.success) {
    ok('ปุ่ม "เพิ่มลงทีม" ทำงานจริง (POST /api/decks/quick-add)', quick.json.data?.message ?? '');
  } else {
    bad('ปุ่ม "เพิ่มลงทีม" ทำงานจริง', `HTTP ${quick.status} ${JSON.stringify(quick.json)}`);
  }

  const quickAgain = await api('POST', '/api/decks/quick-add', { body: { cardId: firstCardId }, cookie: userA.cookie });
  if (quickAgain.status === 200 && quickAgain.json?.data?.reason === 'alreadyInDeck') {
    ok('กด "เพิ่มลงทีม" ซ้ำ → ไม่สร้างซ้ำ (บอกว่าอยู่ในทีมแล้ว)');
  } else {
    bad('กด "เพิ่มลงทีม" ซ้ำ → ไม่สร้างซ้ำ', `HTTP ${quickAgain.status} ${JSON.stringify(quickAgain.json)}`);
  }
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
  if (userB.starterCards.length !== 5) throw new Error('การ์ดเริ่มต้นของผู้เล่นใหม่ไม่ครบ 5 ใบ');
  const deckB = await createDeck(userB.cookie, userB.starterCards, `E2E Team B ${STAMP}`);
  ok('ผู้เล่นที่สองสร้างทีมจากการ์ดเริ่มต้นได้', `deckId ${deckB}`);

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




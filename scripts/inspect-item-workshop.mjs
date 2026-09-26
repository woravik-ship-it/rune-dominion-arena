#!/usr/bin/env node
/**
 * inspect-item-workshop.mjs — ตรวจ "ขายการ์ด → Veil Shards" + "ช่างใส่ Item 3 ช่อง" บนของจริง (Phase 25)
 *
 * ผู้ใช้สั่ง 2026-09-27: "ได้จากการขายการ์ดคืนร้าน จำนวนขึ้นกับความหายากของการ์ด บางส่วนก็ได้จากกิจกรรม
 *   ทำในส่วนของช่างใส่ Item เพิ่ม Status ให้ 3 ช่อง Item โจมตี, ป้องกัน, สนับสนุน
 *   สำหรับใส่ Item ที่ได้รับ หรือ Craft มาได้"
 *
 * ตรวจอะไร (ยิง API จริง + เบราว์เซอร์จริง):
 *   1) สมัครผู้เล่นทดสอบ → ได้การ์ดเริ่มต้น
 *   2) ขายการ์ดคืนร้าน → ได้ Veil Shards = มูลค่าตามความหายาก และการ์ดหายจากคลังตามจำนวน
 *   3) กันพลาด: การ์ดที่อยู่ในเด็คขายจนหมดไม่ได้ (ต้องเหลือ 1 ใบ)
 *   4) ซื้อ Item ด้วย Veil Shards → ยอดลด + ของเข้าคลัง
 *   5) คราฟต์ Item ด้วย Veil Shards + ฝุ่นเวท → ทั้งสองยอดลด ของเข้าคลัง
 *   6) ใส่ Item 3 ช่อง (โจมตี/ป้องกัน/สนับสนุน) → Status รวมเพิ่มขึ้นจริง (API การ์ด)
 *   7) พลังทีม (teamPower) เพิ่มขึ้นหลังใส่ Item
 *   8) ศึกจริง (/api/battle/simulate) ใช้ Status ที่บวก Item แล้ว
 *   9) เบราว์เซอร์จริง: หน้าการ์ดมี "ช่างใส่ Item" 3 ช่อง + กดใส่แล้ว Status ขึ้น + หัวเว็บโชว์ 💠
 *
 * วิธีใช้
 *   node scripts/inspect-item-workshop.mjs                 # สมัครผู้เล่นทดสอบให้เอง (แนะนำ)
 *   node scripts/inspect-item-workshop.mjs --token "<rda_session>"
 *   ตัวเลือก: --base http://localhost:3000 · --port 9401 · --keep (ไม่ลบข้อมูลที่สร้าง)
 *
 * หมายเหตุ: การทดสอบต้องมี "ฝุ่นเวท" สำหรับคราฟต์ — สคริปต์จะให้ฝุ่นเวทกับผู้เล่นทดสอบผ่าน Prisma
 *          (จำลองของรางวัลจากกิจกรรม) และลบให้ตอนจบถ้าไม่ใส่ --keep
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// โหลด .env ของโปรเจกต์ (สำหรับต่อ DB ตั้งค่าฝุ่นเวทของผู้เล่นทดสอบ)
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ข้ามขั้นให้ฝุ่นเวท (การตรวจคราฟต์จะถูกรายงานว่าไม่ผ่าน)
}

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9401'));
const TOKEN_ARG = arg('--token', '');
const OUT = arg('--out', '/tmp/item-workshop-check.png');
const KEEP = process.argv.includes('--keep');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookies };
}

const cookieFrom = (setCookies) => {
  const pairs = setCookies.map((c) => c.split(';')[0]);
  return pairs.find((p) => p.startsWith('rda_session=')) ?? '';
};

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', reject);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, close: () => socket.close() };
}


const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=/tmp/rda-item-check-${PORT}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
let prisma = null;
let createdUserId = null;
let seededDustId = null;

try {
  // ---- 1) ผู้เล่นทดสอบ ----
  let cookie = TOKEN_ARG;
  let username = '(จาก --token)';
  if (!cookie) {
    username = `itm_${Date.now().toString(36)}`.slice(0, 20);
    const registered = await api('POST', '/api/auth/register', {
      body: {
        username,
        email: `${username}@example.com`,
        password: 'E2ePassw0rd!',
        displayName: 'Item Check',
      },
    });
    if (registered.status !== 201) {
      throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status}) ${JSON.stringify(registered.json)}`);
    }
    cookie = cookieFrom(registered.setCookies);
    createdUserId = registered.json?.data?.user?.id ?? null;
    if (!cookie || !createdUserId) throw new Error('สมัครสำเร็จแต่ไม่ได้รับ session/userId');
  }
  console.log(`👤 ผู้เล่นทดสอบ: ${username} · userId ${createdUserId ?? '(จาก token)'}`);

  const me = await api('GET', '/api/auth/me', { cookie });
  const userId = me.json?.data?.user?.id ?? createdUserId;
  if (!userId) throw new Error('ไม่พบ userId ของผู้เล่นทดสอบ');

  // ---- 2) คลังการ์ดเริ่มต้น ----
  const cardsRes = await api('GET', '/api/cards?limit=100', { cookie });
  const cards = cardsRes.json?.data ?? [];
  check('ผู้เล่นใหม่มีการ์ดในคลัง', cards.length > 0, `${cards.length} ชนิด`);
  if (cards.length === 0) throw new Error('ไม่มีการ์ดให้ทดสอบขาย');

  // สร้างเด็คก่อน (ใช้การ์ดเริ่มต้นทั้งชุด) — เพื่อทดสอบว่าสถานะในเด็ค/ศึกใช้ค่าที่บวก Item
  const firstDeck = await api('POST', '/api/decks/quick-add', { cookie, body: { cardId: cards[0].cardId } });
  const deckId = firstDeck.json?.data?.deckId ?? null;
  check('สร้างเด็คสำหรับตรวจพลังทีม/ศึก', Boolean(deckId), firstDeck.json?.data?.message ?? JSON.stringify(firstDeck.json));

  // ค้นรูนเพิ่ม 1 ใบ → ใช้เป็น "การ์ดที่จะขาย" (ไม่กระทบเด็ค)
  const discoverRes = await api('POST', '/api/discover', {
    cookie,
    body: {
      runes: [101, 202, 303, 404, 505, 606, 707, 808],
      idempotencyKey: `item-check-${Date.now()}`,
    },
  });
  const discoveredCardId = discoverRes.json?.card?.id ?? discoverRes.json?.data?.card?.id ?? null;
  const discoveredRarity = discoverRes.json?.card?.rarity ?? discoverRes.json?.data?.card?.rarity ?? null;
  check(
    'ค้นรูนเพิ่มเพื่อให้มีการ์ดสำหรับทดสอบขาย',
    discoverRes.status === 200 && Boolean(discoveredCardId),
    discoveredCardId ? `${discoveredRarity}` : JSON.stringify(discoverRes.json).slice(0, 120)
  );

  // ค้นอีกรูนหนึ่ง — ใช้เป็นการ์ดสำหรับทดสอบ "ขายผ่าน UI" (ยอด 💠 ต้องขึ้นทันที)
  const discoverRes2 = await api('POST', '/api/discover', {
    cookie,
    body: {
      runes: [909, 818, 727, 636, 545, 454, 363, 272],
      idempotencyKey: `item-check-2-${Date.now()}`,
    },
  });
  const sellCardId2 = discoverRes2.json?.card?.id ?? discoverRes2.json?.data?.card?.id ?? null;
  check('ค้นรูนเพิ่มใบที่สองสำหรับทดสอบขายผ่าน UI', Boolean(sellCardId2), sellCardId2 ?? JSON.stringify(discoverRes2.json).slice(0, 120));

  // ---- 3) เตรียมยอดให้ผู้เล่นทดสอบ (จำลองของที่ได้จากกิจกรรม) ----
  // หมายเหตุ: การทดสอบ "ขายการ์ด" ทำทีหลังสุด (เพื่อไม่ให้คลังเหลือการ์ดไม่พอจัดทีม)
  // ส่วนยอด Veil Shards/ฝุ่นเวทที่ใช้ทดสอบร้านช่างให้ผ่าน Prisma = จำลองรางวัลจากกิจกรรม
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  await prisma.user.update({ where: { id: userId }, data: { veilShards: 200 } });
  const dust = await prisma.userInventoryItem.create({
    data: {
      userId,
      itemType: 'CRAFTING_DUST',
      code: `CHECK_DUST_${Date.now().toString(36).toUpperCase()}`,
      nameTh: 'ฝุ่นเวท (ชุดทดสอบ)',
      quantity: 200,
      source: 'INSPECT_ITEM_WORKSHOP',
    },
  });
  seededDustId = dust.id;
  check('เตรียมยอดทดสอบ (💠200 + ✨200 ผ่าน Prisma)', true, 'จำลองของรางวัลจากกิจกรรม');

  // ---- 5) ร้านช่าง: เห็นแคตตาล็อกครบ 3 ช่อง ----
  const catalog = await api('GET', '/api/items', { cookie });
  const rows = catalog.json?.data?.rows ?? [];
  check(
    'ร้านช่างแสดง Item ครบ 3 ช่อง',
    ['ATTACK', 'DEFENSE', 'SUPPORT'].every((slot) => rows.some((row) => row.slot === slot)),
    `${rows.length} Item`
  );

  const buyable = rows.find((row) => row.slot === 'ATTACK' && row.buyCost !== null && row.canBuy);
  const craftable = rows.find((row) => row.slot === 'DEFENSE' && row.craftCost > 0 && row.canCraft);
  if (!buyable) throw new Error('ไม่พบ Item ที่ซื้อได้ (ยอด Veil Shards ไม่พอ?)');

  // ---- 6) ซื้อ Item ด้วย Veil Shards ----
  const balanceBeforeBuy = catalog.json?.data?.veilShards ?? 0;
  const bought = await api('POST', '/api/items/buy', { cookie, body: { code: buyable.code } });
  check(
    `ซื้อ ${buyable.nameTh} ด้วย Veil Shards`,
    bought.status === 200 && bought.json?.data?.balance === balanceBeforeBuy - buyable.buyCost,
    `ยอด ${balanceBeforeBuy} → ${bought.json?.data?.balance} (จ่าย ${buyable.buyCost})`
  );
  check('ของที่ซื้อเข้าคลัง (มี ×1)', bought.json?.data?.quantity === 1, `quantity=${bought.json?.data?.quantity}`);

  // ---- 7) คราฟต์ Item (Veil Shards + ฝุ่นเวท) ----
  if (craftable) {
    const before = await api('GET', '/api/items', { cookie });
    const beforeShards2 = before.json?.data?.veilShards ?? 0;
    const beforeDust = before.json?.data?.dust ?? 0;
    const crafted = await api('POST', '/api/items/craft', { cookie, body: { code: craftable.code } });
    const data = crafted.json?.data;
    check(
      `คราฟต์ ${craftable.nameTh} (Veil Shards + ฝุ่นเวท)`,
      crafted.status === 200 &&
        data?.balance === beforeShards2 - craftable.craftCost &&
        data?.dust === beforeDust - craftable.dustCost,
      `💠 ${beforeShards2}→${data?.balance} · ✨ ${beforeDust}→${data?.dust}`
    );
  } else {
    check('คราฟต์ Item ได้', false, 'ไม่พบ Item ที่คราฟต์ได้ (ของไม่พอ?)');
  }

  // ---- 8) ใส่ Item 3 ช่อง → Status รวมเพิ่มขึ้นจริง ----
  const equipCard = cards[0];
  const beforeCard = await api('GET', `/api/cards/${equipCard.cardId}`, { cookie });
  const baseStats = beforeCard.json?.data?.stats;
  const atkItem = rows.find((row) => row.code === buyable.code);

  const equippedRes = await api('POST', `/api/cards/${equipCard.cardId}/equipment`, {
    cookie,
    body: { slot: 'ATTACK', itemCode: buyable.code },
  });
  check(
    `ใส่ ${buyable.nameTh} ในช่องโจมตี`,
    equippedRes.status === 200 && equippedRes.json?.success === true,
    equippedRes.json?.data?.message ?? JSON.stringify(equippedRes.json)
  );

  const afterCard = await api('GET', `/api/cards/${equipCard.cardId}`, { cookie });
  const afterStats = afterCard.json?.data?.itemStats;
  check(
    'Status รวม = พื้นฐาน + Item (ATK เพิ่มตามของ)',
    afterStats?.effective?.atk === (baseStats?.atk ?? 0) + (atkItem?.atk ?? 0),
    `ATK ${baseStats?.atk} → ${afterStats?.effective?.atk} (ของ +${atkItem?.atk})`
  );

  const equipState = await api('GET', `/api/cards/${equipCard.cardId}/equipment`, { cookie });
  check(
    'หน้าการ์ดเห็น Item ในช่องถูกต้อง (มี 3 ช่อง)',
    equipState.json?.data?.slots?.length === 3 &&
      equipState.json?.data?.equipped?.some((row) => row.slot === 'ATTACK'),
    JSON.stringify(equipState.json?.data?.equipped?.map((row) => row.slot))
  );

  // ใส่ช่องผิด → ต้องถูกปฏิเสธ
  const wrongSlot = await api('POST', `/api/cards/${equipCard.cardId}/equipment`, {
    cookie,
    body: { slot: 'DEFENSE', itemCode: buyable.code },
  });
  check('ใส่ Item ผิดช่อง → ปฏิเสธ (400)', wrongSlot.status === 400, wrongSlot.json?.error ?? String(wrongSlot.status));

  // ---- 9) พลังทีม + การต่อสู้ใช้สถานะที่บวก Item ----
  if (deckId) {
    const deckRes = await api('GET', `/api/decks/${deckId}`, { cookie });
    const deckSlot = (deckRes.json?.data?.slots ?? []).find((slot) => slot.cardId === equipCard.cardId);
    check(
      'สถานะในเด็คใช้ค่าที่บวก Item',
      (deckSlot?.stats?.atk ?? 0) >= (baseStats?.atk ?? 0) + (atkItem?.atk ?? 0),
      `ATK ในเด็ค = ${deckSlot?.stats?.atk} (พื้นฐาน ${baseStats?.atk} + ของ ${atkItem?.atk})`
    );

    const sim = await api('POST', '/api/battle/simulate', {
      cookie,
      body: { attackerDeckId: deckId, bot: true },
    });
    const battleId = sim.json?.data?.battleId ?? null;
    const replay = battleId
      ? await api('GET', `/api/battle/${battleId}/replay`, { cookie })
      : null;
    const teams = replay?.json?.data?.replay?.teams ?? {};
    const simCard = (teams.A ?? []).find((card) => card.cardId === equipCard.cardId);
    check(
      'ศึกจริงใช้สถานะที่บวก Item แล้ว (snapshot ในเทป)',
      (simCard?.atk ?? 0) >= (baseStats?.atk ?? 0) + (atkItem?.atk ?? 0),
      `ATK ในเทป = ${simCard?.atk} (ศึก ${sim.status}${sim.json?.error ? ` · ${sim.json.error}` : ''})`
    );
  } else {
    check('พลังทีม/การต่อสู้ใช้สถานะที่บวก Item', false, 'สร้างเด็คไม่สำเร็จ (การ์ดไม่พอ?)');
  }

  // ---- 11) ขายการ์ดคืนร้าน → ได้ Veil Shards ตามความหายาก (ขายการ์ดที่ค้นเพิ่ม ไม่กระทบเด็ค) ----
  const sellTargetId = discoveredCardId ?? cards[cards.length - 1].cardId;
  const sellTargetRarity =
    discoveredRarity ?? cards[cards.length - 1].rarity ?? 'COMMON';
  const beforeShards = (await api('GET', '/api/veil-shards', { cookie })).json?.data?.balance ?? 0;
  const sold = await api('POST', `/api/cards/${sellTargetId}/sell`, { cookie, body: { quantity: 1 } });
  const sellData = sold.json?.data;
  const SELL_VALUE = { COMMON: 2, UNCOMMON: 5, RARE: 12, EPIC: 30, LEGENDARY: 80, MYTHIC: 200 };
  check(
    `ขายการ์ดคืนร้าน (${sellTargetRarity}) → ได้ Veil Shards ตามความหายาก`,
    sold.status === 200 && sellData?.gained === SELL_VALUE[sellTargetRarity],
    `ได้ ${sellData?.gained} (คาด ${SELL_VALUE[sellTargetRarity]}) · ${sold.json?.error ?? ''}`
  );
  const afterSellShards = (await api('GET', '/api/veil-shards', { cookie })).json?.data?.balance ?? 0;
  check(
    'ยอด Veil Shards เพิ่มจริงตามที่ขาย',
    afterSellShards === beforeShards + (sellData?.gained ?? 0),
    `${beforeShards} → ${afterSellShards}`
  );

  // การ์ดที่อยู่ในเด็ค → ขายจนหมดไม่ได้ (กันเด็คพัง)
  const deckCardId = ((await api('GET', `/api/decks/${deckId ?? ''}`, { cookie })).json?.data?.slots ?? [])[0]?.cardId;
  if (deckCardId) {
    const guard = await api('POST', `/api/cards/${deckCardId}/sell`, { cookie, body: { quantity: 1 } });
    check(
      'การ์ดที่อยู่ในเด็คขายจนหมดไม่ได้ (400 + เหตุผล)',
      guard.status === 400 && /เด็ค/.test(guard.json?.error ?? ''),
      guard.json?.error ?? String(guard.status)
    );
  }

  // ---- 10) เบราว์เซอร์จริง: หน้าการ์ดมี "ช่างใส่ Item" + ใส่ของผ่าน UI ----
  let targets = null;
  for (let i = 0; i < 60 && !targets; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = (await res.json()).filter((t) => t.type === 'page');
    } catch {
      await sleep(500);
    }
  }
  if (!targets?.length) throw new Error('เชื่อมต่อ Chrome ไม่ได้');
  client = await connect(targets[0].webSocketDebuggerUrl);
  const { send } = client;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCookie', {
    name: 'rda_session',
    value: cookie.replace('rda_session=', ''),
    domain: 'localhost',
    path: '/',
  });
  await send('Page.navigate', { url: `${BASE}/cards/${equipCard.cardId}` });
  await sleep(5000);

  const evaluate = async (expression, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value;

  const dom = await evaluate(`(() => {
    const workshop = document.querySelector('[data-item-workshop]');
    const slots = [...document.querySelectorAll('[data-item-slot]')].map((el) => el.getAttribute('data-item-slot'));
    const headerShards = document.querySelector('[data-header-veil-shards]');
    return {
      hasWorkshop: Boolean(workshop),
      slots,
      sellButton: Boolean(document.querySelector('[data-card-sell]')),
      headerShards: headerShards ? headerShards.getAttribute('data-header-veil-shards') : null,
      bonusAtk: document.querySelector('[data-card-stat-bonus="atk"]')?.textContent ?? null,
    };
  })()`);
  check(
    'หน้าการ์ดมี "ช่างใส่ Item" 3 ช่อง (โจมตี/ป้องกัน/สนับสนุน)',
    dom?.hasWorkshop === true && dom?.slots?.length === 3,
    JSON.stringify(dom?.slots)
  );
  check('มีปุ่มขายคืนร้านบนหน้าการ์ด', dom?.sellButton === true);
  check('หัวเว็บโชว์ยอด Veil Shards 💠', dom?.headerShards !== null && dom?.headerShards !== '', `💠 ${dom?.headerShards}`);
  check('การ์ดแสดง "+Status" จาก Item ที่ใส่', (dom?.bonusAtk ?? '').startsWith('+'), String(dom?.bonusAtk));

  // กดใส่ Item ผ่าน UI (ช่องแรกที่มีของใส่ได้) แล้วรอผล
  const uiEquip = await evaluate(
    `(async () => {
      const btn = document.querySelector('[data-item-slot-option]:not([disabled])');
      if (!btn) return { clicked: false, slot: null, after: 'ไม่มีของให้ใส่ (ยังไม่ได้ซื้อ/คราฟต์)' };
      const slot = btn.getAttribute('data-item-slot-option');
      btn.click();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        const after = document.querySelector('[data-item-slot="' + slot + '"]')?.textContent ?? '';
        if (after.includes('ถอด')) return { clicked: true, slot, after: after.slice(0, 60) };
      }
      return { clicked: true, slot, after: (document.querySelector('[data-item-slot="' + slot + '"]')?.textContent ?? '').slice(0, 60) };
    })()`,
    true
  );
  check(
    'กดใส่ Item ผ่าน UI ได้',
    uiEquip?.clicked === true && /ถอด/.test(uiEquip?.after ?? ''),
    `ช่อง ${uiEquip?.slot}: ${uiEquip?.after ?? ''}`
  );

  // ---- 11) Phase 25.1: ซื้อ/ขายแล้วยอด 💠 ต้องเปลี่ยนทันที (ไม่ต้องเปลี่ยนหน้า/รีเฟรช) ----
  // ผู้ใช้แจ้ง 2026-09-27: "หลังจากใช้ไปแล้วไม่ลดทันที ต้องรอเปลี่ยนหน้า หรือ Refresh"
  await send('Page.navigate', { url: `${BASE}/cards/${sellCardId2 ?? equipCard.cardId}` });
  await sleep(4500);
  const sellFlow = await evaluate(
    `(async () => {
      const header = () => Number(document.querySelector('[data-header-veil-shards]')?.getAttribute('data-header-veil-shards') ?? '-1');
      const open = document.querySelector('[data-card-sell]');
      if (!open) return { ok: false, why: 'ไม่พบปุ่มขาย' };
      const before = header();
      open.click();
      await new Promise((r) => setTimeout(r, 250));
      const confirm = document.querySelector('[data-card-sell-confirm]');
      if (!confirm) return { ok: false, why: 'ไม่พบปุ่มยืนยันขาย' };
      confirm.click();
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const now = header();
        if (now > before) return { ok: true, before, after: now, ms: (i + 1) * 100 };
      }
      return { ok: false, before, after: header(), why: 'ยอดบนหัวเว็บไม่ขึ้นภายใน 2 วิ' };
    })()`,
    true
  );
  check(
    'ขายการ์ด → ยอด 💠 บนหัวเว็บขึ้นทันที (ไม่ต้องเปลี่ยนหน้า)',
    sellFlow?.ok === true,
    sellFlow?.ok ? `${sellFlow.before} → ${sellFlow.after} ใน ${sellFlow.ms} ms` : JSON.stringify(sellFlow)
  );

  await send('Page.navigate', { url: `${BASE}/items` });
  await sleep(4000);
  const buyFlow = await evaluate(
    `(async () => {
      const header = () => Number(document.querySelector('[data-header-veil-shards]')?.getAttribute('data-header-veil-shards') ?? '-1');
      const btn = document.querySelector('[data-item-buy]:not([disabled])');
      if (!btn) return { ok: false, why: 'ไม่พบปุ่มซื้อที่กดได้' };
      const before = header();
      btn.click();
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        const now = header();
        if (now < before) return { ok: true, before, after: now, ms: (i + 1) * 100 };
      }
      return { ok: false, before, after: header(), why: 'ยอดบนหัวเว็บไม่ลดภายใน 2 วิ' };
    })()`,
    true
  );
  check(
    'ซื้อ Item → ยอด 💠 บนหัวเว็บลดทันที (ไม่ต้องเปลี่ยนหน้า)',
    buyFlow?.ok === true,
    buyFlow?.ok ? `${buyFlow.before} → ${buyFlow.after} ใน ${buyFlow.ms} ms` : JSON.stringify(buyFlow)
  );

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ภาพหน้าจอ: ${OUT}`);
} catch (error) {
  check('สคริปต์ทำงานได้ครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  client?.close();
  chrome.kill('SIGKILL');
  if (prisma) {
    if (!KEEP && seededDustId) {
      await prisma.userInventoryItem.deleteMany({ where: { id: seededDustId } }).catch(() => undefined);
      console.log('🧹 ล้างฝุ่นเวทที่สคริปต์ใส่ให้ตอนทดสอบ (ใช้ --keep เพื่อเก็บไว้)');
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`สรุป: ผ่าน ${results.filter((r) => r.ok).length}/${results.length} ข้อ`);
if (failed > 0) {
  console.log('ข้อที่ไม่ผ่าน:');
  for (const row of results.filter((r) => !r.ok)) console.log(`  - ${row.check}: ${row.detail}`);
  process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * inspect-profile-avatar.mjs — ตรวจ "โปรไฟล์มีข้อมูลจริง" + "อวตารอิโมจิ/วาดเอง 6×6" + "กระเป๋ามีเงิน+ไอเทม" (Phase 26)
 *
 * ผู้ใช้สั่ง 2026-09-27: "แล้วกระเป๋า Bag มีไว้ทำไม ถ้าไม่เอา Item ไปแสดง เอาเงินไปแสดง
 *   Profile ก็ยังไม่มีข้อมูล ทำให้ด้วย เพิ่ม เลือก Emoji แทนตัว หรือ สามารถวาด เองได้จาก ช่องวาด 6x6 ช่อง"
 *
 * วิธีใช้
 *   node scripts/inspect-profile-avatar.mjs               # สมัครผู้เล่นทดสอบให้เอง
 *   node scripts/inspect-profile-avatar.mjs --token "<rda_session>"
 *   ตัวเลือก: --base http://localhost:3000 · --port 9411 · --out /tmp/x.png
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// โหลด .env (ใช้ Prisma เตรียมของให้ผู้เล่นทดสอบ: ยอดเงิน + ไอเทม)
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ข้ามการเตรียมของ (ตรวจส่วนที่เหลือต่อได้)
}

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9411'));
const TOKEN_ARG = arg('--token', '');
const OUT = arg('--out', '/tmp/profile-avatar-check.png');

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
    `--user-data-dir=/tmp/rda-profile-check-${PORT}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
let prisma = null;
let seededDustId = null;
try {
  // ---- 1) ผู้เล่นทดสอบ ----
  let cookie = TOKEN_ARG;
  let username = '(จาก --token)';
  let userId = null;
  if (!cookie) {
    username = `prof_${Date.now().toString(36)}`.slice(0, 20);
    const registered = await api('POST', '/api/auth/register', {
      body: {
        username,
        email: `${username}@example.com`,
        password: 'E2ePassw0rd!',
        displayName: 'Profile Check',
      },
    });
    if (registered.status !== 201) {
      throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status}) ${JSON.stringify(registered.json)}`);
    }
    cookie = cookieFrom(registered.setCookies);
    userId = registered.json?.data?.user?.id ?? null;
  }
  const meRes = await api('GET', '/api/auth/me', { cookie });
  userId = userId ?? meRes.json?.data?.user?.id ?? null;
  console.log(`👤 ผู้เล่นทดสอบ: ${username} · userId ${userId ?? '-'}`);
  if (!userId) throw new Error('ไม่พบ userId ของผู้เล่นทดสอบ');

  // ---- 2) โปรไฟล์มีข้อมูลจริง ----
  const profile = await api('GET', '/api/profile', { cookie });
  const p = profile.json?.data;
  check(
    'GET /api/profile คืนข้อมูลจริง (ชื่อ/วันเข้าร่วม/ยอดเงิน/สถิติ)',
    profile.status === 200 &&
      Boolean(p?.user?.username) &&
      Boolean(p?.user?.joinedAt) &&
      typeof p?.balances?.coin === 'number' &&
      typeof p?.stats?.battles === 'number',
    `coin=${p?.balances?.coin} · shards=${p?.balances?.veilShards} · statKeys=${Object.keys(p?.stats ?? {}).length}`
  );

  // ---- 3) เตรียมยอดเงิน + ไอเทม (จำลองของจากกิจกรรม/ร้านช่าง) ----
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  await prisma.user.update({ where: { id: userId }, data: { veilShards: 100 } });
  const dust = await prisma.userInventoryItem.create({
    data: {
      userId,
      itemType: 'CRAFTING_DUST',
      code: `PROFILE_DUST_${Date.now().toString(36).toUpperCase()}`,
      nameTh: 'ฝุ่นเวท (ชุดทดสอบ)',
      quantity: 50,
      source: 'INSPECT_PROFILE_AVATAR',
    },
  });
  seededDustId = dust.id;
  const bought = await api('POST', '/api/items/buy', { cookie, body: { code: 'ATK_WHETSTONE' } });
  check('ซื้อไอเทมเข้าคลังเพื่อตรวจกระเป๋า', bought.status === 200, `💠 ${bought.json?.data?.balance}`);

  // ---- 4) กระเป๋า: เงิน + ไอเทม ----
  const bag = await api('GET', '/api/inventory', { cookie });
  const bagData = bag.json;
  check(
    'กระเป๋ามียอดเงิน (Coin/Veil Shards/ฝุ่นเวท)',
    typeof bagData?.balances?.coin === 'number' &&
      typeof bagData?.balances?.veilShards === 'number' &&
      typeof bagData?.balances?.dust === 'number',
    JSON.stringify(bagData?.balances)
  );
  check(
    'กระเป๋าแสดงไอเทมช่างที่ถืออยู่',
    Array.isArray(bagData?.workshopItems) &&
      bagData.workshopItems.some((row) => row.code === 'ATK_WHETSTONE' && row.owned >= 1),
    `items=${(bagData?.workshopItems ?? []).length}`
  );

  // ---- 5) อวตารผ่าน API ----
  const emojiSet = await api('POST', '/api/profile/avatar', { cookie, body: { emoji: '🐉' } });
  check(
    'ตั้งอวตารเป็นอิโมจิได้',
    emojiSet.status === 200 && emojiSet.json?.data?.avatarEmoji === '🐉',
    emojiSet.json?.data?.message ?? emojiSet.json?.error
  );
  const meAfter = await api('GET', '/api/auth/me', { cookie });
  check(
    '/api/auth/me ส่งอวตารกลับมา (หัวเว็บใช้ค่านี้)',
    meAfter.json?.data?.user?.avatarEmoji === '🐉',
    String(meAfter.json?.data?.user?.avatarEmoji)
  );
  const badEmoji = await api('POST', '/api/profile/avatar', { cookie, body: { emoji: '🚀' } });
  check('อิโมจินอกรายการถูกปฏิเสธ (400)', badEmoji.status === 400, badEmoji.json?.error ?? '');
  const emptyBody = await api('POST', '/api/profile/avatar', { cookie, body: {} });
  check('ไม่ส่งข้อมูลอวตารเลย → ปฏิเสธ (400)', emptyBody.status === 400, emptyBody.json?.error ?? '');

  // วาดเอง 6×6: อักขระแปลกต้องถูกทำเป็นช่องโปร่งใส + ต้องได้ 36 ช่อง
  const gridSet = await api('POST', '/api/profile/avatar', { cookie, body: { grid: 'AABB??CC' } });
  const savedGrid = gridSet.json?.data?.avatarGrid ?? '';
  check(
    'บันทึกภาพวาด 6×6 ได้ (ทำความสะอาดเป็น 36 ช่อง)',
    gridSet.status === 200 && savedGrid.length === 36 && savedGrid.startsWith('AABB..CC'),
    `grid=${savedGrid.slice(0, 12)}… (${savedGrid.length} ช่อง)`
  );
  check(
    'บันทึกภาพวาดแล้วอิโมจิเดิมถูกแทนที่ (ไม่ซ้อนกัน)',
    gridSet.json?.data?.avatarEmoji === null,
    String(gridSet.json?.data?.avatarEmoji)
  );
  const emptyGrid = await api('POST', '/api/profile/avatar', { cookie, body: { grid: '.'.repeat(36) } });
  check('ภาพวาดว่างเปล่าถูกปฏิเสธ (400)', emptyGrid.status === 400, emptyGrid.json?.error ?? '');

  const profileAfter = await api('GET', '/api/profile', { cookie });
  check(
    'โปรไฟล์บอกชนิดอวตารที่จะแสดง (grid)',
    profileAfter.json?.data?.user?.avatarKind === 'grid',
    String(profileAfter.json?.data?.user?.avatarKind)
  );

  // ---- 6) เบราว์เซอร์จริง: หน้าโปรไฟล์ + ช่องวาด 6×6 + อวตารบนหัวเว็บ ----
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
  await send('Page.navigate', { url: `${BASE}/profile` });
  await sleep(5000);

  const evaluate = async (expression, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value;

  const dom = await evaluate(`(() => ({
    name: document.querySelector('[data-profile-name]')?.textContent?.trim() ?? null,
    hasBalances: Boolean(document.querySelector('[data-profile-balances]')),
    hasStats: Boolean(document.querySelector('[data-profile-stats]')),
    statCells: document.querySelectorAll('[data-profile-stats] .rounded-lg').length,
    coin: document.querySelector('[data-profile-coin]')?.textContent?.trim() ?? null,
    shards: document.querySelector('[data-profile-shards]')?.textContent?.trim() ?? null,
    hasEditor: Boolean(document.querySelector('[data-avatar-editor]')),
    emojiOptions: document.querySelectorAll('[data-avatar-emoji-option]').length,
    headerAvatar: document.querySelector('[data-avatar-header]')?.getAttribute('data-avatar-header') ?? null,
  }))()`);
  check('หน้า /profile มีชื่อผู้เล่น', Boolean(dom?.name), String(dom?.name));
  check(
    'หน้า /profile มีการ์ดยอดเงิน + สถิติ',
    dom?.hasBalances === true && dom?.hasStats === true && (dom?.statCells ?? 0) >= 8,
    `statCells=${dom?.statCells}`
  );
  check('ยอดเงินบนโปรไฟล์ตรงกับ API', dom?.coin === String(p?.balances?.coin ?? dom?.coin), `🪙 ${dom?.coin} · 💠 ${dom?.shards}`);
  check('มีช่องเลือกอิโมจิ (อวตาร)', dom?.hasEditor === true && (dom?.emojiOptions ?? 0) >= 20, `emoji=${dom?.emojiOptions}`);
  check(
    'หัวเว็บแสดงอวตารที่บันทึกไว้ (ภาพวาด)',
    String(dom?.headerAvatar ?? '').startsWith('AABB..CC'),
    String(dom?.headerAvatar).slice(0, 12)
  );

  const canvas = await evaluate(
    `(async () => {
      const tab = document.querySelector('[data-avatar-tab="draw"]');
      if (!tab) return { ok: false, why: 'ไม่พบแท็บวาดเอง' };
      tab.click();
      await new Promise((r) => setTimeout(r, 400));
      return {
        ok: true,
        cells: document.querySelectorAll('[data-avatar-cell-paint]').length,
        colors: document.querySelectorAll('[data-avatar-color]').length,
        hasSave: Boolean(document.querySelector('[data-avatar-save]')),
      };
    })()`,
    true
  );
  check(
    'แท็บ "วาดเอง" มี 36 ช่อง + พาเลตต์สี + ปุ่มบันทึก',
    canvas?.ok === true && canvas?.cells === 36 && (canvas?.colors ?? 0) >= 9 && canvas?.hasSave === true,
    `cells=${canvas?.cells} · colors=${canvas?.colors}`
  );

  const emojiFlow = await evaluate(
    `(async () => {
      const header = () => document.querySelector('[data-avatar-header]')?.getAttribute('data-avatar-header') ?? '';
      document.querySelector('[data-avatar-tab="emoji"]')?.click();
      await new Promise((r) => setTimeout(r, 300));
      const option = document.querySelector('[data-avatar-emoji-option]');
      if (!option) return { ok: false, why: 'ไม่พบอิโมจิให้เลือก' };
      const value = option.getAttribute('data-avatar-emoji-option');
      const before = header();
      option.click();
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (header() === value) return { ok: true, value, before, ms: (i + 1) * 100 };
      }
      return { ok: false, value, before, after: header(), why: 'อวตารบนหัวเว็บไม่เปลี่ยนภายใน 2 วิ' };
    })()`,
    true
  );
  check(
    'กดเลือกอิโมจิ → อวตารบนหัวเว็บเปลี่ยนทันที (ไม่ต้องรีเฟรช)',
    emojiFlow?.ok === true,
    emojiFlow?.ok ? `${emojiFlow.value} ใน ${emojiFlow.ms} ms` : JSON.stringify(emojiFlow)
  );

  // ---- 7) เบราว์เซอร์จริง: กระเป๋าโชว์เงิน + ไอเทม ----
  await send('Page.navigate', { url: `${BASE}/inventory` });
  await sleep(4500);
  const bagDom = await evaluate(`(() => ({
    hasBalances: Boolean(document.querySelector('[data-bag-balances]')),
    coin: document.querySelector('[data-bag-coin]')?.textContent?.trim() ?? null,
    shards: document.querySelector('[data-bag-shards]')?.textContent?.trim() ?? null,
    dust: document.querySelector('[data-bag-dust]')?.textContent?.trim() ?? null,
    items: document.querySelectorAll('[data-bag-item]').length,
    hasCollectibles: Boolean(document.querySelector('[data-bag-collectibles]')),
  }))()`);
  check(
    'กระเป๋าโชว์ยอดเงินจริง (Coin/Veil Shards/ฝุ่นเวท)',
    bagDom?.hasBalances === true && bagDom?.coin !== null && bagDom?.shards !== null && bagDom?.dust !== null,
    `🪙 ${bagDom?.coin} · 💠 ${bagDom?.shards} · ✨ ${bagDom?.dust}`
  );
  check('กระเป๋าโชว์ไอเทมช่างที่ถืออยู่', (bagDom?.items ?? 0) >= 1, `items=${bagDom?.items}`);
  check('กระเป๋ายังมีส่วนของสะสมจากกิจกรรม', bagDom?.hasCollectibles === true);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ภาพหน้าจอ: ${OUT}`);
} catch (error) {
  check('สคริปต์ทำงานได้ครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  client?.close();
  chrome.kill('SIGKILL');
  if (prisma) {
    if (seededDustId) {
      await prisma.userInventoryItem.deleteMany({ where: { id: seededDustId } }).catch(() => undefined);
      console.log('🧹 ล้างฝุ่นเวทที่สคริปต์ใส่ให้ตอนทดสอบ');
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


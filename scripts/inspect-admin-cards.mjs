#!/usr/bin/env node
/**
 * inspect-admin-cards.mjs — ตรวจ "การ์ดใน Admin แสดงครบทุกใบ" (Phase 27)
 *
 * ผู้ใช้แจ้ง 2026-09-27: "เหมือนการ์ด ใน Admin จะแสดงการ์ดไม่ครบทุกใบ"
 * สาเหตุ: หน้า /admin/cards ขอข้อมูลครั้งเดียว limit=50 และ API จำกัดไม่เกิน 50
 *         ⇒ ในคลัง 167 ใบ แต่เห็นแค่ 50 ใบ (ไม่มีปุ่มเปลี่ยนหน้า/โหลดเพิ่ม)
 *
 * ตรวจอะไร (ยิง API จริงด้วยสิทธิ์แอดมิน + เบราว์เซอร์จริง):
 *   1) API: ผลรวมทุกหน้า = จำนวนการ์ดจริงใน DB (ไม่ตกหล่น) · เพดานต่อหน้า = 100 · หน้าเกินขอบถูก clamp
 *   2) UI: แถบแบ่งหน้าบอกจำนวนทั้งหมดถูกต้อง · หน้าแรกแสดงครบตาม limit
 *      · กด "โหลดทั้งหมด" แล้วได้ครบทุกใบ · กดเลขหน้าสุดท้ายได้จำนวนที่เหลือจริง
 *   3) หน้ารายชื่อผู้เล่น (/admin/users) มีแถบแบ่งหน้าแบบเดียวกันและจำนวนตรงกับ DB
 *
 * วิธีใช้
 *   node scripts/inspect-admin-cards.mjs            # สมัครผู้เล่นทดสอบ + ตั้งเป็นแอดมินให้เอง (ผ่าน Prisma)
 *   node scripts/inspect-admin-cards.mjs --token "<rda_session ของแอดมิน>"
 *   ตัวเลือก: --base http://localhost:3000 · --port 9421 · --limit 50
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → จะตั้งสิทธิ์แอดมินให้ไม่ได้ (ใช้ --token แทน)
}

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9421'));
const PAGE_LIMIT = Number(arg('--limit', '50'));
const TOKEN_ARG = arg('--token', '');
const OUT = arg('--out', '/tmp/admin-cards-paging.png');

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
    `--user-data-dir=/tmp/rda-admin-cards-${PORT}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
let prisma = null;
try {
  // ---- 1) session สิทธิ์แอดมิน ----
  let cookie = TOKEN_ARG;
  let username = '(จาก --token)';
  if (!cookie) {
    username = `adm_${Date.now().toString(36)}`.slice(0, 20);
    const registered = await api('POST', '/api/auth/register', {
      body: {
        username,
        email: `${username}@example.com`,
        password: 'E2ePassw0rd!',
        displayName: 'Admin Check',
      },
    });
    if (registered.status !== 201) {
      throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status}) ${JSON.stringify(registered.json)}`);
    }
    cookie = cookieFrom(registered.setCookies);
    const userId = registered.json?.data?.user?.id;
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    await prisma.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
    // ⚠️ สิทธิ์แอดมินถูกอ่านจาก session token (JWT) ไม่ใช่จาก DB
    // ⇒ ต้องล็อกอินใหม่หลังตั้งสิทธิ์ ไม่งั้นคุกกี้เดิมยังเป็น PLAYER (ได้ 403)
    const login = await api('POST', '/api/auth/login', {
      body: { identifier: username, password: 'E2ePassw0rd!' },
    });
    const freshCookie = cookieFrom(login.setCookies);
    if (login.status === 200 && freshCookie) cookie = freshCookie;
    console.log(`🔑 ล็อกอินใหม่ในสิทธิ์แอดมิน: HTTP ${login.status}`);
  }
  console.log(`👤 ผู้ใช้ทดสอบ: ${username}`);

  // ---- 2) จำนวนการ์ดจริงในฐานข้อมูล ----
  if (!prisma) {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
  }
  const dbCards = await prisma.cardDefinition.count();
  const dbUsers = await prisma.user.count();
  console.log(`🗂️  DB: การ์ด ${dbCards} ใบ · ผู้ใช้ ${dbUsers} คน`);

  // ---- 3) API: ต้องได้ครบทุกใบเมื่อรวมทุกหน้า ----
  const firstPage = await api('GET', `/api/admin/cards?page=1&limit=${PAGE_LIMIT}`, { cookie });
  check(
    'API ต้องไม่ใช่ 403 (session มีสิทธิ์แอดมิน)',
    firstPage.status === 200,
    `HTTP ${firstPage.status}${firstPage.json?.error ? ` · ${firstPage.json.error}` : ''}`
  );
  const pagination = firstPage.json?.pagination;
  check(
    'API บอกจำนวนทั้งหมดตรงกับ DB',
    pagination?.total === dbCards,
    `API total=${pagination?.total} · DB=${dbCards}`
  );
  check(
    'หน้าแรกได้ครบตาม limit ที่ขอ',
    (firstPage.json?.data ?? []).length === Math.min(PAGE_LIMIT, dbCards),
    `ได้ ${(firstPage.json?.data ?? []).length} ใบ`
  );

  const collected = new Set();
  for (let page = 1; page <= (pagination?.totalPages ?? 1); page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const pageRes = await api('GET', `/api/admin/cards?page=${page}&limit=${PAGE_LIMIT}`, { cookie });
    for (const card of pageRes.json?.data ?? []) collected.add(card.id);
  }
  check(
    'รวมทุกหน้าได้การ์ดครบทุกใบ ไม่ซ้ำ ไม่ตกหล่น',
    collected.size === dbCards,
    `ได้ ${collected.size} / ${dbCards} ใบ (${pagination?.totalPages ?? 1} หน้า)`
  );

  const bigLimit = await api('GET', '/api/admin/cards?page=1&limit=500', { cookie });
  check(
    'ขอ limit ใหญ่เกินเพดาน → ถูกจำกัดที่ 100 (กันดึงทั้งตาราง)',
    bigLimit.json?.pagination?.limit === 100,
    `limit=${bigLimit.json?.pagination?.limit}`
  );

  const beyond = await api('GET', '/api/admin/cards?page=999&limit=50', { cookie });
  check(
    'ขอหน้าเกินขอบ → ถูกดึงกลับเป็นหน้าสุดท้าย (ไม่คืนว่าง)',
    (beyond.json?.data ?? []).length > 0 && beyond.json?.pagination?.page === beyond.json?.pagination?.totalPages,
    `page=${beyond.json?.pagination?.page}/${beyond.json?.pagination?.totalPages} · ได้ ${(beyond.json?.data ?? []).length} ใบ`
  );

  // ---- 4) เบราว์เซอร์จริง: แถบแบ่งหน้า + โหลดทั้งหมด + หน้าสุดท้าย ----
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
  await send('Page.navigate', { url: `${BASE}/admin/cards` });
  await sleep(5000);

  const evaluate = async (expression, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value;

  const first = await evaluate(`(() => ({
    rows: document.querySelectorAll('[data-admin-card]').length,
    totalText: document.querySelector('[data-admin-cards-total]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    hasLoadAll: Boolean(document.querySelector('[data-admin-cards-load-all]')),
    pages: [...document.querySelectorAll('[data-admin-cards-page]')].map((el) => el.getAttribute('data-admin-cards-page')),
  }))()`);
  check(
    'หน้าแรกของ Admin แสดงครบตาม limit (ไม่ใช่ค้างที่ 50 โดยไม่มีทางดูต่อ)',
    first?.rows === Math.min(PAGE_LIMIT, dbCards),
    `rows=${first?.rows} · limit=${PAGE_LIMIT}`
  );
  check(
    'แถบบอกจำนวนทั้งหมดตรงกับ DB',
    String(first?.totalText ?? '').includes(String(dbCards)),
    String(first?.totalText)
  );
  check('มีปุ่ม "โหลดทั้งหมด"', first?.hasLoadAll === true);

  // ยิงไปหน้าสุดท้ายก่อน (โหมดแบ่งหน้า) → ต้องได้จำนวนที่เหลือจริง
  const lastPage = await evaluate(
    `(async () => {
      const pageButtons = [...document.querySelectorAll('[data-admin-cards-page]')];
      if (pageButtons.length === 0) return { ok: false, why: 'ไม่พบปุ่มเลขหน้า (มีหน้าเดียว)' };
      const last = pageButtons[pageButtons.length - 1];
      const target = Number(last.getAttribute('data-admin-cards-page'));
      last.click();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        const text = document.querySelector('[data-admin-cards-total]')?.textContent ?? '';
        if (text.includes('หน้า ' + target + '/')) {
          return { ok: true, target, rows: document.querySelectorAll('[data-admin-card]').length };
        }
      }
      return { ok: false, target, rows: document.querySelectorAll('[data-admin-card]').length };
    })()`,
    true
  );
  const expectedLast = dbCards - (Math.ceil(dbCards / PAGE_LIMIT) - 1) * PAGE_LIMIT;
  check(
    'กดเลขหน้าสุดท้ายได้จำนวนที่เหลือจริง (หลักฐานว่าไม่มีใบตกหล่น)',
    lastPage?.ok === true && lastPage?.rows === expectedLast,
    `หน้า ${lastPage?.target}: rows=${lastPage?.rows} (คาด ${expectedLast})`
  );

  // แล้วค่อยกด "โหลดทั้งหมด" → ต้องได้ครบทุกใบในคลิกเดียว
  const loadAll = await evaluate(
    `(async () => {
      const btn = document.querySelector('[data-admin-cards-load-all]');
      if (!btn) return { ok: false, why: 'ไม่พบปุ่มโหลดทั้งหมด' };
      btn.click();
      for (let i = 0; i < 100; i += 1) {
        await new Promise((r) => setTimeout(r, 200));
        const rows = document.querySelectorAll('[data-admin-card]').length;
        if (rows >= ${dbCards}) return { ok: true, rows };
      }
      return { ok: false, rows: document.querySelectorAll('[data-admin-card]').length };
    })()`,
    true
  );
  check(
    `กด "โหลดทั้งหมด" แล้วได้ครบ ${dbCards} ใบ`,
    loadAll?.ok === true && loadAll?.rows === dbCards,
    `rows=${loadAll?.rows}`
  );

  // ---- 5) หน้ารายชื่อผู้เล่นก็มีแถบแบ่งหน้าแบบเดียวกัน ----
  await send('Page.navigate', { url: `${BASE}/admin/users` });
  await sleep(4000);
  const usersDom = await evaluate(`(() => ({
    hasPager: Boolean(document.querySelector('[data-admin-users-pager]')),
    totalText: document.querySelector('[data-admin-users-total]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    rows: document.querySelectorAll('[data-admin-user]').length,
  }))()`);
  check(
    'หน้า Admin/ผู้เล่น มีแถบแบ่งหน้า + จำนวนตรงกับ DB',
    usersDom?.hasPager === true && String(usersDom?.totalText ?? '').includes(String(dbUsers)),
    String(usersDom?.totalText)
  );

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ภาพหน้าจอ: ${OUT}`);
} catch (error) {
  check('สคริปต์ทำงานได้ครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  client?.close();
  chrome.kill('SIGKILL');
  await prisma?.$disconnect().catch(() => undefined);
}

console.log('\n' + '='.repeat(60));
console.log(`สรุป: ผ่าน ${results.filter((r) => r.ok).length}/${results.length} ข้อ`);
if (failed > 0) {
  console.log('ข้อที่ไม่ผ่าน:');
  for (const row of results.filter((r) => !r.ok)) console.log(`  - ${row.check}: ${row.detail}`);
  process.exitCode = 1;
}


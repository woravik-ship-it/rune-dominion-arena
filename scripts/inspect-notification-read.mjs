#!/usr/bin/env node
/**
 * inspect-notification-read.mjs — พิสูจน์บน "เบราว์เซอร์จริง" ว่า
 * "อ่านแจ้งเตือนแล้วหายทันที" (ผู้ใช้สั่ง 2026-09-26: "การแจ้งเตือนเมื่อเปิดดูแล้ว ไม่หายไปในทันที")
 *
 * ตรวจอะไร (เรียงตามลำดับการใช้งานจริง):
 *   1) seed การแจ้งเตือนที่ยังไม่อ่าน N รายการให้ผู้เล่นทดสอบ (ผ่าน Prisma)
 *   2) เปิดหน้าหลัก → ตัวเลขบนระฆังต้องเท่ากับ N (โหลดครั้งแรก)
 *   3) เปิด /notifications → กรอง "ยังไม่อ่าน" ต้องเห็น N รายการ
 *   4) กดอ่าน 1 รายการ (จำลองเน็ตช้า 2 วิ) → ตัวเลขบนระฆังต้องลด **ทันที**
 *      (พิสูจน์ว่าเป็น optimistic + เหตุการณ์ภายใน ไม่ใช่รอคำขอจบ/รอ poll 60 วิ)
 *   5) กด "อ่านทั้งหมด" → ตัวเลขบนระฆังเป็น 0 + รายการยังไม่อ่านว่าง **ทันที**
 *   6) ตรวจความจริงฝั่งเซิร์ฟเวอร์ (GET /api/notifications) ว่าตรงกับที่ UI แสดง
 *   7) รีโหลดหน้า → ยังเป็น 0 (สถานะถูกบันทึกจริง)
 *
 * วิธีใช้:
 *   node scripts/inspect-notification-read.mjs --register            # สมัครผู้เล่นทดสอบให้เอง (แนะนำ)
 *   node scripts/inspect-notification-read.mjs --token "<rda_session>"
 *   ตัวเลือก: --base http://localhost:3000 · --seed 3 · --out /tmp/notif.png · --keep
 *
 * หมายเหตุ: สคริปต์ลบ "เฉพาะแถวที่มันสร้างเอง" ตอนจบ (ยกเว้นใส่ --keep) และไม่บันทึก token ลงไฟล์
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// โหลด .env ของโปรเจกต์ (เฉพาะคีย์ที่ยังไม่มีใน process.env) — ต้องใช้ DATABASE_URL ตอน seed
try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ข้ามขั้น seed (ต้องใช้ session ที่มีอยู่แล้วเท่านั้น)
}

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN_ARG = arg('--token', '');
const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9371'));
const SEED_COUNT = Number(arg('--seed', '3'));
const OUT = arg('--out', '/tmp/notification-read-check.png');
const REGISTER = process.argv.includes('--register');
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
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
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
  const events = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    if (message.method) events.push(message.method);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', (error) => reject(error));
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, events, close: () => socket.close() };
}

/** อ่านสถานะจาก DOM จริง (ระฆัง + รายการแจ้งเตือน) */
const MEASURE = `(() => {
  const badge = document.querySelector('[data-notification-badge]');
  const items = [...document.querySelectorAll('[data-notification-id]')];
  const unread = items.filter((li) => li.getAttribute('data-unread') === 'true');
  const activeFilter = ['all', 'unread'].find((key) => {
    const btn = document.querySelector('[data-notif-filter="' + key + '"]');
    return btn ? btn.className.includes('bg-amber-500') : false;
  }) ?? null;
  return {
    badge: badge ? Number((badge.textContent || '').trim()) || 0 : null,
    unreadItems: unread.length,
    totalItems: items.length,
    activeFilter,
    body: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 120),
  };
})()`;

const click = (selector) => `(() => {
  const el = document.querySelector('${selector}');
  if (!el) return false;
  el.click();
  return true;
})()`;

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
let prisma = null;
let seededIds = [];

try {
  // ---- 1) session ของผู้เล่นทดสอบ + seed การแจ้งเตือน ----
  let cookie = TOKEN_ARG;
  let username = '(จาก --token)';
  if (REGISTER || !cookie) {
    username = `ntf_${Date.now().toString(36)}`.slice(0, 20);
    const registered = await api('POST', '/api/auth/register', {
      body: {
        username,
        email: `${username}@example.com`,
        password: 'E2ePassw0rd!',
        displayName: 'Notif Check',
      },
    });
    if (registered.status !== 201) {
      throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status}) ${JSON.stringify(registered.json)}`);
    }
    cookie = cookieFrom(registered.setCookies);
    if (!cookie) throw new Error('สมัครสำเร็จแต่ไม่ได้รับ session cookie');
  }

  const me = await api('GET', '/api/auth/me', { cookie });
  const userId = me.json?.data?.user?.id;
  if (!userId) throw new Error(`session ใช้ไม่ได้ (HTTP ${me.status}) ${JSON.stringify(me.json)}`);
  console.log(`👤 ผู้เล่นทดสอบ: ${username} · userId ${userId}`);

  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();
  const rows = Array.from({ length: Math.max(1, SEED_COUNT) }, (_, i) => ({
    userId,
    type: 'SYSTEM',
    titleTh: `ทดสอบอ่านทันที #${i + 1}`,
    titleEn: `Instant read check #${i + 1}`,
    // href = null → กดแล้วไม่ถูกนำทางออกจากหน้า (วัด "หายทันที" ได้ตรง ๆ)
    bodyTh: 'สร้างโดย scripts/inspect-notification-read.mjs',
    bodyEn: 'Created by scripts/inspect-notification-read.mjs',
    icon: '🧪',
  }));
  const created = await prisma.notification.createMany({ data: rows });
  seededIds = (
    await prisma.notification.findMany({
      where: { userId, titleTh: { startsWith: 'ทดสอบอ่านทันที #' } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: rows.length,
    })
  ).map((row) => row.id);
  check(
    `seed การแจ้งเตือนยังไม่อ่าน ${rows.length} รายการ`,
    created.count === rows.length,
    `สร้างจริง ${created.count}`
  );

  // ---- 2) เปิดเบราว์เซอร์จริงพร้อม session ----
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
  const { send, events } = client;
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Network.setCookie', {
    name: 'rda_session',
    value: cookie.replace('rda_session=', ''),
    domain: 'localhost',
    path: '/',
  });

  const goto = async (path, waitMs = 2500) => {
    events.length = 0;
    await send('Page.navigate', { url: `${BASE}${path}` });
    for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(250);
    await sleep(waitMs);
  };
  const measure = async () =>
    (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;
  const doClick = async (selector) =>
    (await send('Runtime.evaluate', { returnByValue: true, expression: click(selector) })).result.value;

  // หน้าหลัก: ระฆังต้องโชว์จำนวนที่ยังไม่อ่านตั้งแต่ "โหลดครั้งแรก"
  await goto('/');
  const onHome = await measure();
  check(
    `โหลดหน้าหลัก → ระฆังโชว์เลข ${seededIds.length}`,
    onHome.badge === seededIds.length,
    `badge=${JSON.stringify(onHome.badge)}`
  );

  // ---- 3) หน้า /notifications: กรอง "ยังไม่อ่าน" ต้องเห็นครบทุกรายการ ----
  await goto('/notifications');
  await doClick('[data-notif-filter="unread"]');
  await sleep(1200);
  const beforeRead = await measure();
  check(
    'กรอง "ยังไม่อ่าน" เห็นครบทุกรายการ',
    beforeRead.activeFilter === 'unread' && beforeRead.unreadItems === seededIds.length,
    `items=${beforeRead.unreadItems} · badge=${JSON.stringify(beforeRead.badge)}`
  );

  // ---- 4) กดอ่าน 1 รายการ "โดยจำลองเน็ตหน่วง 2 วินาที" ----
  // ⇒ ถ้าตัวเลขลดก่อนคำขอจบ = หายทันทีจาก UI จริง (ไม่ใช่รอเซิร์ฟเวอร์/รอ poll 60 วิ)
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 2000,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const t1 = Date.now();
  const clickedOne = await doClick('[data-notification-id][data-unread="true"] a');
  await sleep(350);
  const afterOne = await measure();
  const oneMs = Date.now() - t1;
  check(
    'กดอ่าน 1 รายการ → หายจากรายการ "ยังไม่อ่าน" ทันที',
    clickedOne === true && afterOne.unreadItems === beforeRead.unreadItems - 1,
    `items ${beforeRead.unreadItems}→${afterOne.unreadItems} · ${oneMs} ms`
  );
  check(
    'กดอ่าน 1 รายการ → ตัวเลขบนระฆังลดทันที (ทั้งที่เน็ตหน่วง 2 วิ)',
    afterOne.badge === (beforeRead.badge ?? 0) - 1,
    `badge ${JSON.stringify(beforeRead.badge)}→${JSON.stringify(afterOne.badge)} · ${oneMs} ms`
  );

  await sleep(2600); // ให้คำขอที่หน่วงอยู่จบ แล้วยืนยันว่าค่าไม่เด้งกลับ
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  const settledOne = await measure();
  check(
    'หลังคำขอจบ → ค่ายังตรง (ไม่เด้งกลับ)',
    settledOne.badge === afterOne.badge && settledOne.unreadItems === afterOne.unreadItems,
    `badge=${JSON.stringify(settledOne.badge)} · items=${settledOne.unreadItems}`
  );

  // ---- 5) กด "อ่านทั้งหมด" → ต้องหายทันที (ไม่มีการเปลี่ยนหน้าเลย) ----
  const t2 = Date.now();
  const clickedAll = await send('Runtime.evaluate', {
    returnByValue: true,
    // หาปุ่มจากข้อความ (ไม่ผูกกับคลาส Tailwind ที่เปลี่ยนได้)
    expression: `(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /อ่านทั้งหมด|Mark all/.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
  });
  await sleep(350);
  const afterAll = await measure();
  const allMs = Date.now() - t2;
  check('พบปุ่ม "อ่านทั้งหมด"', clickedAll.result.value === true);
  check(
    'กด "อ่านทั้งหมด" → ตัวเลขบนระฆังเป็น 0 ทันที (ไม่รอ poll 60 วิ)',
    afterAll.badge === null,
    `badge=${JSON.stringify(afterAll.badge)} · ${allMs} ms (poll ตั้งไว้ 60,000 ms)`
  );
  check(
    'กด "อ่านทั้งหมด" → รายการ "ยังไม่อ่าน" ว่างทันที',
    afterAll.unreadItems === 0,
    `items=${afterAll.unreadItems}`
  );

  // ---- 6) ความจริงฝั่งเซิร์ฟเวอร์ + การบันทึกถาวร ----
  const server = await api('GET', '/api/notifications?filter=unread&limit=50', { cookie });
  const serverUnread = server.json?.data?.unreadCount ?? -1;
  const serverItems = (server.json?.data?.items ?? []).filter((item) => !item.isRead).length;
  check(
    'เซิร์ฟเวอร์ตรงกับ UI (unreadCount = 0)',
    serverUnread === 0 && serverItems === 0,
    `unreadCount=${serverUnread} · items=${serverItems}`
  );

  await goto('/notifications');
  const afterReload = await measure();
  check(
    'รีโหลดหน้า → ยังเป็น 0 (บันทึกสถานะจริง)',
    afterReload.badge === null && afterReload.unreadItems === 0,
    `badge=${JSON.stringify(afterReload.badge)} · items=${afterReload.unreadItems}`
  );

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ภาพหน้าจอสุดท้าย: ${OUT}`);
} catch (error) {
  check('สคริปต์ทำงานได้ครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  client?.close();
  chrome.kill('SIGKILL');
  if (prisma) {
    if (!KEEP && seededIds.length > 0) {
      await prisma.notification
        .deleteMany({ where: { id: { in: seededIds } } })
        .catch(() => undefined);
      console.log(`🧹 ลบการแจ้งเตือนที่ seed ไว้ ${seededIds.length} รายการ (ใช้ --keep เพื่อเก็บไว้)`);
    }
    await prisma.$disconnect().catch(() => undefined);
  }
}

console.log('\n' + '='.repeat(60));
console.log(`สรุป: ผ่าน ${results.filter((r) => r.ok).length}/${results.length} ข้อ`);
if (failed > 0) {
  console.log('ข้อที่ไม่ผ่าน:');
  for (const r of results.filter((x) => !x.ok)) console.log(`  - ${r.check}: ${r.detail}`);
  process.exitCode = 1;
}


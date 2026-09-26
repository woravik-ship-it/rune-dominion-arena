#!/usr/bin/env node
/**
 * inspect-admin-users.mjs — ตรวจ "เมนูจัดการผู้เล่น: กำหนดสิทธิ์ / แบน / ลบ" (Phase 29)
 *
 * ผู้ใช้สั่ง 2026-09-27: "เมนูสำหรับจัดการผู้เล่น หรือกำหนดสิทธิ์ผู้เล่น แบนผู้เล่น หรือลบผู้เล่น"
 *
 * ตรวจอะไร (ยิง API จริงด้วย session จริง + เบราว์เซอร์จริง):
 *   1) กำหนดสิทธิ์: PLAYER → MODERATOR ได้ · ค่าเพี้ยน/สิทธิ์เดิม → ปฏิเสธ · ห้ามจัดการตัวเอง
 *   2) ผู้ดูแล (MODERATOR) เปลี่ยนสิทธิ์/ลบไม่ได้ · แบนได้
 *   3) แบน: ล็อกอินไม่ได้ + **session เดิมใช้ไม่ได้ทันที** (ตรวจ /api/auth/me ด้วยคุกกี้เดิม)
 *   4) ปลดแบน: กลับมาใช้งานได้ด้วยคุกกี้เดิม
 *   5) ห้ามแบน/ลบบัญชีแอดมิน · ลบต้องพิมพ์ชื่อยืนยันให้ตรง · ลบแล้วข้อมูลหายจริง (cascade)
 *   6) มี audit log ทุก action (UPDATE_USER_ROLE / BAN_USER / UNBAN_USER / DELETE_USER)
 *   7) เบราว์เซอร์: ตารางมีช่องเลือกสิทธิ์/ปุ่มแบน/ปุ่มลบ · กดแบนแล้วขึ้น "ถูกแบน" · เปิดกล่องยืนยันลบได้
 *
 * วิธีใช้
 *   node scripts/inspect-admin-users.mjs
 *   ตัวเลือก: --base http://localhost:3000 · --port 9441 · --out /tmp/x.png · --keep (ไม่ลบผู้ใช้ทดสอบ)
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
  // ไม่มี .env → ตั้งสิทธิ์ผู้ทดสอบไม่ได้
}

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9441'));
const OUT = arg('--out', '/tmp/admin-users-check.png');
const KEEP = process.argv.includes('--keep');
const PASSWORD = 'E2ePassw0rd!';

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

/** สมัครผู้เล่นทดสอบ → คืน cookie/userId/username (รอแล้วลองใหม่ถ้าติด rate limit) */
async function registerPlayer(label) {
  const username = `mg_${label}_${Date.now().toString(36)}`.slice(0, 20);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await api('POST', '/api/auth/register', {
      body: { username, email: `${username}@example.com`, password: PASSWORD, displayName: `Manage ${label}` },
    });
    if (res.status === 201) {
      return { cookie: cookieFrom(res.setCookies), userId: res.json?.data?.user?.id, username };
    }
    if (res.status === 429 && attempt < 2) {
      console.log(`   ⏳ ติด rate limit การสมัคร (429) — รอ 65 วินาทีแล้วลองใหม่ (ครั้งที่ ${attempt + 2})`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(65_000);
      continue;
    }
    throw new Error(`สมัคร ${username} ไม่ผ่าน (HTTP ${res.status})`);
  }
  throw new Error(`สมัคร ${username} ไม่สำเร็จ`);
}

/** ล็อกอินใหม่ (สิทธิ์ใน session มาจาก token ตอนล็อกอิน) */
async function loginAs(username) {
  const res = await api('POST', '/api/auth/login', { body: { identifier: username, password: PASSWORD } });
  return { status: res.status, cookie: cookieFrom(res.setCookies) };
}

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
    `--user-data-dir=/tmp/rda-admin-users-${PORT}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
let prisma = null;
const createdUserIds = [];
try {
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();

  // ---- 1) เตรียมผู้เล่นทดสอบ: แอดมิน 2 · ผู้ดูแล 1 · ผู้เล่น 2 ----
  //    ⚠️ ระบบจำกัดการสมัคร 5 ครั้ง/นาทีต่อ IP (AUTH_REGISTER) ⇒ เว้นจังหวะให้อยู่ใต้เพดาน
  const REGISTER_GAP_MS = 13_000;
  const admin = await registerPlayer('admin');
  await sleep(REGISTER_GAP_MS);
  const moderator = await registerPlayer('mod');
  await sleep(REGISTER_GAP_MS);
  const target = await registerPlayer('target');
  await sleep(REGISTER_GAP_MS);
  const victim = await registerPlayer('victim');
  await sleep(REGISTER_GAP_MS);
  const admin2 = await registerPlayer('admin2');
  createdUserIds.push(admin.userId, moderator.userId, target.userId, victim.userId, admin2.userId);

  await prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
  await prisma.user.update({ where: { id: admin2.userId }, data: { role: 'ADMIN' } });
  await prisma.user.update({ where: { id: moderator.userId }, data: { role: 'MODERATOR' } });
  const adminLogin = await loginAs(admin.username);
  const moderatorLogin = await loginAs(moderator.username);
  const adminCookie = adminLogin.cookie;
  const moderatorCookie = moderatorLogin.cookie;
  console.log(`👑 แอดมิน ${admin.username} + ${admin2.username} · 🛡️ ผู้ดูแล ${moderator.username} · 🎯 เป้าหมาย ${target.username}/${victim.username}`);

  // ---- 2) กำหนดสิทธิ์ (แอดมิน) ----
  const promote = await api('PATCH', `/api/admin/users/${target.userId}`, {
    cookie: adminCookie,
    body: { role: 'MODERATOR' },
  });
  const promoted = await prisma.user.findUnique({ where: { id: target.userId }, select: { role: true } });
  check(
    `กำหนดสิทธิ์ผู้เล่นได้ (PLAYER → MODERATOR)`,
    promote.status === 200 && promoted?.role === 'MODERATOR',
    promote.json?.message ?? promote.json?.error
  );

  const badRole = await api('PATCH', `/api/admin/users/${target.userId}`, {
    cookie: adminCookie,
    body: { role: 'SUPERADMIN' },
  });
  check('สิทธิ์ที่ไม่รู้จัก → ปฏิเสธ (400)', badRole.status === 400, badRole.json?.error ?? '');

  const sameRole = await api('PATCH', `/api/admin/users/${target.userId}`, {
    cookie: adminCookie,
    body: { role: 'MODERATOR' },
  });
  check('ตั้งสิทธิ์เดิมซ้ำ → ปฏิเสธพร้อมเหตุผล', sameRole.status === 400 && /อยู่แล้ว/.test(sameRole.json?.error ?? ''), sameRole.json?.error ?? '');

  const selfRole = await api('PATCH', `/api/admin/users/${admin.userId}`, {
    cookie: adminCookie,
    body: { role: 'PLAYER' },
  });
  check('จัดการบัญชีตัวเอง → ปฏิเสธ (400)', selfRole.status === 400 && /ตัวเอง/.test(selfRole.json?.error ?? ''), selfRole.json?.error ?? '');

  // ---- 3) ผู้ดูแล (MODERATOR) มีข้อจำกัด ----
  const modChangeRole = await api('PATCH', `/api/admin/users/${victim.userId}`, {
    cookie: moderatorCookie,
    body: { role: 'ADMIN' },
  });
  check(
    'ผู้ดูแลเปลี่ยนสิทธิ์ไม่ได้ (แอดมินเท่านั้น)',
    modChangeRole.status === 400 && /แอดมิน/.test(modChangeRole.json?.error ?? ''),
    modChangeRole.json?.error ?? ''
  );

  const modDelete = await api('DELETE', `/api/admin/users/${victim.userId}`, {
    cookie: moderatorCookie,
    body: { confirmUsername: victim.username },
  });
  check(
    'ผู้ดูแลลบผู้เล่นไม่ได้',
    modDelete.status === 400 && /แอดมิน/.test(modDelete.json?.error ?? ''),
    modDelete.json?.error ?? ''
  );

  // ---- 4) แบน: ล็อกอินไม่ได้ + session เดิมใช้ไม่ได้ทันที ----
  const ban = await api('PATCH', `/api/admin/users/${victim.userId}`, {
    cookie: adminCookie,
    body: { isActive: false, reason: 'ทดสอบระบบแบน' },
  });
  const bannedRow = await prisma.user.findUnique({ where: { id: victim.userId }, select: { isActive: true } });
  check('แบนผู้เล่นได้ (isActive = false)', ban.status === 200 && bannedRow?.isActive === false, ban.json?.message ?? '');

  const loginWhileBanned = await loginAs(victim.username);
  check('ผู้เล่นที่ถูกแบนล็อกอินไม่ได้', loginWhileBanned.status === 401 || loginWhileBanned.status === 403, `HTTP ${loginWhileBanned.status}`);

  const oldSession = await api('GET', '/api/auth/me', { cookie: victim.cookie });
  check('session เดิมของผู้เล่นที่ถูกแบนใช้ไม่ได้ทันที', oldSession.status === 401, `HTTP ${oldSession.status}`);

  const oldSessionApi = await api('GET', '/api/wallet', { cookie: victim.cookie });
  check('API อื่นก็ถูกบล็อกด้วย session เดิม', oldSessionApi.status === 401, `HTTP ${oldSessionApi.status}`);

  // ---- 5) ปลดแบน ----
  const unban = await api('PATCH', `/api/admin/users/${victim.userId}`, {
    cookie: adminCookie,
    body: { isActive: true },
  });
  const backSession = await api('GET', '/api/auth/me', { cookie: victim.cookie });
  check(
    'ปลดแบนแล้วกลับมาใช้งานได้ (คุกกี้เดิมใช้ได้อีกครั้ง)',
    unban.status === 200 && backSession.status === 200,
    `unban=${unban.status} · me=${backSession.status}`
  );

  // ---- 6) กันพลาด: ห้ามแบน/ลบบัญชีแอดมิน ----
  const banAdmin = await api('PATCH', `/api/admin/users/${admin2.userId}`, {
    cookie: adminCookie,
    body: { isActive: false },
  });
  check('แบนบัญชีแอดมินไม่ได้', banAdmin.status === 400 && /แอดมิน/.test(banAdmin.json?.error ?? ''), banAdmin.json?.error ?? '');

  const deleteAdmin = await api('DELETE', `/api/admin/users/${admin2.userId}`, {
    cookie: adminCookie,
    body: { confirmUsername: admin2.username },
  });
  check('ลบบัญชีแอดมินไม่ได้', deleteAdmin.status === 400 && /แอดมิน/.test(deleteAdmin.json?.error ?? ''), deleteAdmin.json?.error ?? '');

  // ---- 7) ลบผู้เล่น (ต้องพิมพ์ชื่อยืนยันให้ตรง) ----
  const wrongConfirm = await api('DELETE', `/api/admin/users/${victim.userId}`, {
    cookie: adminCookie,
    body: { confirmUsername: 'ผิดแน่นอน' },
  });
  check(
    'ลบด้วยชื่อยืนยันผิด → ปฏิเสธ (400) + บอกชื่อที่ต้องพิมพ์',
    wrongConfirm.status === 400 && String(wrongConfirm.json?.error ?? '').includes(victim.username),
    wrongConfirm.json?.error ?? ''
  );

  const beforeCards = await prisma.userCard.count({ where: { userId: victim.userId } });
  const deleteOk = await api('DELETE', `/api/admin/users/${victim.userId}`, {
    cookie: adminCookie,
    body: { confirmUsername: victim.username },
  });
  const gone = await prisma.user.findUnique({ where: { id: victim.userId }, select: { id: true } });
  const leftoverCards = await prisma.userCard.count({ where: { userId: victim.userId } });
  check(
    `ลบผู้เล่นสำเร็จ + ข้อมูลลูกหายตาม (การ์ด ${beforeCards} ใบ)`,
    deleteOk.status === 200 && gone === null && leftoverCards === 0,
    `${deleteOk.json?.message ?? deleteOk.json?.error}`
  );

  const selfDelete = await api('DELETE', `/api/admin/users/${admin.userId}`, {
    cookie: adminCookie,
    body: { confirmUsername: admin.username },
  });
  check('ลบบัญชีตัวเองไม่ได้', selfDelete.status === 400 && /ตัวเอง/.test(selfDelete.json?.error ?? ''), selfDelete.json?.error ?? '');

  // ---- 8) Audit log ครบทุก action ----
  const logs = await prisma.adminActionLog.findMany({
    where: { targetId: { in: createdUserIds } },
    select: { action: true },
  });
  const actions = new Set(logs.map((row) => row.action));
  const required = ['UPDATE_USER_ROLE', 'BAN_USER', 'UNBAN_USER', 'DELETE_USER'];
  check(
    'มี audit log ครบทุก action ที่ทำ',
    required.every((action) => actions.has(action)),
    [...actions].join(' · ')
  );

  // ---- 9) เบราว์เซอร์จริง: เมนูจัดการผู้เล่นบนหน้า /admin/users ----
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
    value: adminCookie.replace('rda_session=', ''),
    domain: 'localhost',
    path: '/',
  });
  await send('Page.navigate', { url: `${BASE}/admin/users` });
  await sleep(5000);

  const evaluate = async (expression, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value;

  const dom = await evaluate(`(() => ({
    roleSelects: document.querySelectorAll('[data-admin-user-role]').length,
    banButtons: document.querySelectorAll('[data-admin-user-ban]').length,
    deleteButtons: document.querySelectorAll('[data-admin-user-delete]').length,
    rows: document.querySelectorAll('[data-admin-user]').length,
  }))()`);
  check('ตารางมีช่องเลือกสิทธิ์ (แอดมิน)', (dom?.roleSelects ?? 0) >= 1, `selects=${dom?.roleSelects}`);
  check('ตารางมีปุ่มแบน (แอดมิน)', (dom?.banButtons ?? 0) >= 1, `buttons=${dom?.banButtons}`);
  check('ตารางมีปุ่มลบ (แอดมิน)', (dom?.deleteButtons ?? 0) >= 1, `buttons=${dom?.deleteButtons}`);

  // กดแบนผู้เล่นทดสอบผ่าน UI → สถานะต้องเปลี่ยนเป็น "ถูกแบน" และ DB ตรงกัน
  const banFlow = await evaluate(
    `(async () => {
      const btn = document.querySelector('[data-admin-user-ban="${target.userId}"]');
      if (!btn) return { ok: false, why: 'ไม่พบปุ่มแบนของผู้เล่นทดสอบ (อาจอยู่นอกหน้า)' };
      btn.click();
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 150));
        const row = document.querySelector('[data-admin-user="${target.userId}"]');
        if (row && row.getAttribute('data-admin-user-banned') === 'true') {
          return { ok: true, status: row.querySelector('[data-admin-user-status]')?.getAttribute('data-admin-user-status') };
        }
      }
      const row = document.querySelector('[data-admin-user="${target.userId}"]');
      return { ok: false, banned: row?.getAttribute('data-admin-user-banned') };
    })()`,
    true
  );
  const uiTargetRow = await prisma.user.findUnique({ where: { id: target.userId }, select: { isActive: true } });
  check(
    'กดปุ่ม "แบน" บนหน้าเว็บแล้วสถานะเปลี่ยน + DB ตรงกัน',
    banFlow?.ok === true && uiTargetRow?.isActive === false,
    `สถานะบนจอ=${banFlow?.status} · DB isActive=${uiTargetRow?.isActive}`
  );

  // เปิดกล่องยืนยันลบ (ยังไม่ลบจริง)
  const modalFlow = await evaluate(
    `(async () => {
      const btn = document.querySelector('[data-admin-user-delete="${target.userId}"]');
      if (!btn) return { ok: false, why: 'ไม่พบปุ่มลบ' };
      btn.click();
      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        if (document.querySelector('[data-admin-user-delete-modal]')) {
          return {
            ok: true,
            hasInput: Boolean(document.querySelector('[data-admin-user-delete-confirm-input]')),
            confirmDisabled: document.querySelector('[data-admin-user-delete-confirm]')?.disabled ?? null,
          };
        }
      }
      return { ok: false, why: 'กล่องยืนยันไม่เปิด' };
    })()`,
    true
  );
  check(
    'เปิดกล่องยืนยันการลบได้ + ปุ่มยืนยันถูกล็อกจนกว่าจะพิมพ์ชื่อตรง',
    modalFlow?.ok === true && modalFlow?.hasInput === true && modalFlow?.confirmDisabled === true,
    JSON.stringify(modalFlow)
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
    if (!KEEP) {
      // ลบผู้ใช้ทดสอบที่เหลือ (ยกเว้นผู้ที่ถูกลบไปแล้ว) + audit log ของการทดสอบ
      const keepIds = createdUserIds.filter(Boolean);
      await prisma.adminActionLog
        .deleteMany({ where: { targetId: { in: keepIds } } })
        .catch(() => undefined);
      await prisma.user.deleteMany({ where: { id: { in: keepIds } } }).catch(() => undefined);
      console.log(`🧹 ลบผู้ใช้ทดสอบ ${keepIds.length} คน (ใช้ --keep เพื่อเก็บไว้)`);
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


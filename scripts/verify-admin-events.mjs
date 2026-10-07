#!/usr/bin/env node
/**
 * verify-admin-events.mjs — ตรวจของจริง (production http://localhost:3000 + DB จริง)
 *
 * ที่มา 2026-10-07: ผู้ใช้สั่ง "แก้ไขทั้งหมดที่ยังไม่สมบูรณ์" → เดิม admin มีแต่ API sync
 * ไม่มีหน้า UI จัดการกิจกรรมเลย งานนี้จึงเพิ่ม /admin/events + API CRUD แล้วต้องมีสคริปต์
 * ที่พิสูจน์กับเซิร์ฟเวอร์จริงว่า (ก) สิทธิ์ถูกต้อง (ข) กิจกรรมที่สร้างใหม่ **ปิดเป็นค่าเริ่มต้น**
 * (ค) ตรวจช่วงเวลา/รหัสผิดถูกปฏิเสธ (ง) ลบได้จริง และ (จ) ไม่มีอะไรไปแตะกิจกรรมเดิมของผู้ใช้
 *
 * วิธีใช้: node scripts/verify-admin-events.mjs            (ลบผู้ใช้/กิจกรรมทดสอบเมื่อจบ)
 *          node scripts/verify-admin-events.mjs --keep
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
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* HTML (หน้าเว็บ) */ }
  return { status: res.status, ok: res.ok, json, text, setCookie: res.headers.get('set-cookie') };
}

const suffix = Date.now().toString().slice(-7);
const username = `vae_${suffix}`;
const password = `Va!${suffix}e2`;
const createdEventIds = [];
let userId = null;

async function main() {
  // ---- เฟส 0: เก็บสภาพกิจกรรมเดิมไว้เทียบว่าต้องไม่ถูกแตะ ----
  const before = await prisma.event.findMany({ select: { id: true, isActive: true, status: true }, orderBy: { id: 'asc' } });

  // ---- 1) สมัครผู้เล่นทดสอบ (ยังไม่ใช่แอดมิน) ----
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email: `${username}@e2lab.test`, password }),
  });
  const playerCookie = reg.setCookie?.split(';')[0] ?? '';
  const playerId = reg.json?.data?.user?.id ?? null;
  userId = playerId;
  check('สมัครผู้เล่นทดสอบ + ได้ session', reg.status === 201 && !!playerCookie, `userId=${playerId}`);

  // ---- 2) ยังไม่ล็อกอิน → 401 ----
  const anon = await api('/api/admin/events');
  check('GET /api/admin/events (ไม่ล็อกอิน) → 401', anon.status === 401, `status=${anon.status} ${anon.json?.error ?? ''}`);

  // ---- 3) ล็อกอินแล้วแต่เป็นผู้เล่น → 403 ----
  const asPlayer = await api('/api/admin/events', {}, playerCookie);
  check('GET /api/admin/events (ผู้เล่น) → 403', asPlayer.status === 403, `status=${asPlayer.status} ${asPlayer.json?.error ?? ''}`);

  // ---- 4) ยกสิทธิ์เป็น ADMIN แล้วล็อกอินใหม่ (session ออกตาม role ใน DB) ----
  await prisma.user.update({ where: { id: playerId }, data: { role: 'ADMIN' } });
  const login = await api('/api/auth/login', {
    method: 'POST',
    // โดเมนนี้ใช้ `identifier` (ชื่อผู้ใช้หรืออีเมล) ไม่ใช่ `username`
    body: JSON.stringify({ identifier: username, password }),
  });
  const adminCookie = login.setCookie?.split(';')[0] ?? '';
  check('ยกสิทธิ์ ADMIN + ล็อกอินใหม่ได้ session', login.status === 200 && !!adminCookie, `role=${login.json?.data?.user?.role}`);

  // ---- 5) รายการกิจกรรม (มี participantCount) ----
  const list = await api('/api/admin/events', {}, adminCookie);
  const listData = list.json?.data ?? [];
  check(
    'GET /api/admin/events (แอดมิน) → 200 + มีจำนวนผู้เข้าร่วมต่อรายการ',
    list.status === 200 && listData.length > 0 && typeof listData[0].participantCount === 'number',
    `${listData.length} กิจกรรม · ตัวแรก="${listData[0]?.nameTh ?? '-'}" participantCount=${listData[0]?.participantCount}`
  );

  // ---- 6) สร้างกิจกรรมใหม่ (ไม่ส่ง isActive) → ต้องปิดเป็นค่าเริ่มต้น ----
  const create = await api('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify({
      name: `VERIFY_EVENT_${suffix}`,
      nameTh: `กิจกรรมทดสอบ ${suffix}`,
      eventType: 'SEASONAL',
      startDate: '2026-10-10T00:00:00.000Z',
      endDate: '2026-10-20T00:00:00.000Z',
      currencyName: 'Veil Shards',
      maxCurrency: 500,
    }),
  }, adminCookie);
  const created = create.json?.data ?? null;
  if (created?.id) createdEventIds.push(created.id);
  const dbCreated = created?.id ? await prisma.event.findUnique({ where: { id: created.id } }) : null;
  check(
    'POST /api/admin/events → 201 และ **ปิดเป็นค่าเริ่มต้น** (isActive=false)',
    create.status === 201 && created?.isActive === false && dbCreated?.isActive === false,
    `id=${created?.id} isActive(API)=${created?.isActive} isActive(DB)=${dbCreated?.isActive}`
  );

  // ---- 7) ดูรายตัว ----
  const detail = await api(`/api/admin/events/${created?.id}`, {}, adminCookie);
  check('GET /api/admin/events/[id] → 200', detail.status === 200 && detail.json?.data?.id === created?.id, `status=${detail.status}`);

  // ---- 8) เปิด/ปิดกิจกรรม ----
  const toggle = await api(`/api/admin/events/${created?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive: true }),
  }, adminCookie);
  check('PATCH เปิดกิจกรรม (isActive:true) → 200', toggle.status === 200 && toggle.json?.data?.isActive === true, `isActive=${toggle.json?.data?.isActive}`);

  // ---- 9) ตรวจช่วงเวลา: end ก่อน start → 400 ----
  const badWindow = await api(`/api/admin/events/${created?.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ startDate: '2026-11-01T00:00:00.000Z', endDate: '2026-10-01T00:00:00.000Z' }),
  }, adminCookie);
  check('PATCH end ก่อน start → 400', badWindow.status === 400, `status=${badWindow.status} ${badWindow.json?.error ?? ''}`);

  // ---- 10) ชนิดกิจกรรมผิด → 400 ----
  const badType = await api('/api/admin/events', {
    method: 'POST',
    body: JSON.stringify({
      name: 'NOPE', nameTh: 'ผิด', eventType: 'NOPE',
      startDate: '2026-10-10T00:00:00.000Z', endDate: '2026-10-20T00:00:00.000Z', currencyName: 'X',
    }),
  }, adminCookie);
  check('POST eventType ผิด → 400', badType.status === 400, `status=${badType.status} ${badType.json?.error ?? ''}`);

  // ---- 11) id ที่ไม่มีจริง → 404 ----
  const missing = await api('/api/admin/events/nonexistent_id_xyz', { method: 'PATCH', body: JSON.stringify({ isActive: true }) }, adminCookie);
  check('PATCH id ที่ไม่มีจริง → 404', missing.status === 404, `status=${missing.status} ${missing.json?.error ?? ''}`);

  // ---- 12) หน้าเว็บ /admin/events ----
  const page = await api('/admin/events', {}, adminCookie);
  check(
    'หน้า /admin/events เปิดได้จริง (200 + มีตารางกิจกรรม)',
    page.status === 200 && /กิจกรรม/.test(page.text),
    `status=${page.status} · bytes=${page.text.length}`
  );

  // ---- 13) ลบกิจกรรมทดสอบ → แล้วต้องหายจริง ----
  const del = await api(`/api/admin/events/${created?.id}`, { method: 'DELETE' }, adminCookie);
  createdEventIds.length = 0;
  const afterDel = await api(`/api/admin/events/${created?.id}`, {}, adminCookie);
  check('DELETE กิจกรรมทดสอบ → 200 และหายจริง (404)', del.status === 200 && afterDel.status === 404, `delete=${del.status} · get หลังลบ=${afterDel.status}`);

  // ---- 14) กิจกรรมเดิมของผู้ใช้ต้องไม่ถูกแตะ ----
  const after = await prisma.event.findMany({ select: { id: true, isActive: true, status: true }, orderBy: { id: 'asc' } });
  const untouched = before.length === after.length
    && before.every((b, i) => b.id === after[i].id && b.isActive === after[i].isActive && b.status === after[i].status);
  check('กิจกรรมเดิมไม่ถูกแก้/ไม่ถูกเพิ่ม/ไม่ถูกลบ', untouched, `${before.length} กิจกรรมก่อน → ${after.length} หลัง`);

  // ---- 15) audit log ต้องมีร่องรอยการจัดการกิจกรรม ----
  const logs = await prisma.adminActionLog.count({ where: { action: 'CREATE_EVENT', targetType: 'EVENT' } });
  check('มี audit log ของการจัดการกิจกรรม', logs > 0, `CREATE_EVENT ทั้งหมด ${logs} รายการ`);
}

async function cleanup() {
  if (KEEP) {
    console.log(`\n(--keep) เก็บผู้ใช้ ${username} และกิจกรรมทดสอบไว้`);
    return;
  }
  if (createdEventIds.length) {
    await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } }).catch(() => {});
  }
  if (userId) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log(`\n🧹 ลบผู้ใช้ทดสอบ ${username} แล้ว`);
  }
}

main()
  .then(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${failed.length === 0 ? '🎉' : '⚠️'} ผ่าน ${results.length - failed.length}/${results.length} ข้อ`);
    if (failed.length) {
      console.log('ข้อที่ไม่ผ่าน:');
      for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
    }
    await prisma.$disconnect();
    process.exit(failed.length === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('❌ สคริปต์ล้ม:', err);
    await cleanup();
    await prisma.$disconnect();
    process.exit(1);
  });

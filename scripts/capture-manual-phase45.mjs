#!/usr/bin/env node
/**
 * capture-manual-phase45.mjs — ถ่ายภาพหน้าจอ "ฟีเจอร์ใหม่ Phase 25–45" ของจริง
 * สำหรับหนังสือคู่มือ (docs/manual) + **ดึงข้อความจริงบนหน้าจอ** มาเป็นหลักฐานยืนยัน
 * (ชื่อเมนู/ปุ่ม/หัวข้อ) ว่าคู่มือตรงกับเกมจริง
 *
 * ใช้ Chrome headless ผ่าน CDP (เหมือน capture-manual-shots.mjs / inspect-*.mjs)
 * รันทีละครั้ง (Chrome ตัวเดียว ทำทุกหน้าตามลำดับ) — ห้ามรันขนาน
 *
 * วิธีใช้
 *   node scripts/capture-manual-phase45.mjs --token "<rda_session>" --out docs/manual/images
 *   node scripts/capture-manual-phase45.mjs --token "..." --only fig-map,fig-dungeons
 *
 * ⚠️ token มาจากการล็อกอินจริง — ห้าม commit (สคริปต์ไม่บันทึก token ลงไฟล์)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const TOKEN = arg('--token', process.env.RDA_TOKEN || '');
const BASE = arg('--base', 'http://localhost:3000');
const OUT = arg('--out', 'docs/manual/images');
const PORT = Number(arg('--port', '9371'));
const ONLY = arg('--only', '').split(',').map((s) => s.trim()).filter(Boolean);

const PHONE = { width: 390, height: 900, dsf: 2 };
const WIDE = { width: 1360, height: 940, dsf: 1.5 };

// ID จริงของข้อมูลตัวอย่าง (ผู้เล่น woravik — มีการ์ด 57 · ไอเทม +0/+1/+2 · เข้าดันแล้ว)
const IDS = {
  deck: 'cmubi4oci0037y6ze06zj2kbj', // เด็ค 5 ใบ "แข่งแกร่งสุด"
  room: 'cmugg788y0004c4taizdr4jko', // ห้องอารีน่าที่ยังเปิด
};

const JOBS = [
  { name: 'fig-home', path: '/', ...PHONE },
  { name: 'fig-items-craft', path: '/items', ...PHONE },
  { name: 'fig-items-upgrade', path: '/items', ...PHONE, click: '[data-item-tab="upgrade"]', wait: 4200 },
  { name: 'fig-inventory', path: '/inventory', ...PHONE, wait: 3600 },
  { name: 'fig-map', path: '/map', ...PHONE, wait: 5200 },
  { name: 'fig-map-wide', path: '/map', ...WIDE, wait: 5200 },
  // fig-dungeons: เปิดตรงมาที่ชั้น 15 ของดันฝึกหัดเพื่อโชว์กล่อง "ระดับความยาก/พลังคุกคาม/HP ศัตรู"
  // (Phase 45.6 — ถ้าบัญชีที่ใช้ถ่ายยังไม่ปลดล็อกชั้น 15 หน้าเกมจะถอยไปชั้นที่ค้างไว้ให้เอง)
  { name: 'fig-dungeons', path: '/dungeons?floor=15', ...PHONE, wait: 4200 },
  { name: 'fig-profile', path: '/profile', ...PHONE, wait: 3800 },
  { name: 'fig-ranking', path: '/ranking', ...PHONE, wait: 3800 },
  { name: 'fig-ranking-wide', path: '/ranking', ...WIDE, wait: 3800 },
  { name: 'fig-notifications', path: '/notifications', ...PHONE, wait: 3400 },
  { name: 'fig-settings', path: '/settings', ...PHONE, wait: 3200 },
  { name: 'fig-arena', path: '/arena', ...PHONE, wait: 3600 },
  { name: 'fig-arena-room', path: `/arena/${IDS.room}`, ...PHONE, wait: 3800 },
  { name: 'fig-deck-formation', path: `/decks/${IDS.deck}`, ...PHONE, wait: 4200 },
  { name: 'fig-admin-events', path: '/admin/events', ...WIDE, wait: 4000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method) events.push(msg.method);
  });
  await new Promise((res, rej) => {
    socket.addEventListener('open', () => res());
    socket.addEventListener('error', rej);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, events };
}

const PROBE = `(() => {
  const txt = (el) => (el?.innerText || '').replace(/\\s+/g, ' ').trim();
  const uniq = (a) => [...new Set(a.filter(Boolean))];
  const q = (s) => [...document.querySelectorAll(s)].map(txt);
  return {
    title: document.title,
    h1: q('h1'),
    h2: q('h2'),
    tabs: q('[role="tab"],[data-item-tab],[data-map-tab],[data-ranking-tab],[data-avatar-tab]'),
    buttons: uniq([...document.querySelectorAll('button')].map(txt)).slice(0, 30),
    extra: {
      itemTabs: [...document.querySelectorAll('[data-item-tab]')].map((b) => b.getAttribute('data-item-tab') + ':' + txt(b)),
      stacks: [...document.querySelectorAll('[data-item-stack-level]')].map((s) => 'lvl' + s.getAttribute('data-item-stack-level')),
      mapNodes: document.querySelectorAll('[data-map-node]').length,
      mapTabs: [...document.querySelectorAll('[data-map-tab]')].map((b) => b.getAttribute('data-map-tab')),
      rankTabs: [...document.querySelectorAll('[data-ranking-tab]')].map((b) => b.getAttribute('data-ranking-tab')),
      dungeons: [...document.querySelectorAll('[data-dungeon]')].map((b) => b.getAttribute('data-dungeon')),
      skin: document.querySelector('[data-profile-cosmetics]') ? 'cosmetics-ok' : 'no-cosmetics',
    },
  };
})()`;

mkdirSync(OUT, { recursive: true });
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--user-data-dir=/tmp/rda-manual-phase45-${PORT}`,
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const done = [];
try {
  let targets = null;
  for (let i = 0; i < 80 && !targets; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = (await res.json()).filter((t) => t.type === 'page');
    } catch { await sleep(500); }
  }
  if (!targets?.length) throw new Error('เชื่อมต่อ Chrome ไม่ได้');
  const { send, events } = await connect(targets[0].webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  if (TOKEN) {
    for (const domain of ['localhost', '127.0.0.1']) {
      await send('Network.setCookie', { name: 'rda_session', value: TOKEN, domain, path: '/' });
    }
    const sub = (() => { try { return JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64url').toString()).sub; } catch { return null; } })();
    if (sub) {
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('rda_onboarded_${sub}', new Date().toISOString()); } catch (e) {}`,
      });
    }
  }

  console.log('===== หลักฐานข้อความจริงบนหน้าจอ (verification) =====');
  for (const job of JOBS) {
    if (ONLY.length && !ONLY.includes(job.name)) continue;
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width, height: job.height, deviceScaleFactor: job.dsf ?? 1, mobile: job.width < 700,
    });
    events.length = 0;
    await send('Page.navigate', { url: `${BASE}${job.path}` });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
    await sleep(job.wait ?? 3200);
    if (job.click) {
      await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(job.click)})?.click()` });
      await sleep(job.wait2 ?? 1800);
    }
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${job.name}.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    done.push(job.name);
    console.log(`✓ ${job.name}.png  ${job.path}  (${job.width}px)`);

    const probe = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const v = probe.result?.value ?? {};
    console.log(`   TITLE: ${v.title}`);
    console.log(`   H1: ${JSON.stringify(v.h1)}`);
    console.log(`   H2: ${JSON.stringify((v.h2 ?? []).slice(0, 12))}`);
    console.log(`   TABS: ${JSON.stringify(v.tabs)}`);
    console.log(`   BTN: ${JSON.stringify((v.buttons ?? []).slice(0, 18))}`);
    console.log(`   EXTRA: ${JSON.stringify(v.extra)}`);
    console.log('');
  }
} finally {
  chrome.kill('SIGTERM');
}
console.log(`ถ่ายได้ ${done.length} ภาพ → ${OUT}\n${done.join(', ')}`);
if (!done.length) process.exitCode = 1;

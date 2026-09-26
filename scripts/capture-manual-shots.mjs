#!/usr/bin/env node
/**
 * capture-manual-shots.mjs — ถ่ายภาพหน้าจอจริงของเกม เพื่อใช้ประกอบ "หนังสือคู่มือการเล่น"
 * (docs/manual) — ใช้ Chrome headless ผ่าน CDP เหมือนสคริปต์ inspect:* ในโปรเจกต์
 *
 * ทำไมต้องมี: คู่มือแบบหนังสือต้องมีภาพจากเกมจริง (UI ปัจจุบัน) ไม่ใช่ภาพวาดเดา
 * สคริปต์นี้ล็อกอินด้วย session token ที่ให้มา แล้วถ่ายทีละหน้า ทั้งแนวตั้ง (มือถือ 390×844)
 * และแนวนอน (เดสก์ท็อป 1360×900) เก็บเป็น PNG ในโฟลเดอร์ปลายทาง
 *
 * วิธีใช้
 *   node scripts/capture-manual-shots.mjs --token "<rda_session>" --out docs/manual/images
 *   node scripts/capture-manual-shots.mjs --token "..." --only fig-battle,fig-arena
 *   node scripts/capture-manual-shots.mjs --anon            # หน้า login/register (ไม่ใช้ token)
 *
 * ⚠️ token มาจากการล็อกอินจริง — ห้าม commit ลง git (สคริปต์ไม่บันทึก token ลงไฟล์ใด ๆ)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const BASE = arg('--base', 'http://localhost:3000');
const OUT = arg('--out', 'docs/manual/images');
const PORT = Number(arg('--port', '9361'));
const ANON = process.argv.includes('--anon');
const ONLY = arg('--only', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ===== ID จริงของข้อมูลตัวอย่างในฐานข้อมูล (เปลี่ยนได้ถ้าข้อมูลถูกลบ) =====
const IDS = {
  deck: 'cmubi4oci0037y6ze06zj2kbj', // เด็ค 5 ใบของผู้เล่นตัวอย่าง
  card: 'cmubj838y002vsb356l056j5h', // การ์ด EPIC ที่ผู้เล่นถืออยู่
  legendary: 'cmub7dfay001ktreo7rz2yoeh', // การ์ด LEGENDARY (โชว์ระดับหายาก)
  room: 'cmugg788y0004c4taizdr4jko', // ห้องอารีน่าที่ยังเปิดอยู่
  battle: 'cmugort7k000113dtxj920xdu', // ศึกที่จบแล้ว (กดดู Replay ได้)
  event: 'cmuah6yse000013bzi8npptmg', // กิจกรรมฤดูกาลเดือนนี้
};

const PHONE = { width: 390, height: 844, dsf: 2 };
const WIDE = { width: 1360, height: 900, dsf: 1.5 };

const JOBS = [
  // ===== ปฐมบท =====
  { name: 'fig-login', path: '/login', ...PHONE, anon: true },
  { name: 'fig-register', path: '/register', ...PHONE, anon: true },
  { name: 'fig-home', path: '/', ...PHONE },
  // ===== รูน & การ์ด =====
  { name: 'fig-discover', path: '/discover', ...PHONE },
  { name: 'fig-cards', path: '/cards', ...PHONE },
  { name: 'fig-card-detail', path: `/cards/${IDS.card}`, ...PHONE },
  { name: 'fig-card-legendary', path: `/cards/${IDS.legendary}`, ...PHONE },
  { name: 'fig-cards-wide', path: '/cards', ...WIDE },
  { name: 'fig-aura-preview', path: '/aura-preview', ...PHONE },
  { name: 'fig-foil-preview', path: '/foil-preview', ...PHONE },
  // ===== ทีม =====
  { name: 'fig-decks', path: '/decks', ...PHONE },
  { name: 'fig-deck-formation', path: `/decks/${IDS.deck}`, ...PHONE },
  { name: 'fig-deck-wide', path: `/decks/${IDS.deck}`, ...WIDE },
  // ===== ต่อสู้ =====
  { name: 'fig-battle', path: '/battle', ...PHONE },
  { name: 'fig-battle-field', path: `/battle/${IDS.battle}`, ...PHONE },
  { name: 'fig-battle-wide', path: `/battle/${IDS.battle}`, ...WIDE },
  // ===== อารีน่า =====
  { name: 'fig-arena', path: '/arena', ...PHONE },
  { name: 'fig-arena-create', path: '/arena/create', ...PHONE },
  { name: 'fig-arena-room', path: `/arena/${IDS.room}`, ...PHONE },
  { name: 'fig-arena-wide', path: `/arena/${IDS.room}`, ...WIDE },
  // ===== ระบบอื่น =====
  { name: 'fig-quests', path: '/quests', ...PHONE },
  { name: 'fig-notifications', path: '/notifications', ...PHONE },
  { name: 'fig-events', path: '/events', ...PHONE },
  { name: 'fig-event-raid', path: `/events/${IDS.event}`, ...PHONE },
  { name: 'fig-inventory', path: '/inventory', ...PHONE },
  { name: 'fig-wallet', path: '/wallet', ...PHONE },
  { name: 'fig-settings', path: '/settings', ...PHONE },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    socket.addEventListener('error', reject);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  return { send, events };
}

mkdirSync(OUT, { recursive: true });
const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=/tmp/rda-manual-shots-${PORT}`,
    '--no-first-run',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const done = [];
try {
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

  const { send, events } = await connect(targets[0].webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  if (!ANON && TOKEN) {
    await send('Network.setCookie', {
      name: 'rda_session',
      value: TOKEN,
      domain: 'localhost',
      path: '/',
    });
    // ผู้เล่นเดิม → ปิด onboarding modal ที่จะบังภาพ
    const sub = (() => {
      try {
        return JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64url').toString()).sub;
      } catch {
        return null;
      }
    })();
    if (sub) {
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('rda_onboarded_${sub}', new Date().toISOString()); } catch (e) {}`,
      });
    }
  }

  for (const job of JOBS) {
    if (ONLY.length && !ONLY.includes(job.name)) continue;
    if (Boolean(job.anon) !== ANON) continue; // รอบ anon ถ่ายเฉพาะหน้า login/register
    await send('Emulation.setDeviceMetricsOverride', {
      width: job.width,
      height: job.height,
      deviceScaleFactor: job.dsf ?? 1,
      mobile: job.width < 700,
    });
    events.length = 0;
    await send('Page.navigate', { url: `${BASE}${job.path}` });
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
    // รอ canvas การ์ด/ออร่า + ข้อมูลจาก API วาดเสร็จ
    await sleep(job.wait ?? 2800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const file = join(OUT, `${job.name}.png`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    done.push({ file, path: job.path, width: job.width });
    console.log(`✓ ${job.name}.png  ${job.path}  (${job.width}px)`);
  }
} finally {
  chrome.kill('SIGTERM');
}

console.log(`\nถ่ายได้ ${done.length} ภาพ → ${OUT}`);
if (!done.length) process.exitCode = 1;

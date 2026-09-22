#!/usr/bin/env node
/**
 * ตรวจ "ตัวหนังสือบนการ์ดซ้อนทับกันหรือไม่" ด้วย Chrome จริง (อ่านพิกัดด้วย getBBox)
 *
 * วิธีใช้:
 *   node scripts/inspect-card-layout.mjs --card <cardId> [--base http://localhost:3000] [--mode full|overlay]
 *   node scripts/inspect-card-layout.mjs --all 5 --token <session>   # สุ่มตรวจจากคลัง
 *
 * เกณฑ์: คู่ข้อความที่กล่องทับกันเกิน 15% ของกล่องที่เล็กกว่า → รายงานเป็นปัญหา
 */
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000');
const MODE = arg('--mode', 'full');
const PORT = Number(arg('--port', '9344'));
const CARDS_ARG = arg('--card', '');
const ALL = Number(arg('--all', '0'));
const TOKEN = arg('--token', '');

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

/** สุ่ม card id จาก API แอดมิน (ต้องมี session) */
async function fetchCardIds(count) {
  const res = await fetch(`${BASE}/api/admin/cards?limit=${Math.max(1, count)}`, {
    headers: TOKEN ? { cookie: `rda_session=${TOKEN}` } : {},
  });
  const json = await res.json().catch(() => null);
  return (json?.data ?? []).map((card) => card.id);
}

const cardIds = CARDS_ARG ? CARDS_ARG.split(',') : await fetchCardIds(ALL || 5);
if (!cardIds.length) {
  console.error('ไม่พบการ์ดที่จะตรวจ (ลองใส่ --card <id> หรือ --token <session>)');
  process.exit(1);
}

const chrome = spawn(
  'google-chrome',
  ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, 'about:blank'],
  { stdio: 'ignore' }
);

let client = null;
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

  client = await connect(targets[0].webSocketDebuggerUrl);
  const { send, events } = client;
  await send('Page.enable');
  await send('Runtime.enable');

  let problems = 0;
  for (const cardId of cardIds) {
    await send('Page.navigate', {
      url: `${BASE}/_cardlayout.html?card=${cardId}&mode=${MODE}`,
    });
    for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
    await sleep(700);

    const evaluated = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `JSON.parse(document.getElementById('out').textContent)`,
    });

    const result = evaluated.result.value ?? {};
    const label = `${cardId.slice(-6)}`;
    if (result.error) {
      console.log(`❌ ${label}: ${result.error}`);
      problems += 1;
      continue;
    }
    console.log(
      `${result.overlapCount > 0 ? '❌' : '✅'} ${label}: ข้อความ ${result.textCount} ชิ้น · ทับกัน ${result.overlapCount} คู่`
    );
    for (const overlap of result.overlaps ?? []) {
      console.log(`     - "${overlap.a}" ↔ "${overlap.b}" (${Math.round(overlap.ratio * 100)}%)`);
    }
    problems += result.overlapCount;
  }

  console.log(problems === 0 ? '\n🎉 ไม่พบข้อความทับกัน' : `\n💥 พบข้อความทับกัน ${problems} คู่`);
  process.exitCode = problems === 0 ? 0 : 1;
} catch (error) {
  console.error('ตรวจ layout ไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client = null;
  chrome.kill('SIGKILL');
}


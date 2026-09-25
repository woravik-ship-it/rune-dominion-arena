#!/usr/bin/env node
/**
 * ตรวจ "เมนูเลือกทีม (Deck) ในห้องประลอง" บนหน้าเว็บจริงด้วย Chrome (CDP)
 * — ไม่ใช่ดูโค้ด แต่เปิดหน้าจริงพร้อม session แล้ววัดค่าที่เรนเดอร์จริง:
 *
 *   1) มีเมนูเลือกทีม (Deck) — มีปุ่มเด็คให้เลือกอย่างน้อย 1 อัน
 *   2) มีทีมถูกเลือกไว้ตั้งแต่แรก (ค่าเริ่มต้น = เด็คแรกที่ครบ 5 ใบ)
 *   3) เลือกเด็คอื่น → พรีวิวการ์ด 5 ใบเปลี่ยนตาม (เทียบ deckId ก่อน/หลัง)
 *   4) ปุ่มเข้าร่วม/ท้าทายผูกกับเด็คที่เลือก (selected = พรีวิวที่แสดง)
 *
 * วิธีใช้:
 *   node scripts/inspect-arena-room.mjs --token "<session>" --room <roomId>
 *   node scripts/inspect-arena-room.mjs --token "<session>" --room <roomId> --out public/_shots/arena-deck.png
 *
 * หมายเหตุ: ตรวจเฉพาะ "การเลือกทีม" — ไม่กดปุ่มเข้าร่วม/ท้าทาย (ไม่ให้เกิดค่าใช้จ่ายหรือศึกจริง)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const ROOM = arg('--room', '');
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9349'));
const OUT = arg('--out', 'public/_shots/arena-deck-picker.png');
const WIDTH = Number(arg('--width', '1280'));
const HEIGHT = Number(arg('--height', '1600'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** อ่านค่าที่ต้องตรวจจากหน้าเว็บ (รันใน browser) */
const MEASURE = `(() => {
  const picker = document.querySelector('[data-arena-deck-picker]');
  const decks = [...document.querySelectorAll('[data-arena-deck]')].map((el) => ({
    id: el.getAttribute('data-arena-deck'),
    usable: el.getAttribute('data-arena-deck-usable') === 'true',
    disabled: el.disabled === true,
    selected: (el.textContent || '').includes('✅'),
  }));
  const preview = document.querySelector('[data-arena-deck-preview]');
  const previewCards = [...document.querySelectorAll('[data-arena-deck-card]')].map((el) =>
    el.getAttribute('data-arena-deck-card')
  );
  const previewArt = document.querySelectorAll('[data-arena-deck-card] img[src*="/art"]').length;
  return {
    hasPicker: Boolean(picker),
    selectedDeckId: picker ? picker.getAttribute('data-arena-selected-deck') : null,
    decks,
    previewDeckId: preview ? preview.getAttribute('data-arena-deck-preview') : null,
    previewCards,
    previewArt,
    actionButtons: [...document.querySelectorAll('button')]
      .map((b) => (b.textContent || '').trim())
      .filter((t) => t.includes('ส่งทีม') || t.includes('เข้าร่วม') || t.includes('ท้าทาย')),
    /** ข้อความชี้แจงเรื่องค่าเข้า (ผู้ใช้สั่ง: ส่งทีมเข้าห้องซ้ำได้ คิดค่าเข้าทุกครั้ง) */
    rejoinNote: (document.body.innerText || '').includes('คิดค่าเข้า'),
  };
})()`;

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

const url = `${BASE}/arena/${ROOM}`;
mkdirSync(dirname(OUT), { recursive: true });

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${PORT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ],
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
  await send('Network.enable');
  await send('Runtime.enable');

  if (TOKEN) {
    await send('Network.setCookie', { name: 'rda_session', value: TOKEN, domain: 'localhost', path: '/' });
  }

  // จำลอง "ผู้เล่นเดิม" (ไม่ให้ onboarding modal ขึ้นมาบังหน้าจอ) — ดูเหตุผลใน inspect-battle-field.mjs
  const onboardedSub = (() => {
    try {
      return JSON.parse(Buffer.from(TOKEN.split('.')[1], 'base64url').toString()).sub;
    } catch {
      return null;
    }
  })();
  if (onboardedSub) {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('rda_onboarded_${onboardedSub}', new Date().toISOString()); } catch (e) {}`,
    });
  }

  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
  await sleep(3500);

  const before = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;
  if (!before?.hasPicker) throw new Error('ไม่พบเมนูเลือกทีมบนหน้า — ตรวจ session/room id');

  // เลือกเด็คอื่น (ยังไม่ถูกเลือก) → พรีวิวต้องเปลี่ยนตาม
  const target = (before.decks ?? []).find((d) => d.usable && d.id !== before.selectedDeckId) ?? null;
  let afterPick = before;
  if (target) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.querySelector('[data-arena-deck="${target.id}"]');
        if (el) el.click();
        return true;
      })()`,
    });
    await sleep(1200);
    afterPick = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;
  }

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height: Math.min(HEIGHT, 5000), scale: 1 },
  });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // ===== สรุปผล =====
  const checks = [];
  const usable = (before.decks ?? []).filter((d) => d.usable);
  checks.push([
    'มีเมนูเลือกทีม (Deck) ในห้องประลอง',
    before.hasPicker && usable.length >= 1,
    `เด็คทั้งหมด ${(before.decks ?? []).length} · เลือกได้ ${usable.length}`,
  ]);

  checks.push([
    'มีทีมถูกเลือกไว้ตั้งแต่เปิดหน้า (ไม่ต้องเลือกเองก่อนกดเข้าร่วม)',
    Boolean(before.selectedDeckId) &&
      (before.decks ?? []).some((d) => d.id === before.selectedDeckId && d.selected),
    `เลือกอยู่ = ${before.selectedDeckId ?? '(ไม่มี)'}`,
  ]);

  checks.push([
    'เลือกทีมแล้วพรีวิวการ์ดเปลี่ยนตาม (5 ใบ)',
    !target || (afterPick.previewDeckId === target.id && afterPick.previewCards.length === 5),
    target
      ? `กดเด็ค ${target.id} → พรีวิว ${afterPick.previewDeckId} (${afterPick.previewCards.length} ใบ · มีรูปจริง ${afterPick.previewArt})`
      : 'มีเด็คที่เลือกได้ใบเดียว — ข้ามการสลับ',
  ]);

  checks.push([
    'ปุ่มเข้าร่วม/ท้าทายผูกกับเด็คที่เลือก',
    afterPick.actionButtons.length === 2 && afterPick.selectedDeckId === afterPick.previewDeckId,
    `${afterPick.actionButtons.join(' | ')} · selected=${afterPick.selectedDeckId}`,
  ]);

  // ผู้ใช้สั่ง: "การเพิ่มทีมเข้ามาในห้อง เก็บค่าเข้า จะจัดเข้ามากี่ครั้งก็ได้" → หน้าจอต้องบอกชัด
  checks.push([
    'หน้าจอบอกว่าส่งทีมเข้าห้องซ้ำได้ + คิดค่าเข้าทุกครั้ง',
    afterPick.rejoinNote === true,
    afterPick.rejoinNote ? 'พบข้อความ "คิดค่าเข้า…"' : 'ไม่พบข้อความชี้แจงค่าเข้า',
  ]);

  console.log(`URL: ${url}`);
  console.log(`ภาพ: ${OUT}`);
  let failed = 0;
  for (const [name, ok, detail] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? '✅' : '❌'} ${name} — ${detail}`);
  }
  console.log(`สรุป: ผ่าน ${checks.length - failed}/${checks.length}`);
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error('ตรวจไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client = null;
  chrome.kill('SIGKILL');
}

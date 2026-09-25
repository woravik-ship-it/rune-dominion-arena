#!/usr/bin/env node
/**
 * ตรวจ "หน้าจัดทีมวงกลม + กราฟ 6 เหลี่ยม" บนหน้าเว็บจริงด้วย Chrome (CDP)
 * — ไม่ใช่ดูโค้ด แต่เปิดหน้าจริงพร้อม session แล้ววัดค่าที่เรนเดอร์จริง:
 *
 *   1) ช่อง 5 ช่องเรียงเป็นวงกลมจริงไหม (วัดมุมจากศูนย์กลางของวง → เรียงตามที่ออกแบบ)
 *   2) บทบาทช่องตรงตามคำสั่งผู้ใช้ (โจมตี 2 · ป้องกัน 2 · สนับสนุน 1)
 *   3) กราฟ 6 เหลี่ยมมี 6 จุด และคะแนนรวมอยู่ตรงกลางจริง (ค่าตรงกับกลางวงกลม)
 *   4) **เรียลไทม์**: ถอดการ์ดออก 1 ใบ → คะแนนรวม + รูปหกเหลี่ยม + เส้นเชื่อมต้องเปลี่ยนตาม
 *
 * วิธีใช้:
 *   node scripts/inspect-deck-formation.mjs --token "<session>" --deck <deckId>
 *   node scripts/inspect-deck-formation.mjs --token "<session>" --deck <deckId> --out public/_shots/deck-formation.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const DECK = arg('--deck', '');
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9347'));
const OUT = arg('--out', 'public/_shots/deck-formation.png');
const WIDTH = Number(arg('--width', '1280'));
const HEIGHT = Number(arg('--height', '1600'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** อ่านค่าที่ต้องตรวจจากหน้าเว็บ (รันใน browser) */
const MEASURE = `(() => {
  const slots = [...document.querySelectorAll('[data-slot-position]')].map((el) => {
    const box = el.getBoundingClientRect();
    return {
      position: Number(el.getAttribute('data-slot-position')),
      role: el.getAttribute('data-slot-role'),
      filled: el.getAttribute('data-slot-filled') === 'true',
      bonus: Number(el.getAttribute('data-slot-bonus')),
      cx: box.left + box.width / 2,
      cy: box.top + box.height / 2,
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
  });

  const ringEl = document.querySelector('[data-ring-rx]');
  const ringBox = ringEl?.getBoundingClientRect();
  const hexShape = document.querySelector('[data-hex-shape]');
  const hexTotal = document.querySelector('[data-hex-total]');

  return {
    path: location.pathname,
    slots,
    ring: ringBox
      ? {
          cx: ringBox.left + ringBox.width / 2,
          cy: ringBox.top + ringBox.height / 2,
          w: Math.round(ringBox.width),
          h: Math.round(ringBox.height),
          rx: Number(ringEl.getAttribute('data-ring-rx')),
          ry: Number(ringEl.getAttribute('data-ring-ry')),
        }
      : null,
    hexPoints: (hexShape?.getAttribute('points') || '').split(' ').filter(Boolean),
    hexTotal: hexTotal?.getAttribute('data-hex-total') ?? null,
    deckTotal: document.querySelector('[data-deck-total]')?.getAttribute('data-deck-total') ?? null,
    ringLink: document.querySelector('[data-ring-link]')?.getAttribute('points') ?? null,
    slotAnim: (() => {
      const el = document.querySelector('.deck-slot__card');
      return el ? getComputedStyle(el).animationName : null;
    })(),
    ringSpinAnim: (() => {
      const el = document.querySelector('.deck-ring__spin');
      return el ? getComputedStyle(el).animationName : null;
    })(),
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

const url = `${BASE}/decks/${DECK}`;
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

  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
  await sleep(3500);

  // ปิดป๊อปอัปต้อนรับ (ถ้ามี) — ไม่ให้บังภาพและไม่ให้บังการคลิกช่องการ์ด
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skip = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ข้าม'));
      if (skip) { skip.click(); return 'skip'; }
      return 'none';
    })()`,
  });
  await sleep(500);

  const before = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;
  if (!before?.slots?.length) throw new Error('ไม่พบช่องการ์ดบนหน้า — ตรวจ session/deck id');

  // ── เรียลไทม์: ถอดการ์ดใบแรกออก แล้ววัดใหม่ (คะแนน/รูปหกเหลี่ยม/เส้นเชื่อมต้องเปลี่ยน) ──
  await send('Runtime.evaluate', {
    expression: `(() => {
      const filled = document.querySelector('[data-slot-filled="true"]');
      if (!filled) return false;
      filled.click();
      return true;
    })()`,
  });
  await sleep(1200);
  const after = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height: Math.min(HEIGHT, 4000), scale: 1 },
  });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // ===== สรุปผล =====
  const checks = [];
  const center = before.ring;
  // ช่องวางบน "วงรี" (รัศมีแกน X/Y ต่างกันตามที่ออกแบบ) → เทียบกับตำแหน่งที่ควรเป็นบนวงรี
  const designAngles = [72, 144, 216, 288, 0];
  const offsets = center
    ? before.slots.map((s, i) => {
        const u = (s.cx - center.cx) / ((center.rx / 100) * center.w);
        const v = (s.cy - center.cy) / ((center.ry / 100) * center.h);
        const rad = (designAngles[i] * Math.PI) / 180;
        return { u: Number(u.toFixed(3)), v: Number(v.toFixed(3)), eu: Number(Math.sin(rad).toFixed(3)), ev: Number((-Math.cos(rad)).toFixed(3)) };
      })
    : [];
  const ringOk =
    offsets.length === 5 &&
    offsets.every((o) => Math.abs(o.u - o.eu) <= 0.02 && Math.abs(o.v - o.ev) <= 0.02);
  checks.push([
    'ช่อง 5 ช่องเรียงเป็นวงกลมตามที่ออกแบบ',
    ringOk,
    offsets.map((o) => `(${o.u},${o.v})≈(${o.eu},${o.ev})`).join(' '),
  ]);

  const roles = before.slots.map((s) => s.role).join(',');
  checks.push([
    'บทบาทช่อง = โจมตี 2 · ป้องกัน 2 · สนับสนุน 1',
    roles === 'ATTACK,ATTACK,DEFENSE,DEFENSE,SUPPORT',
    roles,
  ]);

  checks.push(['กราฟ 6 เหลี่ยมมี 6 จุด', before.hexPoints.length === 6, `${before.hexPoints.length} จุด`]);
  checks.push([
    'คะแนนรวมกลางวงกลม = คะแนนกลางหกเหลี่ยม',
    Number(before.hexTotal) === Number(before.deckTotal),
    `${before.deckTotal} vs ${before.hexTotal}`,
  ]);

  const totalDropped = Number(after.deckTotal) < Number(before.deckTotal);
  const hexChanged = after.hexPoints.join(' ') !== before.hexPoints.join(' ');
  const linkChanged = after.ringLink !== before.ringLink;
  checks.push(['ถอดการ์ดออกแล้วคะแนนลดทันที (เรียลไทม์)', totalDropped, `${before.deckTotal} → ${after.deckTotal}`]);
  checks.push(['รูปหกเหลี่ยมเปลี่ยนตาม (เรียลไทม์)', hexChanged, hexChanged ? 'points เปลี่ยน' : 'points เท่าเดิม']);
  checks.push(['เส้นเชื่อมวงกลมเปลี่ยนตาม (เรียลไทม์)', linkChanged, linkChanged ? 'points เปลี่ยน' : 'points เท่าเดิม']);
  checks.push([
    'อนิเมชันเรนเดอร์จริง (การ์ดเข้าช่อง + วงแหวนหมุน)',
    before.slotAnim === 'deckSlotIn' && before.ringSpinAnim === 'deckRingSpin',
    `slot=${before.slotAnim} ring=${before.ringSpinAnim}`,
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

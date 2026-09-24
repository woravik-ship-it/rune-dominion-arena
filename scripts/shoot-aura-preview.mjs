#!/usr/bin/env node
/**
 * ถ่ายภาพหน้าพรีวิวแสงเรือง (/aura-preview) ด้วย Chrome จริง → PNG ใน public/_shots
 *
 * ทำไมต้องมี: บทเรียนจาก docs/FOIL_STATUS.md — เอฟเฟกต์แสงเคยถูกประเมินด้วยคำบรรยายแล้วไม่ตรงกัน
 *   ("ผู้ใช้บอก พอๆ ไม่ได้") รอบนี้จึงบังคับให้ "ดูภาพจริง" ก่อนทุกครั้ง
 *
 * วิธีใช้:
 *   node scripts/shoot-aura-preview.mjs                                  # ถ่ายทุก section ของหน้า default
 *   node scripts/shoot-aura-preview.mjs --query 'rarity=MYTHIC' --prefix aura-mythic
 *   node scripts/shoot-aura-preview.mjs --query 'variant=radiant' --prefix aura-radiant
 *   node scripts/shoot-aura-preview.mjs --full --prefix aura-all          # ภาพเต็มหน้า
 *
 * หมายเหตุ: ค่าเริ่มต้นจะ "หยุดอนิเมชัน" ที่เฟสสว่าง (-2s) เพื่อให้เทียบดีไซน์ได้เสถียร
 *   ใส่ --live เพื่อถ่ายตอนอนิเมชันเดินจริง
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(name);

const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9345'));
const OUT = arg('--out', 'public/_shots');
const PREFIX = arg('--prefix', 'aura');
const WIDTH = Number(arg('--width', '1400'));
const HEIGHT = Number(arg('--height', '1100'));
const DELAY = Number(arg('--delay', '2500'));
const SCALE = Number(arg('--scale', '2'));
const QUERY = arg('--query', '');
const FULL = flag('--full');
const LIVE = flag('--live');
// --freeze N = แช่เวลาให้เอฟเฟกต์ Canvas (window.__CARD_NEON_TIME__) → ภาพนิ่งเทียบดีไซน์ได้คงที่
const FREEZE = arg('--freeze', '');

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

const url = `${BASE}/aura-preview${QUERY ? `?${QUERY}` : ''}`;
mkdirSync(OUT, { recursive: true });

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
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: SCALE,
    mobile: false,
  });

  // แช่เวลาให้เอฟเฟกต์ Canvas (ถ้าสั่ง --freeze) — ต้องตั้งก่อนหน้าเว็บ mount
  if (FREEZE !== '') {
    const t = Number(FREEZE);
    if (Number.isFinite(t)) {
      await send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__CARD_NEON_TIME__ = ${t};`,
      });
    }
  }

  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
  await sleep(DELAY);

  if (!LIVE) {
    // หยุดอนิเมชันที่เฟสสว่าง → ภาพนิ่งเทียบกันได้ (ไม่ต้องลุ้นว่าถ่ายตอนแสงหรี่)
    // + ซ่อน element แบบ fixed (แถบเมนูล่าง) ไม่ให้ทับภาพที่ถ่าย
    await send('Runtime.evaluate', {
      expression: `(() => {
        const s = document.createElement('style');
        s.textContent = '.card-aura *{animation-delay:-2s !important;animation-play-state:paused !important}';
        document.head.appendChild(s);
        for (const el of Array.from(document.querySelectorAll('body *'))) {
          if (getComputedStyle(el).position === 'fixed') {
            el.style.setProperty('display', 'none', 'important');
          }
        }
        return true;
      })()`,
    });
    await sleep(400);
  }

  const meta = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `JSON.parse(JSON.stringify({
      title: document.title,
      dbError: document.body.innerText.includes('อ่านการ์ดจากฐานข้อมูลไม่ได้'),
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      sections: Array.from(document.querySelectorAll('[data-aura-row]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          key: el.getAttribute('data-aura-row'),
          x: r.x + window.scrollX,
          y: r.y + window.scrollY,
          w: r.width,
          h: r.height,
        };
      }),
    }))`,
  });
  const info = meta.result.value ?? {};
  if (info.dbError) console.log('⚠️  หน้าพรีวิวรายงานว่าอ่านการ์ดจากฐานข้อมูลไม่ได้');

  const shots = [];
  if (FULL || !info.sections?.length) {
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: Math.min(info.pageWidth ?? WIDTH, 4000),
        height: Math.min(info.pageHeight ?? HEIGHT, 12000),
        scale: 1,
      },
    });
    const file = join(OUT, `${PREFIX}-full.png`);
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    shots.push(file);
  } else {
    for (const section of info.sections) {
      if (section.w < 10 || section.h < 10) continue;
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: section.x, y: section.y, width: section.w, height: section.h, scale: 1 },
      });
      const file = join(OUT, `${PREFIX}-${section.key}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));
      shots.push(file);
    }
  }

  console.log(`URL: ${url}`);
  console.log(
    `ถ่ายได้ ${shots.length} ภาพ (${WIDTH}×${HEIGHT} @${SCALE}x${LIVE ? ' · อนิเมชันเดินจริง' : ' · หยุดที่เฟสสว่าง'}):`
  );
  for (const file of shots) console.log(`  - ${file}`);
  process.exitCode = shots.length ? 0 : 1;
} catch (error) {
  console.error('ถ่ายภาพไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client = null;
  chrome.kill('SIGKILL');
}

#!/usr/bin/env node
/**
 * ตรวจเอฟเฟกต์ Canvas ของการ์ดด้วย "พิกเซลจริง" (ไม่ต้องดูด้วยตา)
 *
 * ทำไมต้องมี: บทเรียนจาก docs/FOIL_STATUS.md — เคยประเมินเอฟเฟกต์จากคำบรรยายแล้วไม่ตรงกัน
 *   สคริปต์นี้ตอบ 2 คำถามที่ผู้ใช้ติซ้ำ ๆ:
 *     1) canvas วาดจริงไหม (มีพิกเซลสว่างบนขอบการ์ด)
 *     2) มีแสงทับ "ช่องภาพ" ไหม (ต้องเป็น 0 → การ์ดคม ไม่มีฝ้า)
 *
 * วิธีใช้:
 *   node scripts/inspect-card-canvas.mjs
 *   node scripts/inspect-card-canvas.mjs --base http://localhost:3100 --query 'variant=neon&rarity=MYTHIC'
 */
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9347'));
const QUERY = arg('--query', 'variant=neon');
const FREEZE = arg('--freeze', '2.2');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
      return;
    }
    if (m.method) events.push(m.method);
  });
  await new Promise((res, rej) => {
    socket.addEventListener('open', () => res());
    socket.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    socket.send(JSON.stringify({ id: nextId, method, params }));
  });
  return { send, events };
}

const url = `${BASE}/aura-preview${QUERY ? `?${QUERY}` : ''}`;
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

const PROBE = `(() => {
  const canvases = Array.from(document.querySelectorAll('canvas.card-aura-canvas'));
  const out = [];
  for (const c of canvases.slice(0, 4)) {
    const host = c.parentElement;
    const ctx = c.getContext('2d');
    if (!ctx) continue;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    let maxA = 0;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (a > 8) { lit += 1; sum += a; }
      if (a > maxA) maxA = a;
    }
    const bleed = 0.12;
    const cardW = c.width / (1 + bleed * 2);
    const cardH = c.height / (1 + bleed * 2);
    const offX = c.width * (bleed / (1 + bleed * 2));
    const offY = c.height * (bleed / (1 + bleed * 2));
    const at = (fx, fy) => {
      const px = Math.round(offX + cardW * fx);
      const py = Math.round(offY + cardH * fy);
      return d[(py * c.width + px) * 4 + 3];
    };
    // ช่องภาพจริง (หน่วยการ์ด 420×600): x 24–396 · y 106–328 (มุมโค้ง r=10)
    // → สุ่มลึกเข้ามา 25–75% ของช่องภาพ เพื่อไม่ให้ตกใน "ร่องมุมโค้ง" ซึ่งไม่ใช่ตัวภาพ
    const art = (fx, fy) => at((24 + 372 * fx) / 420, (106 + 222 * fy) / 600);
    out.push({
      w: c.width, h: c.height,
      hostW: host ? Math.round(host.getBoundingClientRect().width) : 0,
      litPixels: lit,
      litRatio: +(lit / (c.width * c.height)).toFixed(4),
      maxAlpha: maxA,
      avgAlphaOfLit: lit ? +(sum / lit).toFixed(1) : 0,
      artCenter: art(0.5, 0.5),
      artTopLeft: art(0.25, 0.25),
      artBottomRight: art(0.75, 0.75),
      frameTop: at(0.5, 0.015),
      frameBottom: at(0.5, 0.985),
    });
  }
  return JSON.parse(JSON.stringify({ canvases: out, count: canvases.length }));
})()`;


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
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 700, deviceScaleFactor: 2, mobile: false,
  });
  if (FREEZE !== '') {
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__CARD_NEON_TIME__ = ${Number(FREEZE) || 0};`,
    });
  }
  await send('Page.navigate', { url });
  for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
  await sleep(2500);

  const result = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE });
  const data = result.result.value ?? {};
  console.log(`URL: ${url}`);
  console.log(`พบ canvas: ${data.count}`);
  let fail = 0;
  for (const c of data.canvases || []) {
    const artMax = Math.max(c.artCenter, c.artTopLeft, c.artBottomRight);
    const frameMax = Math.max(c.frameTop, c.frameBottom);
    const drawOk = c.litPixels > 500;
    const sharpOk = artMax <= 8;
    const glowOk = frameMax > 8;
    if (!drawOk || !sharpOk || !glowOk) fail += 1;
    console.log(`  ${drawOk ? '✅' : '❌'} วาดจริง: พิกเซลสว่าง ${c.litPixels} (${(c.litRatio * 100).toFixed(1)}%) · maxA=${c.maxAlpha} · เฉลี่ยA=${c.avgAlphaOfLit} · การ์ดกว้าง ${c.hostW}px`);
    console.log(`  ${glowOk ? '✅' : '❌'} แสงที่ขอบการ์ด: alpha=${frameMax}`);
    console.log(`  ${sharpOk ? '✅' : '❌'} ไม่มีแสงทับช่องภาพ: alpha กลางภาพ=${c.artCenter} มุมภาพ=${c.artTopLeft}/${c.artBottomRight}`);
  }
  if (!data.count) {
    console.log('❌ ไม่พบ canvas (ระดับนี้อาจไม่มีเอฟเฟกต์ หรือหน้าเว็บยังไม่ build)');
    fail += 1;
  }
  console.log(fail ? `\n❌ ไม่ผ่าน ${fail} การ์ด` : '\n✅ ผ่านทั้งหมด');
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('ตรวจไม่สำเร็จ:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
}

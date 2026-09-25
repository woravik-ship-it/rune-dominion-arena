#!/usr/bin/env node
/**
 * ตรวจเอฟเฟกต์เกลียวตามเวลา (แช่เวลา) ด้วย "พิกเซลจริง" — ไม่ต้องดูด้วยตา
 *
 * ตอบ 3 คำถาม (ตามคำสั่งผู้ใช้ 2026-09-25):
 *   1) ถอดวงแหวนใต้เท้าจริงไหม → ตรวจจุดที่วงแหวนเดิมเคยอยู่ (cx ± rx, y = art.y+art.h*0.88)
 *      ตลอดหลายเฟรม: ถ้ายังมีวงแหวน จุดนั้นจะสว่างเกือบทุกเฟรม
 *   2) เกลียว "ค่อย ๆ ขึ้น/ค่อย ๆ จาง" ไหม → ดูโปรไฟล์ความสว่างรายแถบ (y-band) ต่อเฟรม
 *   3) มีหลายเส้น (สั้น/ยาว) ไหม → นับ "กลุ่ม" แถบสว่างที่ไม่ติดกันในแนวตั้งต่อเฟรม
 *
 * วิธีใช้: node scripts/probe-spiral-cycle.mjs --query 'variant=neon&rarity=MYTHIC' --times 0,1.2,2.4
 */
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9351'));
const QUERY = arg('--query', 'variant=neon');
const TIMES = arg('--times', '0,1.2,2.4,3.6,4.8,6,7.2,8.4,9.6')
  .split(',')
  .map((v) => Number(v))
  .filter((v) => Number.isFinite(v));
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
const PROBE = `(() => {
  const c = document.querySelector('canvas.card-aura-canvas');
  const host = c && c.parentElement;
  if (!c || !host) return { error: 'no canvas' };
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const frameImg = Array.from(host.querySelectorAll('img')).find((i) => (i.className || '').includes('object-contain'));
  const el = frameImg.getBoundingClientRect();
  const cr = c.getBoundingClientRect();
  const sx = c.width / cr.width;
  const nr = frameImg.naturalWidth / frameImg.naturalHeight;
  const er = el.width / el.height;
  const drawW = er > nr ? el.height * nr : el.width;
  const drawH = er > nr ? el.height : el.width / nr;
  const card = { x: (el.left + (el.width - drawW) / 2 - cr.left) * sx, y: (el.top + (el.height - drawH) / 2 - cr.top) * sx, w: drawW * sx, h: drawH * sx };
  const A = (cx, cy) => {
    const px = Math.round(card.x + (cx / 420) * card.w);
    const py = Math.round(card.y + (cy / 600) * card.h);
    if (px < 0 || py < 0 || px >= c.width || py >= c.height) return 0;
    return d[(py * c.width + px) * 4 + 3];
  };
  const bands = [];
  for (let b = 0; b < 10; b += 1) {
    const y0 = 16 + (568 / 10) * b; // ครอบ 'ทั้งการ์ด' (กรอบ 8..592) ไม่ใช่แค่ช่องภาพ
    const y1 = 16 + (568 / 10) * (b + 1);
    let lit = 0;
    let peak = 0;
    for (let x = 30; x <= 390; x += 4) {
      for (let y = y0 + 2; y < y1; y += 3) {
        const a = A(x, y);
        if (a > 8) lit += 1;
        if (a > peak) peak = a;
      }
    }
    bands.push({ b, lit, peak });
  }
  const ringPts = [A(121, 301), A(299, 301), A(210, 301), A(165, 301), A(255, 301)];
  // นับจำนวน "รอยตัด" ของแสงบนแนวนอน 3 ระดับ (y=200/300/450) → หลายเส้น = หลายรอย
  const crossings = [200, 300, 450].map((cy) => {
    let runs = 0;
    let prev = false;
    for (let x = 26; x <= 394; x += 2) {
      const on = A(x, cy) > 30;
      if (on && !prev) runs += 1;
      prev = on;
    }
    return runs;
  });
  let feetLit = 0;
  for (let x = 30; x <= 390; x += 2) for (let y = 290; y <= 315; y += 2) if (A(x, y) > 20) feetLit += 1;
  return { bands, ringPts, feetLit, crossings };
})()`;

const url = `${BASE}/aura-preview${QUERY ? `?${QUERY}` : ''}`;
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });

try {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = (await res.json()).filter((t) => t.type === 'page' && !t.url.startsWith('chrome'));
    } catch { await sleep(500); }
  }
  if (!targets?.length) throw new Error('เชื่อมต่อ Chrome ไม่ได้');
  const { send, events } = await connect(targets[0].webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 2, mobile: false });
  console.log(`URL: ${url} · times: ${TIMES.join(', ')}s`);
  const rows = [];
  for (const t of TIMES) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__CARD_NEON_TIME__ = ${t};` });
    events.length = 0;
    await send('Page.navigate', { url });
    for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
    await sleep(1200);
    const res = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE });
    const v = res.result.value ?? {};
    if (v.error) { console.log('ERROR', v.error); break; }
    const litBands = v.bands.filter((b) => b.lit > 0).map((b) => b.b);
    const peakOf = (b) => (v.bands[b] ? v.bands[b].peak : 0);
    rows.push({ t, litBands, feetLit: v.feetLit, ringPts: v.ringPts, crossings: v.crossings });
    console.log(`t=${String(t).padStart(4)}s · แถบแสง(บนช่องภาพ=0 → ล่าง=9)=[${litBands.join(',')}] · peak ล่าง/กลาง/บน=${peakOf(1)}/${peakOf(4)}/${peakOf(8)} · จุดวงแหวนเดิม=${v.ringPts.join(',')} · รอยตัดแนวนอน=${v.crossings.join('/')}`);
  }
  const ringHot = rows.filter((r) => r.ringPts.some((a) => a > 40)).length;
  const groups = rows.map((r) => {
    let g = 0;
    for (let i = 0; i < r.litBands.length; i += 1) if (i === 0 || r.litBands[i] !== r.litBands[i - 1] + 1) g += 1;
    return g;
  });
  console.log('\n--- สรุป ---');
  console.log(`วงแหวนใต้เท้า: จุดที่วงแหวนเดิมเคยอยู่ สว่าง(>40) ใน ${ringHot}/${rows.length} เฟรม (ต้อง ~0 = ถอดแล้ว)`);
  const maxCross = Math.max(...rows.map((r) => Math.max(...(r.crossings || [0]))));
  console.log(`รอยตัดของแสงบนแนวนอน สูงสุด: ${maxCross} รอย (≥3 = มีหลายเส้นคนละทางจริง)`);
  console.log(`จำนวนกลุ่มแถบแสงในแนวตั้งต่อเฟรม: ${groups.join(', ')}`);
  console.log(`มีเฟรมที่แสงคลุมล่าง→บน ≥8 แถบไหม: ${rows.some((r) => r.litBands.length >= 8) ? 'มี ✅' : 'ไม่มี ⚠️'}`);
  process.exitCode = ringHot > 1 ? 1 : 0;
} catch (e) {
  console.error('ตรวจไม่สำเร็จ:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
}

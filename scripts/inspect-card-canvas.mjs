#!/usr/bin/env node
/**
 * ตรวจเอฟเฟกต์ Canvas ของการ์ดด้วย "พิกเซลจริง" (ไม่ต้องดูด้วยตา)
 *
 * ทำไมต้องมี: บทเรียนจาก docs/FOIL_STATUS.md — เคยประเมินเอฟเฟกต์จากคำบรรยายแล้วไม่ตรงกัน
 *   สคริปต์นี้ตอบ 4 คำถาม:
 *     1) canvas วาดจริงไหม (มีพิกเซลสว่างบนขอบการ์ด)
 *     2) มีแสง "ในช่องภาพ" ไหม (เกลียวแสงปีนขึ้นหลายเส้น/แสงกวาด — ตาม GIF อ้างอิง 2026-09-25)
 *        · ชั้นเหล่านี้อยู่ "ในช่องภาพ" โดยเจตนา ⇒ ถ้าไม่มีเลย = ชั้นใหม่ไม่ถูกวาด
 *     3) แสงขอบ "เกาะเส้นกรอบการ์ดพอดี" ไหม (เทียบกล่องการ์ดจริงจาก DOM — บั๊กเดิมเยื้อง ~25 หน่วย)
 *     4) แสง "ไม่ล้นออกนอกช่องภาพ" ไหม (แถบชื่อ/กล่องข้อความ/แถบสเตตัส ต้องสะอาด = ดีไซน์ Inner)
 *   (หมายเหตุ 2026-09-24: ตัดข้อ "เปลวไฟ" ออก — ชั้นเปลวไฟถูกถอดตามรีวิวผู้ใช้
 *    "ฟันเลื่อย/ชอล์ก ไม่เข้ากับดีไซน์" เหลือแต่ออร่า+แสงไหล)
 *
 * วิธีใช้:
 *   node scripts/inspect-card-canvas.mjs
 *   node scripts/inspect-card-canvas.mjs --base http://localhost:3000 --query 'variant=neon&rarity=MYTHIC'
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
// ระดับที่เลือกได้จาก query — ใช้ตัดสินเกณฑ์ (UNCOMMON = "วิ่งรอบอย่างเดียว" ไม่มีแสงในช่องภาพ)
const RARITY = (QUERY.match(/rarity=([A-Za-z]+)/) || [])[1]?.toUpperCase() ?? '';
const NEEDS_ART_LIGHT = !['COMMON', 'UNCOMMON'].includes(RARITY);
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
    if (!ctx || !host) continue;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const A = (px, py) => (px < 0 || py < 0 || px >= c.width || py >= c.height)
      ? 0 : d[(Math.round(py) * c.width + Math.round(px)) * 4 + 3];
    let lit = 0;
    let maxA = 0;
    let sum = 0;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i];
      if (a > 8) { lit += 1; sum += a; }
      if (a > maxA) maxA = a;
    }
    // "กล่องการ์ดจริง" = กล่องที่ <img class="object-contain"> วาดเฟรมการ์ด (ground truth จาก DOM)
    // ใช้เทียบว่าแสง canvas เกาะเส้นกรอบการ์ดพอดี (บั๊กเดิม: ออร่าเยื้อง ~25 หน่วยการ์ด)
    const frameImg = Array.from(host.querySelectorAll('img'))
      .find((i) => (i.className || '').includes('object-contain'));
    let card = null;
    if (frameImg && frameImg.naturalWidth > 0 && frameImg.clientWidth > 0) {
      const el = frameImg.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const sx = c.width / cr.width; // device px ต่อ CSS px ของ canvas
      const nr = frameImg.naturalWidth / frameImg.naturalHeight;
      const er = el.width / el.height;
      const drawW = er > nr ? el.height * nr : el.width;
      const drawH = er > nr ? el.height : el.width / nr;
      card = {
        x: (el.left + (el.width - drawW) / 2 - cr.left) * sx,
        y: (el.top + (el.height - drawH) / 2 - cr.top) * sx,
        w: drawW * sx,
        h: drawH * sx,
      };
    }
    // หน่วยการ์ด (420×600) → พิกเซล device ของ canvas
    const px = (cx) => card.x + (cx / 420) * card.w;
    const py = (cy) => card.y + (cy / 600) * card.h;
    // แถวสว่างสุดใกล้ขอบบน/ล่าง (คอลัมน์กลางการ์ด)
    // เส้นกรอบการ์ดอยู่ที่ y=8 และ y=592 · เส้นไหลขยับเข้า 8 หน่วย → y=16 / y=584
    // ยอมรับพีคจาก "เส้นไหนก็ได้" (ออร่าพื้นหลังหรือเส้นไหล) ขอแค่อยู่ในวงกรอบ
    // เส้นขอบการ์ดทั้ง 4 ด้าน (y=8 / y=592 / x=8 / x=412) — วัด "alpha สูงสุดใกล้เส้น" (±6 หน่วย)
    // ⚠️ 2026-09-25: เดิมหาพีคในกรอบกว้าง (y -30..45) → แสงเกลียวที่คลุมทั้งการ์ดกลบได้ ⇒ วัดตรงเส้นแทน
    const ringAt = (cx, cy) => {
      let m = 0;
      if (!card) return 0;
      for (let dx = -6; dx <= 6; dx += 2) {
        for (let dy = -6; dy <= 6; dy += 2) m = Math.max(m, A(px(cx + dx), py(cy + dy)));
      }
      return m;
    };
    const ring = card
      ? { top: ringAt(210, 8), bottom: ringAt(210, 592), left: ringAt(8, 300), right: ringAt(412, 300) }
      : { top: 0, bottom: 0, left: 0, right: 0 };
    // ช่องภาพจริง (หน่วยการ์ด 420×600): x 24–396 · y 106–328 (มุมโค้ง r=10)
    // → วัดลึกเข้ามา 25–75% ของช่องภาพ เพื่อไม่ให้ตกใน "ร่องมุมโค้ง" ซึ่งไม่ใช่ตัวภาพ
    const art = (fx, fy) => (card ? A(px(24 + 372 * fx), py(106 + 222 * fy)) : -1);
    // ชั้นใหม่ (2026-09-25 · ตาม GIF อ้างอิง) วาด "ในช่องภาพ" (เกลียวปีนขึ้น/วงแหวนฐาน/แสงกวาด)
    //   → ในช่องภาพ "ต้องมีแสง" (ตั้งใจ) แต่ห้ามล้นไปทับส่วนอื่นของการ์ด
    let artLit = 0;   // จำนวนจุดวัดในช่องภาพที่มีแสง
    let artMax = 0;   // alpha สูงสุดในช่องภาพ
    if (card) {
      for (let gx = 36; gx <= 384; gx += 6) {
        for (let gy = 118; gy <= 316; gy += 6) {
          const a = A(px(gx), py(gy));
          if (a > 8) artLit += 1;
          if (a > artMax) artMax = a;
        }
      }
    }
    // 2026-09-25 (ผู้ใช้สั่ง "ให้วนทั้งการ์ด ไม่ใช่แค่ในภาพ") → แสง **ควร** ทับโซนชื่อ/ข้อความ
    //   ⇒ เลิกใช้เกณฑ์ "ช่องภาพสะอาด" แล้วใช้เกณฑ์ใหม่: แสงต้อง **ไม่ล้นออกนอกกรอบการ์ด**
    const clean = (cx, cy) => (card ? A(px(cx), py(cy)) : -1);
    // จุดรอบนอกการ์ด (ในโซนเผื่อ 12% ของ canvas) → ต้องโปร่งใสเสมอ
    let outside = 0;
    if (card) {
      for (const [gx, gy] of [[-14, 300], [434, 300], [210, -14], [210, 614], [-10, 40], [430, 560]]) {
        outside = Math.max(outside, A(px(gx), py(gy)));
      }
    }
    out.push({
      w: c.width, h: c.height,
      hostW: Math.round(host.getBoundingClientRect().width),
      litPixels: lit,
      litRatio: +(lit / (c.width * c.height)).toFixed(4),
      maxAlpha: maxA,
      avgAlphaOfLit: lit ? +(sum / lit).toFixed(1) : 0,
      cardFound: !!card,
      ring,
      artCenter: art(0.5, 0.5), // เก็บไว้ดีบัก (แสงในช่องภาพไม่ถือว่าเสียแล้ว)
      artLit, artMax,
      cleanName: clean(210, 55),
      cleanText: clean(210, 443),
      cleanStats: clean(210, 549),
      outsideMax: outside,
    });
  }
  return JSON.parse(JSON.stringify({ canvases: out, count: canvases.length }));
})()`;


try {
  let targets = null;
  for (let i = 0; i < 60 && !targets; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = (await res.json()).filter((t) => t.type === 'page' && !t.url.startsWith('chrome'));
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
    // COMMON = ไม่ต้องมีแสงเลย (canvas เปล่า = ถูกต้อง)
    const drawOk = RARITY === 'COMMON' ? c.litPixels < 200 : c.litPixels > 500;
    // ชั้นตาม GIF อ้างอิงต้องมีแสง "ในช่องภาพ" (ถ้าไม่มี = ชั้นวนรอบไม่ถูกวาด)
    const orbitOk = !NEEDS_ART_LIGHT || c.artLit > 0;
    // และต้องไม่ล้นออกไปทับชื่อ/กล่องข้อความ/แถบสเตตัส (การันตีของดีไซน์ Inner)
    // ต้อง "ไม่ล้นออกนอกกรอบการ์ด" (โซนเผื่อรอบการ์ดต้องโปร่งใส)
    // นอกการ์ดยอมให้มีเงาฟุ้งของขอบการ์ด (การออกแบบมี bleed 12%) แต่ต้องไม่มีเกลียว/เส้นไหลล้นออก
    const innerOk = c.outsideMax <= 48;
    // แสงขอบต้องพีคในวงกรอบการ์ด: บน y=8±10 / ล่าง y=584..592±10
    // (เส้นไหลขยับเข้า 8 → พีคล่างอาจอยู่ที่ ~582 แทน 592 — ยังถือว่าเกาะขอบ)
    const r = c.ring || { top: 0, bottom: 0, left: 0, right: 0 };
    // COMMON = การ์ดธรรมดา ไม่ต้องมีแสงขอบเลย
    const alignOk = RARITY === 'COMMON'
      ? r.top < 20 && r.bottom < 20
      : c.cardFound && r.top > 60 && r.bottom > 60 && r.left > 60 && r.right > 60;
    if (!drawOk || !orbitOk || !innerOk || !alignOk) fail += 1;
    console.log(`  ${drawOk ? '✅' : '❌'} วาดจริง: พิกเซลสว่าง ${c.litPixels} (${(c.litRatio * 100).toFixed(1)}%) · maxA=${c.maxAlpha} · เฉลี่ยA=${c.avgAlphaOfLit} · การ์ดกว้าง ${c.hostW}px`);
    console.log(`  ${alignOk ? '✅' : '❌'} แสงขอบการ์ดครบ 4 ด้าน: บน=${r.top} ล่าง=${r.bottom} ซ้าย=${r.left} ขวา=${r.right} (ต้อง > 60 ทุกด้าน)`);
    console.log(`  ${orbitOk ? '✅' : '❌'} ${NEEDS_ART_LIGHT ? 'มีแสงในช่องภาพ (เกลียว/แสงกวาด)' : 'ระดับนี้ไม่ต้องมีแสงในช่องภาพ (UNCOMMON = วิ่งรอบขอบ)'}: จุดสว่าง ${c.artLit} · maxA=${c.artMax}`);
    console.log(`  ${innerOk ? '✅' : '❌'} แสงไม่ล้นออกนอกกรอบการ์ด: นอกการ์ด alpha=${c.outsideMax} (ต้อง ≤ 48 = แค่เงาฟุ้งขอบ)`);
    console.log(`     (ข้อมูล: หลังคำสั่ง "วนทั้งการ์ด" แสงทับชื่อ/ข้อความ/สเตตัสได้ตามเจตนา: ${c.cleanName}/${c.cleanText}/${c.cleanStats})`);
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

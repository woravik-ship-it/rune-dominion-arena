#!/usr/bin/env node
/**
 * ตรวจ "UI มือถือล้นขอบ" บนหน้าเว็บจริงด้วย Chrome (CDP) — วัดที่ความกว้างมือถือ
 *
 * ผู้ใช้สั่ง 2026-09-25: "แก้ UI เมนูต่างๆ ในมือถือ มันล้นขอบ แก้ไขให้พอดี"
 * สคริปต์นี้ตรวจ 2 ระดับ:
 *   1) ระดับหน้า: document scrollWidth > ความกว้างจอ = มีแถบเลื่อนนอน (ล้นขอบจริง)
 *   2) ระดับองค์ประกอบ: หา element ที่ขอบซ้าย/ขวาหลุดออกนอกจอ
 *      (ข้าม element ที่อยู่ในกล่อง scroll ได้ตั้งใจ — overflow auto/scroll/hidden)
 *
 * วิธีใช้:
 *   node scripts/inspect-mobile-overflow.mjs --token "<session>"
 *   node scripts/inspect-mobile-overflow.mjs --token "<session>" --paths /,/cards,/decks
 *   node scripts/inspect-mobile-overflow.mjs --token "<session>" --width 360 --shot public/_shots/mobile
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9351'));
const WIDTH = Number(arg('--width', '360'));
const HEIGHT = Number(arg('--height', '780'));
const SHOT = arg('--shot', '');
const PATHS = arg(
  '--paths',
  '/,/discover,/cards,/decks,/battle,/arena,/quests,/events,/wallet,/inventory,/settings,/profile'
).split(',').map((p) => p.trim()).filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** วัดการล้นขอบ + รายชื่อองค์ประกอบที่หลุดจอ (รันใน browser) */
const MEASURE = `(() => {
  const vw = window.innerWidth;
  const doc = document.documentElement;
  const clipped = (el) => {
    let node = el.parentElement;
    while (node && node !== doc) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      node = node.parentElement;
    }
    return false;
  };
  const describe = (el) => {
    const cls = (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean).slice(0, 3).join('.');
    const id = el.id ? '#' + el.id : '';
    return el.tagName.toLowerCase() + id + (cls ? '.' + cls : '');
  };
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
    if (clipped(el)) continue;
    offenders.push({
      el: describe(el),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      over: Math.round(Math.max(r.right - vw, -r.left)),
      text: (el.textContent || '').trim().slice(0, 24),
    });
  }
  // กล่องที่ "เลื่อนได้ในตัวเอง" (เมนู) — ดูว่ามีเนื้อหาซ่อนอยู่นอกกรอบไหม
  const scrollers = [...document.querySelectorAll('nav, header, [class*="overflow-x"]')]
    .filter((el) => el.scrollWidth > el.clientWidth + 1)
    .map((el) => ({
      el: describe(el),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      hidden: el.scrollWidth - el.clientWidth,
    }));
  return {
    vw,
    docScrollWidth: doc.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    pageOverflow: doc.scrollWidth - vw,
    offenders: offenders.sort((a, b) => b.over - a.over).slice(0, 10),
    offendersTotal: offenders.length,
    scrollers,
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

mkdirSync(dirname(SHOT || 'var/x'), { recursive: true });
const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    // โปรไฟล์แยก (กันชนกับ Chrome จริง/รอบก่อนหน้า) — ไม่งั้น Chrome จะไปเกาะโปรเซสเดิมแล้วไม่เปิดพอร์ตดีบัก
    `--user-data-dir=/tmp/rda-mobile-audit-${PORT}`,
    '--no-first-run',
    '--disable-extensions',
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: true,
  });

  if (TOKEN) {
    await send('Network.setCookie', { name: 'rda_session', value: TOKEN, domain: 'localhost', path: '/' });
  }
  // จำลองผู้เล่นเดิม — ไม่ให้ onboarding modal ขึ้นมาบังการวัด (ดูเหตุผลใน inspect-battle-field.mjs)
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

  const results = [];
  for (const path of PATHS) {
    events.length = 0;
    await send('Page.navigate', { url: `${BASE}${path}` });
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
    await sleep(2200);
    const data = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;

    // ── ตรวจแผง "เมนูเพิ่มเติม" ของมือถือ (ปุ่ม ☰): เปิดแล้วทุกปุ่มต้องอยู่ในจอ + ไม่ทำให้หน้าล้นนอน
    let sheet = null;
    const hasMore = Boolean(
      (await send('Runtime.evaluate', {
        returnByValue: true,
        // ต้อง "มองเห็นจริง" (ปุ่มถูกซ่อนด้วย md:hidden บนจอใหญ่ — มีใน DOM แต่ไม่แสดงผล)
        expression: `(() => { const b = document.querySelector('[data-nav-more]'); return Boolean(b) && b.getBoundingClientRect().width > 0; })()`,
      })).result?.value
    );
    if (hasMore) {
      await send('Runtime.evaluate', {
        expression: `(() => { const b = document.querySelector('[data-nav-more]'); if (b) b.click(); return true; })()`,
      });
      await sleep(600);
      sheet = (await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
        const vw = window.innerWidth;
        const panel = document.querySelector('[data-nav-sheet]');
        const items = [...document.querySelectorAll('[data-nav-sheet-item]')].map((el) => {
          const r = el.getBoundingClientRect();
          return { href: el.getAttribute('data-nav-sheet-item'), left: Math.round(r.left), right: Math.round(r.right) };
        });
        return {
          open: Boolean(panel),
          items,
          inside: items.length > 0 && items.every((i) => i.left >= -0.5 && i.right <= vw + 0.5),
          pageOverflow: document.documentElement.scrollWidth - vw,
        };
      })()` })).result.value;
      // เก็บภาพตอนเปิดแผงเมนู (ให้เห็นของจริงว่าไม่ล้นขอบ)
      if (SHOT && sheet?.open) {
        const sheetShot = await send('Page.captureScreenshot', { format: 'png' });
        const name = path === '/' ? '-home' : path.replace(/\//g, '-');
        writeFileSync(`${SHOT}${name}-sheet.png`, Buffer.from(sheetShot.data, 'base64'));
      }
      // ปิดแผง (คลิก backdrop) แล้วยืนยันว่าปิดจริง
      await send('Runtime.evaluate', {
        expression: `(() => { const b = document.querySelector('[data-nav-sheet]'); if (b) b.click(); return true; })()`,
      });
      await sleep(400);
      sheet.closed = Boolean(
        (await send('Runtime.evaluate', { returnByValue: true, expression: `Boolean(document.querySelector('[data-nav-sheet]'))` }))
          .result?.value === false
      );
    }

    results.push({ path, ...data, sheet });
    if (SHOT) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      writeFileSync(`${SHOT}${path === '/' ? '-home' : path.replace(/\//g, '-')}.png`, Buffer.from(shot.data, 'base64'));
    }
  }

  // ===== สรุปผล =====
  console.log(`ขนาดจอที่ทดสอบ: ${WIDTH}x${HEIGHT} (mobile) · ${results.length} หน้า`);
  let failed = 0;
  for (const r of results) {
    // เกณฑ์: (1) หน้าไม่เลื่อนนอน (2) เมนู (nav/header) ต้องไม่มีการซ่อนเนื้อหาออกจากกรอบ
    //        (3) แผง "เมนูเพิ่มเติม" ต้องมีปุ่มครบ อยู่ในจอ และปิดได้
    const hiddenInMenu = r.scrollers
      .filter((s) => /^(nav|header)/i.test(s.el))
      .reduce((sum, s) => sum + s.hidden, 0);
    const sheetOk = !r.sheet || (r.sheet.open && r.sheet.inside && r.sheet.pageOverflow <= 1 && r.sheet.closed);
    const ok = r.pageOverflow <= 1 && hiddenInMenu <= 1 && sheetOk;
    if (!ok) failed += 1;
    console.log(
      `${ok ? '✅' : '❌'} ${r.path} — ล้นนอน ${r.pageOverflow}px (จอ ${r.vw} / เนื้อหา ${r.docScrollWidth}) · ` +
      `เมนูซ่อนเนื้อหา ${hiddenInMenu}px · องค์ประกอบหลุดจอ ${r.offendersTotal}`
    );
    if (r.sheet) {
      console.log(
        `     ☰ แผงเมนูเพิ่มเติม: ${r.sheet.items.length} ปุ่ม · อยู่ในจอ=${r.sheet.inside} · ปิดได้=${r.sheet.closed}` +
        (r.sheet.items.some((i) => i.right > r.vw + 0.5)
          ? ` · หลุดจอ: ${r.sheet.items.filter((i) => i.right > r.vw + 0.5).map((i) => i.href).join(',')}`
          : '')
      );
    }
    for (const o of r.offenders.slice(0, 4)) {
      console.log(`     ↳ ${o.el} left=${o.left} right=${o.right} w=${o.width} เกิน ${o.over}px "${o.text}"`);
    }
    for (const s of r.scrollers) {
      console.log(`     ⌛ ${s.el} ${s.clientWidth}/${s.scrollWidth} ซ่อน ${s.hidden}px`);
    }
  }
  console.log(`สรุป: ผ่าน ${results.length - failed}/${results.length} หน้า (เกณฑ์: ไม่มีแถบเลื่อนนอน + เมนูไม่ซ่อนเนื้อหา)`);
  if (SHOT) console.log(`ภาพ: ${SHOT}*.png`);
  process.exitCode = failed ? 1 : 0;
} catch (error) {
  console.error('ตรวจไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client = null;
  chrome.kill('SIGKILL');
}


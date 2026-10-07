#!/usr/bin/env node
/**
 * inspect-collection-perf.mjs — วัดความลื่นของหน้า "คอลเลคชั่นการ์ด" (/cards) ในเบราว์เซอร์จริง
 *
 * ที่มา 2026-10-07: ผู้ใช้แจ้ง *"หน้า คอลเลกชั่น ค่อนข้างกระตุก"*
 * ตามกฎของโปรเจกต์: ข้อร้องเรียนเรื่องความลื่นต้อง **วัดก่อน–หลัง** ไม่ใช่คาดเดา
 *
 * วัด 3 จังหวะ (ค่าเริ่มต้น = จอมือถือ 390×740 เหมือนที่ผู้ใช้เล่น):
 *   1) LOAD  — เปิดหน้า /cards จนการ์ดขึ้น: task/script/layout ms + long task + จำนวนคำขอ
 *   2) SCROLL — ล้อเมาส์ 24 ครั้ง (~1.5 วิ): fps จริง · long task · JS ms ต่อจังหวะ
 *   3) TYPE  — พิมพ์ 8 ตัวอักษรในช่องค้นหา: จำนวนคำขอ /api/collection (ต้องไม่ยิงทุกตัวอักษร) + JS ms
 *
 * วิธีใช้: node scripts/inspect-collection-perf.mjs --label=before
 *          node scripts/inspect-collection-perf.mjs --label=after --width=1280 --height=900
 *          (สมัครผู้ใช้ทดสอบให้เอง + ลบเมื่อจบ · --keep เพื่อเก็บไว้)
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '9381');
const LABEL = process.argv.find((a) => a.startsWith('--label='))?.split('=')[1] ?? 'run';
const KEEP = process.argv.includes('--keep');
const WIDTH = Number(process.argv.find((a) => a.startsWith('--width='))?.split('=')[1] ?? '390');
const HEIGHT = Number(process.argv.find((a) => a.startsWith('--height='))?.split('=')[1] ?? '740');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    if (message.method) events.push({ method: message.method, params: message.params });
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

const suffix = Date.now().toString().slice(-7);
let prisma = null;
let userId = null;

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();

  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `perf_${suffix}`,
      email: `perf_${suffix}@example.com`,
      password: 'Perf12345!',
      displayName: 'Perf Probe',
    }),
  });
  const regJson = await reg.json();
  if (!reg.ok || !regJson?.success) throw new Error(`สมัครไม่สำเร็จ: ${JSON.stringify(regJson)}`);
  userId = regJson.data.user.id;
  const token = (reg.headers.get('set-cookie') ?? '').match(/rda_session=([^;]+)/)?.[1] ?? '';

  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--enable-precise-memory-info',
      `--user-data-dir=/tmp/rda-colperf-${PORT}`,
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
    const { send } = client;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Performance.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: WIDTH < 700,
    });
    await send('Network.setCookie', { name: 'rda_session', value: token, url: BASE, path: '/' });

    const metrics = async () => {
      const { metrics: list } = await send('Performance.getMetrics');
      return Object.fromEntries(list.map((m) => [m.name, m.value]));
    };
    const delta = (a, b, key) => Math.round(((b[key] ?? 0) - (a[key] ?? 0)) * 1000);

    // ---- ตัวนับในหน้า: เฟรมที่วาดได้จริง + long task + เวลา ----
    const installCounters = `(() => {
      if (window.__perfProbe) return true;
      const p = { frames: 0, longtasks: 0, longtaskMs: 0, t0: performance.now() };
      window.__perfProbe = p;
      const loop = () => { p.frames++; window.requestAnimationFrame(loop); };
      window.requestAnimationFrame(loop);
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) { p.longtasks++; p.longtaskMs += e.duration; }
        }).observe({ entryTypes: ['longtask'] });
      } catch {}
      return true;
    })()`;
    const readCounters = `(() => { const p = window.__perfProbe;
      return { frames: p.frames, longtasks: p.longtasks, longtaskMs: p.longtaskMs, t: performance.now() }; })()`;

    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: false });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result?.value;
    };

    // ---- จังหวะ 1: LOAD ----
    const reqBefore = client.events.filter((e) => e.method === 'Network.requestWillBeSent').length;
    await send('Page.navigate', { url: `${BASE}/cards` });
    await evaluate(installCounters);
    for (let i = 0; i < 80; i += 1) {
      const n = await evaluate(`document.querySelectorAll('[data-collection-card]').length`);
      if (n > 0) break;
      await sleep(250);
    }
    await sleep(1500); // ให้ภาพ/แสงเริ่มวาดครบ
    const mAfterLoad = await metrics();
    const cards = await evaluate(`document.querySelectorAll('[data-collection-card]').length`);
    const canvases = await evaluate(`document.querySelectorAll('canvas').length`);
    const reqAfterLoad = client.events.filter((e) => e.method === 'Network.requestWillBeSent').length;
    const c1 = await evaluate(readCounters);

    // ---- จังหวะ 2: SCROLL (ล้อเมาส์ 24 ครั้ง) ----
    const mScroll0 = await metrics();
    const cScroll0 = c1;
    for (let i = 0; i < 24; i += 1) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.round(WIDTH / 2),
        y: Math.round(HEIGHT / 2),
        deltaX: 0,
        deltaY: 260,
      });
      await sleep(60);
    }
    await sleep(400);
    const mScroll1 = await metrics();
    const cScroll1 = await evaluate(readCounters);
    const scrollSeconds = (cScroll1.t - cScroll0.t) / 1000;
    const fps = scrollSeconds > 0 ? Math.round((cScroll1.frames - cScroll0.frames) / scrollSeconds) : 0;

    // ---- จังหวะ 3: TYPE (พิมพ์ 8 ตัวอักษรในช่องค้นหา) ----
    await evaluate(`document.querySelector('[data-collection-search]').scrollIntoView({block:'center'}); true`);
    await evaluate(`document.querySelector('[data-collection-search]').focus(); true`);
    const reqBeforeType = client.events.filter(
      (e) => e.method === 'Network.requestWillBeSent' && String(e.params?.request?.url ?? '').includes('/api/collection')
    ).length;
    const mType0 = await metrics();
    const cType0 = await evaluate(readCounters);
    for (const ch of 'abcdefgh') {
      await send('Input.insertText', { text: ch });
      await sleep(80);
    }
    await sleep(1200); // รอ debounce (ถ้ามี) ให้ยิงครบ
    const mType1 = await metrics();
    const cType1 = await evaluate(readCounters);
    const reqAfterType = client.events.filter(
      (e) => e.method === 'Network.requestWillBeSent' && String(e.params?.request?.url ?? '').includes('/api/collection')
    ).length;

    const report = {
      label: LABEL,
      viewport: `${WIDTH}x${HEIGHT}`,
      cardsRendered: cards,
      canvases,
      load: {
        requests: reqAfterLoad - reqBefore,
        longtasks: c1.longtasks,
        longtaskMs: Math.round(c1.longtaskMs),
      },
      scroll: {
        fps,
        seconds: Number(scrollSeconds.toFixed(2)),
        taskMs: delta(mScroll0, mScroll1, 'TaskDuration'),
        scriptMs: delta(mScroll0, mScroll1, 'ScriptDuration'),
        layoutMs: delta(mScroll0, mScroll1, 'LayoutDuration'),
        longtasks: cScroll1.longtasks - cScroll0.longtasks,
        longtaskMs: Math.round(cScroll1.longtaskMs - cScroll0.longtaskMs),
      },
      type: {
        chars: 8,
        collectionRequests: reqAfterType - reqBeforeType,
        taskMs: delta(mType0, mType1, 'TaskDuration'),
        scriptMs: delta(mType0, mType1, 'ScriptDuration'),
        longtasks: cType1.longtasks - cType0.longtasks,
        longtaskMs: Math.round(cType1.longtaskMs - cType0.longtaskMs),
      },
      heapMb: Math.round(((await evaluate('performance.memory ? performance.memory.usedJSHeapSize : 0')) / 1048576) * 10) / 10,
    };

    console.log(JSON.stringify(report, null, 2));

    // ---- เกณฑ์ผ่าน (ให้คำสั่งล้มเมื่อถดถอย) ----
    const gates = [
      ['fps ขณะเลื่อน ≥ 45', report.scroll.fps >= 45],
      ['long task ขณะเลื่อน < 400 ms', report.scroll.longtaskMs < 400],
      ['พิมพ์ 8 ตัว → ยิง /api/collection ≤ 3 ครั้ง', report.type.collectionRequests <= 3],
    ];
    let failed = 0;
    for (const [name, ok] of gates) {
      console.log(`${ok ? '✅' : '❌'} ${name}`);
      if (!ok) failed += 1;
    }
    if (failed) process.exitCode = 1;
  } finally {
    if (client) await client.send('Browser.close').catch(() => undefined);
    chrome.kill('SIGKILL');
    if (prisma && userId && !KEEP) {
      await prisma.user.delete({ where: { id: userId } }).catch((e) => console.log('ลบผู้ใช้ทดสอบไม่สำเร็จ:', e.message));
    }
    await prisma?.$disconnect();
  }
}

main().catch((e) => {
  console.error('❌ ล้ม:', e.message);
  process.exitCode = 1;
});

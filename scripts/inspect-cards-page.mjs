#!/usr/bin/env node
/**
 * ตรวจ "หน้าเว็บจริง" ด้วย Chrome DevTools Protocol (ไม่ใช่ดูโค้ด):
 *  - เปิดหน้าเว็บพร้อม session cookie จริง
 *  - อ่านหัวเรื่อง + นับการ์ด + ตรวจรูปแต่ละใบ (src, ขนาดจริงที่โหลดได้, ขนาดที่แสดงบนจอ)
 *  - ถ่ายภาพหน้าจอเก็บไว้
 *
 * วิธีใช้:
 *   node scripts/inspect-cards-page.mjs --token "<session>" [--path /cards] [--out /tmp/x.png]
 */
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const PATH = arg('--path', '/cards');
const OUT = arg('--out', '/tmp/inspect.png');
const PORT = Number(arg('--port', '9333'));
const BASE = arg('--base', 'http://localhost:3000');

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
    socket.addEventListener('error', (error) => reject(error));
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      nextId += 1;
      pending.set(nextId, { resolve, reject });
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });

  return { send, events, close: () => socket.close() };
}

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    '--window-size=412,1200',
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
    await send('Network.setCookie', {
      name: 'rda_session',
      value: TOKEN,
      domain: 'localhost',
      path: '/',
    });
  }

  await send('Page.navigate', { url: `${BASE}${PATH}` });
  for (let i = 0; i < 40 && !events.includes('Page.loadEventFired'); i += 1) await sleep(250);
  await sleep(3500);

  const evaluated = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const imgs = [...document.querySelectorAll('img')].map((img) => {
        const box = img.getBoundingClientRect();
        const cs = getComputedStyle(img);
        return {
          src: img.getAttribute('src'),
          natural: img.naturalWidth + 'x' + img.naturalHeight,
          shown: Math.round(box.width) + 'x' + Math.round(box.height),
          visible: box.width > 0 && box.height > 0,
          position: cs.position,
          inlineHeight: img.style.height,
          parentH: Math.round(img.parentElement?.getBoundingClientRect().height ?? -1),
          parentW: Math.round(img.parentElement?.getBoundingClientRect().width ?? -1),
        };
      });

      // วัดชั้นของการ์ด (เพื่อดูว่าชั้นไหนสูง 0)
      const tiles = [...document.querySelectorAll('a[href^="/cards/"]')].slice(0, 3).map((a) => {
        const chain = [];
        let node = a;
        for (let depth = 0; depth < 4 && node; depth += 1) {
          const box = node.getBoundingClientRect();
          const cs = getComputedStyle(node);
          chain.push({
            tag: node.tagName.toLowerCase(),
            cls: (node.className || '').toString().slice(0, 60),
            size: Math.round(box.width) + 'x' + Math.round(box.height),
            aspectRatio: cs.aspectRatio,
            position: cs.position,
          });
          node = node.firstElementChild;
        }
        return chain;
      });

      return {
        path: location.pathname,
        title: document.title,
        h1: document.querySelector('h1')?.textContent?.trim() ?? null,
        cardTileCount: document.querySelectorAll('a[href^="/cards/"]').length,
        imgCount: imgs.length,
        artImgs: imgs.filter((i) => i.src && i.src.includes('/art')),
        invisibleImgs: imgs.filter((i) => !i.visible).length,
        texts: document.body.innerText.split('\\n').filter(Boolean).slice(0, 6),
        tileChains: tiles,
      };
    })()`,
  });

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  console.log(JSON.stringify({ ...evaluated.result.value, screenshot: OUT }, null, 2));
} catch (error) {
  console.error('ตรวจหน้าเว็บไม่สำเร็จ:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client?.close();
  chrome.kill('SIGKILL');
}

#!/usr/bin/env node
/**
 * inspect-item-tabs.mjs — ตรวจ UI จริงด้วย Chrome (Phase 43)
 *
 * ผู้ใช้สั่ง 2026-10-04: "Workshop แยกเมนู Craft กับ Upgrade · ในกระเป๋าก็แยก Item ·
 *   การตีบวก คือเอาของที่มี 1 ชิ้น ไปตีบวก ของชิ้นนั้นได้บวก ไม่ใช่ทั้งกอง"
 *
 * ตรวจอะไร (เบราว์เซอร์จริง · จอ 390×740):
 *   1) /items มี 2 แท็บ (🧪 คราฟต์ / 🛠 ตีบวก) และเริ่มที่แท็บคราฟต์
 *   2) กดแท็บ "ตีบวก" → เห็นกองของแยกแถวตามระดับ (+0 กับ +2 คนละแถว) + ปุ่มตีบวกระบุระดับ
 *   3) กดปุ่มตีบวก → โมดัลบอก "ใช้ของ 1 ชิ้น" และปุ่มยืนยันพร้อม
 *   4) /inventory → ไอเทมช่างแยกเป็น 2 แถวตามระดับ + ปุ่มขายผูกกับระดับของกอง
 *
 * วิธีใช้: node scripts/inspect-item-tabs.mjs            (สมัครผู้เล่นทดสอบให้เอง + ลบเมื่อจบ)
 *          node scripts/inspect-item-tabs.mjs --keep
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

try {
  const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const rawLine of envText.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
} catch {
  // ไม่มี .env → ใช้ environment ปัจจุบัน
}

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.split('=')[1] ?? 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '9371');
const KEEP = process.argv.includes('--keep');
const WIDTH = 390;
const HEIGHT = 740;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

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

const suffix = Date.now().toString().slice(-7);
let prisma = null;
let userId = null;

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  prisma = new PrismaClient();

  // ---- ผู้เล่นทดสอบ: ของ 2 กอง (+0 ×3 · +2 ×1) ----
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `t43_${suffix}`,
      email: `t43_${suffix}@example.com`,
      password: 'Test12345!',
      displayName: 'Phase43 UI Tester',
    }),
  });
  const regJson = await reg.json();
  if (!reg.ok || !regJson?.success) throw new Error(`สมัครไม่สำเร็จ: ${JSON.stringify(regJson)}`);
  userId = regJson.data.user.id;
  const cookieHeader = (reg.headers.get('set-cookie') ?? '').split(';')[0];
  const token = cookieHeader.replace(/^rda_session=/, '');

  const item = await prisma.itemDefinition.findUnique({ where: { code: 'ATK_WHETSTONE' } });
  await prisma.user.update({ where: { id: userId }, data: { veilShards: 5000 } });
  await prisma.wallet.update({ where: { userId }, data: { balance: 500000 } });
  await prisma.userInventoryItem.createMany({
    data: [
      { userId, itemType: 'CRAFTING_DUST', code: 'CRAFTING_DUST', nameTh: 'ฝุ่นเวท', quantity: 5000, source: 'PHASE43_UI' },
      { userId, itemType: 'ENHANCE_JEWEL', code: 'JEWELRY', nameTh: 'Jewelry', quantity: 50, source: 'PHASE43_UI' },
    ],
  });
  await prisma.userItem.createMany({
    data: [
      { userId, itemId: item.id, quantity: 3, enhanceLevel: 0 },
      { userId, itemId: item.id, quantity: 1, enhanceLevel: 2 },
    ],
  });
  // ---- เปิด Chrome headless ----
  const chrome = spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=/tmp/rda-item-tabs-${PORT}`,
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
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true });
    await send('Network.setCookie', { name: 'rda_session', value: token, domain: 'localhost', path: '/' });
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.setItem('rda_onboarded_${userId}', new Date().toISOString()); } catch (e) {}`,
    });

    const evalIn = async (expression) =>
      (await send('Runtime.evaluate', { returnByValue: true, expression, awaitPromise: true })).result?.value;

    const goto = async (path, waitMs = 2200) => {
      events.length = 0;
      await send('Page.navigate', { url: `${BASE}${path}` });
      for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await sleep(100);
      await sleep(waitMs);
    };

    // ---- 1) แท็บของร้านช่าง ----
    await goto('/items');
    const tabs = await evalIn(`(() => {
      const craft = document.querySelector('[data-item-tab="craft"]');
      const upgrade = document.querySelector('[data-item-tab="upgrade"]');
      const cards = [...document.querySelectorAll('[data-item-card]')];
      const stone = document.querySelector('[data-item-card="ATK_WHETSTONE"]');
      return {
        craft: Boolean(craft),
        upgrade: Boolean(upgrade),
        craftSelected: craft?.getAttribute('aria-selected'),
        panelVisible: Boolean(document.querySelector('[data-item-upgrade-panel]')),
        cardCount: cards.length,
        levelBadges: cards.reduce((n, el) => n + el.querySelectorAll('[data-item-level]').length, 0),
        chipRows: document.querySelectorAll('[data-item-stack-chips]').length,
        upgradeButtons: document.querySelectorAll('[data-item-go-upgrade]').length,
        whstoneText: stone ? stone.innerText.replace(/\\s+/g, ' ').trim() : '',
      };
    })()`);
    check(
      'หน้า /items มี 2 เมนู: 🧪 คราฟต์ + 🛠 ตีบวก (เริ่มที่คราฟต์)',
      Boolean(tabs?.craft && tabs?.upgrade && tabs.craftSelected === 'true' && tabs.panelVisible === false),
      JSON.stringify({ craft: tabs?.craft, upgrade: tabs?.upgrade, selected: tabs?.craftSelected })
    );
    check(
      'แท็บคราฟต์ล้วน: ไม่มีป้าย +N / ชิปกอง / ปุ่มตีบวก (ผู้ใช้สั่ง 2026-10-05)',
      tabs?.cardCount > 0 &&
        tabs?.levelBadges === 0 &&
        tabs?.chipRows === 0 &&
        tabs?.upgradeButtons === 0,
      `การ์ด=${tabs?.cardCount} · ป้าย+N=${tabs?.levelBadges} · ชิปกอง=${tabs?.chipRows} · ปุ่มตีบวก=${tabs?.upgradeButtons}`
    );
    check(
      'การ์ดหินลับคมในแท็บคราฟต์โชว์ค่าพื้นฐาน (+6 ATK) ไม่ใช่ระดับกองที่ตีบวก',
      /\+6 ATK/.test(tabs?.whstoneText ?? '') && !/\+1/.test(tabs?.whstoneText ?? ''),
      `ข้อความ="${tabs?.whstoneText}"`
    );

    // ---- 2) กดแท็บตีบวก → เห็นกองแยกแถวตามระดับ ----
    await evalIn(`document.querySelector('[data-item-tab="upgrade"]')?.click()`);
    await sleep(700);
    const panel = await evalIn(`(() => {
      const rows = [...document.querySelectorAll('[data-item-stack]')];
      const levels = rows.map((el) => Number(el.getAttribute('data-item-stack-level')));
      const labels = rows.map((el) => el.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60));
      return {
        count: rows.length,
        levels,
        labels,
        craftCards: document.querySelectorAll('[data-item-card]').length,
      };
    })()`);
    check(
      'กดแท็บตีบวกแล้วของแยกเป็นกองตามระดับ (+0 และ +2 คนละแถว)',
      panel?.count >= 2 && panel.levels.includes(0) && panel.levels.includes(2) && panel.craftCards === 0,
      `กอง=${JSON.stringify(panel?.levels)} · ตัวอย่าง="${panel?.labels?.[0] ?? ''}"`
    );

    // ---- 3) กดปุ่มตีบวกของกอง +0 → โมดัลบอกว่าใช้ 1 ชิ้น ----
    await evalIn(
      `document.querySelector('[data-item-enhance="ATK_WHETSTONE"][data-item-enhance-level="0"]')?.click()`
    );
    await sleep(600);
    const modal = await evalIn(`(() => {
      const panelEl = document.querySelector('[data-enhance-panel]');
      const go = document.querySelector('[data-enhance-go]');
      return {
        open: Boolean(panelEl),
        text: panelEl ? panelEl.innerText.replace(/\\s+/g, ' ').trim() : '',
        goEnabled: go ? !go.disabled : false,
        goLabel: go ? go.innerText.trim() : '',
      };
    })()`);
    check(
      'โมดัลตีบวกบอก "ใช้ของ 1 ชิ้น" (ไม่ใช่ทั้งกอง) + ปุ่มยืนยันพร้อม',
      Boolean(modal?.open) && /1 ชิ้น/.test(modal.text) && modal.goEnabled === true,
      `ปุ่ม="${modal?.goLabel}"`
    );

    // ---- 4) กระเป๋า: ไอเทมช่างแยกตามระดับ + ปุ่มขายผูกกับระดับ ----
    await goto('/inventory');
    const bag = await evalIn(`(() => {
      const rows = [...document.querySelectorAll('[data-bag-item-level]')];
      return {
        count: rows.length,
        levels: rows.map((el) => Number(el.getAttribute('data-bag-item-level'))),
        sellLevels: [...document.querySelectorAll('[data-bag-sell-level]')].map((el) =>
          Number(el.getAttribute('data-bag-sell-level'))
        ),
      };
    })()`);
    check(
      'กระเป๋าแยก Item เป็นกองตามระดับ + ปุ่มขายของกองนั้น',
      bag?.count >= 2 && bag.levels.includes(0) && bag.levels.includes(2) && bag.sellLevels.includes(0),
      `แถว=${JSON.stringify(bag?.levels)} · ขายระดับ=${JSON.stringify(bag?.sellLevels)}`
    );

    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${failed === 0 ? '🎉' : '⚠️'} ผ่าน ${results.length - failed}/${results.length} ข้อ`);
    if (!KEEP) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
      console.log('🧹 ลบผู้เล่นทดสอบแล้ว');
    }
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch(async (error) => {
  console.error('❌ ตรวจ UI ไม่สำเร็จ:', error);
  if (prisma) {
    if (userId && !KEEP) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * ตรวจ "หน้าสนามรบแบบใหม่" บนหน้าเว็บจริงด้วย Chrome (CDP)
 * — ไม่ใช่ดูโค้ด แต่เปิดหน้าจริงพร้อม session แล้ววัดค่าที่เรนเดอร์จริง:
 *
 *   1) การ์ด 10 ใบเรียงบน 5 (คู่ต่อสู้) / ล่าง 5 (เรา)
 *   2) การ์ดทุกใบมี HP/MP
 *   3) การ์ดแสดงเต็มใบ — กรอบการ์ดครบทุกใบ + จำนวนรูปจริงตรงกับ cardMeta จาก API + สูงพอเห็นรูป
 *   4) ชื่อทีม = ชื่อ Deck จริง (ไม่ใช่ "ทีม A / ทีม B")
 *   5) ปุ่มข้ามไม่มีคำว่า "รู้ผล"
 *   6) เฟรมสุดท้ายมีดาบ (คนโจมตี) + โล่/แดง (คนรับ)
 *   7) ไอคอนดาบ/โล่อยู่กลางการ์ด (ไม่ตกขอบการ์ด)
 *   8) จบศึกแล้วมีปุ่ม "ดู Replay" + "ต่อสู้อีกครั้ง"
 *   9) HP รวมตรงกับผลรวม HP การ์ด
 *  10) log ใหม่สุดอยู่บน (order มาก→น้อย)
 *  11) ไอคอนสถานะ (🔥 เผา · 💧 อ่อนแอ · 🛡️ โล่ · ⚡ ว่องไว) ตรงกับข้อมูลบนการ์ด
 *  12) ไม่ถูก onboarding modal บังภาพ (ภาพที่ได้ใช้รีวิวได้จริง)
 *
 * วิธีใช้:
 *   node scripts/inspect-battle-field.mjs --token "<session>" --battle <battleId>
 *   node scripts/inspect-battle-field.mjs --token "<session>" --battle <battleId> --out public/_shots/battle-field.png
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const BATTLE = arg('--battle', '');
const BASE = arg('--base', 'http://localhost:3000');
const PORT = Number(arg('--port', '9348'));
const OUT = arg('--out', 'public/_shots/battle-field.png');
const WIDTH = Number(arg('--width', '1280'));
const HEIGHT = Number(arg('--height', '1800'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** อ่านค่าที่ต้องตรวจจากหน้าเว็บ (รันใน browser) */
const MEASURE = `(() => {
  const cards = [...document.querySelectorAll('[data-battle-card]')].map((el) => {
    const box = el.getBoundingClientRect();
    return {
      id: el.getAttribute('data-battle-card'),
      attacker: el.getAttribute('data-battle-attacker') === 'true',
      defender: el.getAttribute('data-battle-defender') === 'true',
      hp: Number(el.getAttribute('data-battle-hp')),
      mp: Number(el.getAttribute('data-battle-mp')),
      status: el.getAttribute('data-battle-status') || '',
      statusBadges: el.querySelectorAll('[data-battle-status-badge]').length,
      hit: Boolean(el.querySelector('[data-battle-hit]')),
      /** สัญลักษณ์ดาบ/โล่ กลางการ์ด — ตำแหน่งต้องอยู่ในการ์ดและใกล้กลาง */
      marker: (() => {
        const m = el.querySelector('[data-battle-marker]');
        if (!m) return null;
        const inner = m.firstElementChild ?? m;
        const r = inner.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const mx = r.left + r.width / 2;
        const my = r.top + r.height / 2;
        return {
          kind: m.getAttribute('data-battle-marker'),
          inside: r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom,
          offsetX: Math.round(Math.abs(mx - cx)),
          offsetY: Math.round(Math.abs(my - cy)),
        };
      })(),
      /** มีรูปการ์ดจริงในช่องภาพไหม (ผู้ใช้สั่ง: ต้องแสดงการ์ดเต็มใบ) */
      art: el.querySelectorAll('img[src*="/art"]').length,
      /** มีกรอบการ์ด (overlay ของ CardFace) ไหม */
      frame: el.querySelectorAll('img[src*="/image"]').length,
      w: Math.round(box.width),
      h: Math.round(box.height),
      cy: Math.round(box.top + box.height / 2),
    };
  });
  const teamHp = [...document.querySelectorAll('[data-team-hp]')].map((el) => ({
    side: el.getAttribute('data-team-hp'),
    text: (el.textContent || '').trim(),
  }));
  const teamNames = [...document.querySelectorAll('[data-team-name]')].map((el) => ({
    side: el.getAttribute('data-team-name'),
    text: (el.textContent || '').trim(),
  }));
  const logOrders = [...document.querySelectorAll('[data-log-order]')].map((el) =>
    Number(el.getAttribute('data-log-order'))
  );
  const finished = Boolean(document.querySelector('[data-battle-finished]'));
  const replayBtn = (() => {
    const el = document.querySelector('[data-battle-replay]');
    return el ? (el.textContent || '').trim() : '';
  })();
  const refightBtn = (() => {
    const el = document.querySelector('[data-battle-refight]');
    return el ? { label: (el.textContent || '').trim(), disabled: el.disabled === true } : null;
  })();
  const skipLabel = (() => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ข้าม'));
    return btn ? (btn.textContent || '').trim() : '';
  })();
  return { path: location.pathname, cards, teamHp, teamNames, logOrders, skipLabel, finished, replayBtn, refightBtn };
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

const url = `${BASE}/battle/${BATTLE}`;
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

  // จำลอง "ผู้เล่นเดิม" ก่อนโหลด: headless = localStorage ว่าง → provider คิดว่าเป็นผู้เล่นใหม่ทุกครั้ง
  // (ผู้ใช้จริงเจอครั้งเดียว) — ตั้งธง localStorage ก่อน page โหลด
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

  const DIALOG_CLOSE = `(() => {
    // ปิด onboarding modal (หาด้วย data-onboarding-modal — เดิมใช้ selector escape class z-[100] ทำให้ฝั่ง Chrome ได้ selector ไม่ถูกต้อง → SyntaxError แล้วเงียบ → modal บังภาพทุกรอบ)
    const modal = document.querySelector('[data-onboarding-modal]');
    if (!modal) return 'gone';
    for (let i = 0; i < 6; i += 1) {
      const btns = [...modal.querySelectorAll('button')];
      const x = btns.find((b) => (b.textContent || '').includes('ข้าม'));
      if (x) { x.click(); return 'dismiss'; }
      const next = btns.find((b) => (b.textContent || '').trim() === 'ต่อไป' || (b.textContent || '').includes('เริ่มเล่น'));
      if (next) { next.click(); continue; }
      break;
    }
    return 'stuck';
  })()`;
  // ── ปิด onboarding modal + ตรวจซ้ำว่าหายจริง (กันภาพถูก modal บังอีก)
  let dialogState = 'unknown';
  for (let i = 0; i < 6; i += 1) {
    dialogState = (await send('Runtime.evaluate', { returnByValue: true, expression: DIALOG_CLOSE })).result?.value;
    await sleep(350);
    if (dialogState === 'gone') break;
  }
  const modalLeft = Boolean(
    (await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `Boolean(document.querySelector('[data-onboarding-modal]'))`,
    })).result?.value
  );

  // ── วัดเฟรม "กลางรบ" (ต้องมีดาบ/โล่): เริ่มใหม่ → เล่นที่ x1 ~2.5 วิ (~2-3 เหตุการณ์) → วัดทันที
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = [...document.querySelectorAll('button')];
      const restart = btns.find((b) => (b.textContent || '').includes('เริ่มใหม่'));
      if (restart) restart.click();
      const x1 = btns.find((b) => (b.textContent || '').trim() === 'x1');
      if (x1) x1.click();
      const play = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('เริ่มเล่น') || (b.textContent || '').includes('เล่นต่อ'));
      if (play) play.click();
      return true;
    })()`,
  });
  await sleep(2500);
  const mid = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;

  // เก็บภาพ "กลางรบ" ด้วย (มีดาบ/โล่ให้ดูว่าไอคอนอยู่กลางการ์ดจริง) — ภาพสุดท้ายคือตอนจบศึก
  if (mid?.cards?.some((c) => c.marker)) {
    const midShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: WIDTH, height: Math.min(HEIGHT, 5000), scale: 1 },
    });
    writeFileSync(OUT.replace(/\.png$/i, '-mid.png'), Buffer.from(midShot.data, 'base64'));
  }

  // ── แล้วกดข้าม (รู้ผลเลย) → เฟรมสุดท้าย + log ครบ แล้ววัด
  await send('Runtime.evaluate', {
    expression: `(() => {
      const skip = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('ข้าม'));
      if (skip) { skip.click(); return 'skip'; }
      return 'none';
    })()`,
  });
  await sleep(1200);

  const after = (await send('Runtime.evaluate', { returnByValue: true, expression: MEASURE })).result.value;
  if (!after?.cards?.length) throw new Error('ไม่พบการ์ดบนหน้า — ตรวจ session/battle id');

  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height: Math.min(HEIGHT, 5000), scale: 1 },
  });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // ===== สรุปผล =====
  const checks = [];
  // บน-ล่าง: 5 ใบบน = คู่ต่อสู้, 5 ใบล่าง = เรา (เทียบ cy)
  const sorted = [...after.cards].sort((a, b) => a.cy - b.cy);
  const rowGap = sorted.length === 10 ? sorted[5].cy - sorted[4].cy : 0;
  checks.push([
    'การ์ด 10 ใบเรียงบน 5 (คู่ต่อสู้) / ล่าง 5 (เรา)',
    after.cards.length === 10 && rowGap > 30,
    `${after.cards.length} ใบ · ช่องว่างระหว่างแถว ${Math.round(rowGap)}px`,
  ]);

  checks.push([
    'การ์ดทุกใบมี HP/MP',
    after.cards.length > 0 && after.cards.every((c) => Number.isFinite(c.hp) && Number.isFinite(c.mp)),
    after.cards.map((c) => `${c.hp}/${c.mp}`).join(' '),
  ]);

  // ผู้ใช้สั่ง: "แสดงรูปการ์ดแบบเต็ม" → ต้องมีการ์ดเต็มใบ (กรอบการ์ด + รูปจริง) ขนาดที่เห็นรูปได้
  // เทียบกับข้อมูลจริงจาก API: การ์ดที่มี imageUrl จริงกี่ใบ → ต้องเห็นรูปบนหน้าจอเท่านั้น
  let expectedArt = -1;
  try {
    const apiRes = await fetch(`${BASE}/api/battle/${BATTLE}/log`, {
      headers: TOKEN ? { cookie: `rda_session=${TOKEN}` } : {},
    });
    const apiData = await apiRes.json();
    const teams = apiData?.data?.battleData?.teams ?? {};
    const meta = apiData?.data?.cardMeta ?? {};
    const ids = [...new Set([...(teams.A ?? []), ...(teams.B ?? [])].map((c) => c.cardId))];
    expectedArt = ids.filter((id) => {
      const url = meta[id]?.imageUrl;
      return Boolean(url) && !String(url).includes('/image');
    }).length;
  } catch (error) {
    console.error('อ่าน cardMeta จาก API ไม่ได้:', error instanceof Error ? error.message : error);
  }
  const withFrame = after.cards.filter((c) => c.frame > 0).length;
  const withArt = after.cards.filter((c) => c.art > 0).length;
  const minH = after.cards.length ? Math.min(...after.cards.map((c) => c.h)) : 0;
  checks.push([
    'การ์ดแสดงเต็มใบ (กรอบการ์ดครบทุกใบ + รูปจริงตรงกับข้อมูล + สูงพอเห็นรูป)',
    after.cards.length > 0 &&
      withFrame === after.cards.length &&
      minH >= 120 &&
      expectedArt >= 1 &&
      withArt === expectedArt,
    `กรอบ ${withFrame}/${after.cards.length} · รูปจริงบนจอ ${withArt} (API บอก ${expectedArt < 0 ? '?' : expectedArt}) · สูงต่ำสุด ${minH}px`,
  ]);

  // ผู้ใช้สั่ง: "ชื่อทีม ใส่ชื่อ Deck ไปเลย" → ป้ายชื่อทีมต้องเป็นชื่อ Deck จริง ไม่ใช่ ทีม A/ทีม B
  const genericNames = ['ทีม A', 'ทีม B', 'ทีมของฉัน', 'คู่ต่อสู้'];
  const names = after.teamNames ?? [];
  checks.push([
    'ชื่อทีมเป็นชื่อ Deck จริง (ไม่ใช่ "ทีม A/ทีม B")',
    names.length === 2 &&
      names.every((n) => n.text.length > 0 && !genericNames.includes(n.text)),
    names.map((n) => `${n.side}=${n.text}`).join(' · ') || '(ไม่พบป้ายชื่อทีม)',
  ]);

  // ผู้ใช้สั่ง: ปุ่มข้ามต้องไม่มีคำว่า "รู้ผล"
  checks.push([
    'ปุ่มข้ามไม่มีคำว่า "รู้ผล"',
    Boolean(after.skipLabel) && !after.skipLabel.includes('รู้ผล'),
    `ป้ายปุ่ม = "${after.skipLabel}"`,
  ]);

  const atkCount = mid.cards.filter((c) => c.attacker).length;
  const defCount = mid.cards.filter((c) => c.defender).length;
  const hitCount = mid.cards.filter((c) => c.hit).length;
  checks.push([
    'กลางรบมีดาบ (คนโจมตี) + โล่/แดง (คนรับ)',
    atkCount >= 1 && defCount >= 1 && hitCount >= 1,
    `⚔️ ${atkCount} · 🛡️ ${defCount} · แดง ${hitCount}`,
  ]);

  // ผู้ใช้สั่ง: "สัญลักษณ์ดาบกับโล่ ตอนต่อสู้เอามาไว้ตรงกลางเลย ไว้มุม มันตกขอบ"
  // วัด "กลางรบ" (เฟรมที่มีคนโจมตี/คนรับจริง) — เฟรมสุดท้ายมักเป็น faint จึงไม่มีสัญลักษณ์
  const markers = mid.cards.filter((c) => c.marker);
  const markersOk = markers.every(
    (c) => c.marker.inside && c.marker.offsetX <= c.w * 0.15 && c.marker.offsetY <= c.h * 0.25
  );
  checks.push([
    'ไอคอนดาบ/โล่อยู่กลางการ์ด (ไม่ตกขอบการ์ด)',
    markers.length >= 1 && markersOk,
    markers.length
      ? markers
          .map((c) => `${c.marker.kind}ในกรอบ=${c.marker.inside} เยื้อง(${c.marker.offsetX},${c.marker.offsetY})px`)
          .join(' · ')
      : 'เฟรมสุดท้ายไม่มีคนโจมตี/คนรับ',
  ]);

  // ผู้ใช้สั่ง: "การต่อสู้ผ่านไปแล้ว สามารถกดดู Replay หรือต่อสู้ใหม่ได้"
  checks.push([
    'จบศึกแล้วมีปุ่ม "ดู Replay" + "ต่อสู้อีกครั้ง"',
    after.finished && after.replayBtn.includes('Replay') && Boolean(after.refightBtn?.label.includes('ต่อสู้อีกครั้ง')),
    `finished=${after.finished} · replay="${after.replayBtn}" · refight="${after.refightBtn?.label ?? '-'}" (disabled=${after.refightBtn?.disabled ?? '-'})`,
  ]);

  // HP รวมตรงกับผลรวมการ์ด ("1,724/3,500" → ตัวเลขก่อน /)
  const num = (t) => Number((String(t).split('/')[0] || '').replace(/[^0-9]/g, ''));
  const sumHp = after.cards.reduce((s, c) => s + c.hp, 0);
  const shownSum = after.teamHp.reduce((s, t) => s + num(t.text), 0);
  checks.push([
    'HP รวม = ผลรวม HP การ์ดทั้ง 10 ใบ',
    after.teamHp.length === 2 && sumHp === shownSum,
    `การ์ดรวม ${sumHp} vs แถบรวม ${shownSum}`,
  ]);

  const orders = after.logOrders;
  const desc = orders.length > 1 && orders.every((v, i) => (i === 0 ? true : orders[i - 1] > v));
  checks.push([
    'log ใหม่สุดอยู่บน (order มาก→น้อย)',
    orders.length > 0 && desc,
    orders.slice(0, 5).join(',') + (orders.length > 5 ? '…' : ''),
  ]);

  // ไอคอนสถานะ (เผา/อ่อนแอ/โล่/ว่องไว) ต้องตรงกับข้อมูลบนการ์ดเป๊ะ ไม่เกิน/ไม่ขาด
  const statusMismatch = after.cards.filter((c) => Boolean(c.status) !== c.statusBadges > 0);
  const statusCards = after.cards.filter((c) => c.status);
  checks.push([
    'ไอคอนสถานะตรงกับข้อมูลการ์ด (มีข้อมูล = มีไอคอน)',
    statusMismatch.length === 0,
    statusCards.length
      ? statusCards.map((c) => `${c.status}=${c.statusBadges}`).join(' ')
      : `ยังไม่มีใบติดสถานะในเฟรมสุดท้าย (เฟรมกลางรบ: ${mid.cards.filter((c) => c.status).length} ใบ)`,
  ]);

  checks.push([
    'ไม่มี onboarding modal บังหน้าสนามรบ (ภาพใช้รีวิวได้)',
    !modalLeft,
    `สถานะ modal = ${dialogState}`,
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

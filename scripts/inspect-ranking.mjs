#!/usr/bin/env node
/**
 * inspect-ranking.mjs — ตรวจ "ตาราง Ranking ผู้เล่น" (Phase 28)
 *
 * ผู้ใช้สั่ง 2026-09-27: "ทำตาราง Ranking ผู้เล่น ให้ด้วย"
 *
 * ตรวจอะไร (ยิง API จริง + เบราว์เซอร์จริง):
 *   1) ทั้ง 5 หมวด (พลังทีม/สะสมการ์ด/ชนะศึก/กิจกรรม/Coin) คืนข้อมูลได้
 *   2) กติกาอันดับถูกต้อง: เรียงจากมากไปน้อย · ค่าเท่ากันได้อันดับเท่ากัน · อันดับไม่กระโดดผิด
 *   3) "อันดับของฉัน" ตรงกับตำแหน่งจริงในตาราง (ค่าเท่ากับค่าในตาราง/ค่าที่ API ส่งมา)
 *   4) เบราว์เซอร์: หน้ามี 5 แท็บ · ตารางมีแถวจริง · แถวของฉันถูกไฮไลต์ · สลับแท็บได้
 *
 * วิธีใช้
 *   node scripts/inspect-ranking.mjs             # สมัครผู้เล่นทดสอบ + สร้างเด็คให้เอง
 *   node scripts/inspect-ranking.mjs --token "<rda_session>"
 *   ตัวเลือก: --base http://localhost:3000 · --port 9431 · --out /tmp/x.png
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '');
const PORT = Number(arg('--port', '9431'));
const TOKEN_ARG = arg('--token', '');
const OUT = arg('--out', '/tmp/ranking-check.png');

const CATEGORIES = ['power', 'collection', 'wins', 'event', 'coin'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push({ check: name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function api(method, path, { body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return { status: res.status, json, setCookies };
}

const cookieFrom = (setCookies) => {
  const pairs = setCookies.map((c) => c.split(';')[0]);
  return pairs.find((p) => p.startsWith('rda_session=')) ?? '';
};

/** อันดับที่ควรเป็นตามกติกา "ค่าเท่ากัน = อันดับเท่ากัน" (1,2,2,4) */
function expectedRanks(values) {
  const ranks = [];
  let prev = null;
  let prevRank = 0;
  values.forEach((value, index) => {
    if (prev !== null && value === prev) {
      ranks.push(prevRank);
      return;
    }
    prevRank = index + 1;
    prev = value;
    ranks.push(prevRank);
  });
  return ranks;
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
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
  return { send, close: () => socket.close() };
}

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--user-data-dir=/tmp/rda-ranking-${PORT}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1360,900',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let client = null;
try {
  // ---- 1) session ผู้เล่นทดสอบ (+ สร้างเด็ค/ต่อสู้ให้มีข้อมูลในหลายหมวด) ----
  let cookie = TOKEN_ARG;
  let username = '(จาก --token)';
  if (!cookie) {
    username = `rnk_${Date.now().toString(36)}`.slice(0, 20);
    const registered = await api('POST', '/api/auth/register', {
      body: {
        username,
        email: `${username}@example.com`,
        password: 'E2ePassw0rd!',
        displayName: 'Ranking Check',
      },
    });
    if (registered.status !== 201) {
      throw new Error(`สมัครไม่ผ่าน (HTTP ${registered.status}) ${JSON.stringify(registered.json)}`);
    }
    cookie = cookieFrom(registered.setCookies);

    const cards = (await api('GET', '/api/cards?limit=100', { cookie })).json?.data ?? [];
    const deck = await api('POST', '/api/decks/quick-add', { cookie, body: { cardId: cards[0]?.cardId } });
    const deckId = deck.json?.data?.deckId ?? null;
    if (deckId) {
      await api('POST', '/api/battle/simulate', { cookie, body: { attackerDeckId: deckId, bot: true } });
    }
  }
  const meRes = await api('GET', '/api/auth/me', { cookie });
  const myId = meRes.json?.data?.user?.id ?? null;
  console.log(`👤 ผู้เล่นทดสอบ: ${username} · userId ${myId ?? '-'}`);

  // ---- 2) ทุกหมวดต้องคืนข้อมูล + กติกาอันดับถูกต้อง ----
  for (const category of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    const board = await api('GET', `/api/ranking?category=${category}&limit=50`, { cookie });
    const data = board.json?.data;
    const entries = data?.entries ?? [];
    const values = entries.map((row) => row.value);
    const sortedDesc = values.every((value, index) => index === 0 || values[index - 1] >= value);
    const ranksOk = JSON.stringify(entries.map((row) => row.rank)) === JSON.stringify(expectedRanks(values));
    const monotonic = entries.every((row, index) => index === 0 || entries[index - 1].rank <= row.rank);
    const categoriesOk = (data?.categories ?? []).length === CATEGORIES.length;

    check(
      `หมวด ${category}: เรียงมาก→น้อย · อันดับตามกติกา · คืนครบ 5 หมวด`,
      board.status === 200 && sortedDesc && ranksOk && monotonic && categoriesOk,
      `entries=${entries.length} · total=${data?.total} · sorted=${sortedDesc} · ranks=${ranksOk}`
    );
  }

  // ---- 3) "อันดับของฉัน" ตรงกับข้อมูลจริง ----
  const powerBoard = (await api('GET', '/api/ranking?category=power&limit=50', { cookie })).json?.data;
  check(
    'หมวดพลังทีม: มีอันดับของฉัน (ผู้เล่นมีเด็ค)',
    Boolean(powerBoard?.me) && powerBoard.me.value > 0 && powerBoard.me.rank >= 1,
    JSON.stringify(powerBoard?.me)
  );

  const collectionBoard = (await api('GET', '/api/ranking?category=collection&limit=50', { cookie })).json?.data;
  const myCollectionRow = (collectionBoard?.entries ?? []).find((row) => row.isMe);
  check(
    'หมวดสะสมการ์ด: แถวของฉัน isMe และค่า/อันดับตรงกับ me',
    Boolean(myCollectionRow) &&
      myCollectionRow.value === collectionBoard?.me?.value &&
      myCollectionRow.rank === collectionBoard?.me?.rank,
    `row#${myCollectionRow?.rank} = ${myCollectionRow?.value} · me=#${collectionBoard?.me?.rank}`
  );

  const counts = [];
  for (const category of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    const board = await api('GET', `/api/ranking?category=${category}`, { cookie });
    counts.push({ category, total: board.json?.data?.total ?? 0 });
  }
  check(
    'ทุกหมวดมีผู้เล่นถูกจัดอันดับอย่างน้อย 1 คน',
    counts.every((row) => row.total >= 1),
    counts.map((row) => `${row.category}=${row.total}`).join(' · ')
  );

  const anon = await api('GET', '/api/ranking?category=coin');
  check(
    'ดูได้โดยไม่ต้องล็อกอิน (me = null · signedIn = false)',
    anon.status === 200 && anon.json?.data?.me === null && anon.json?.data?.signedIn === false,
    `entries=${(anon.json?.data?.entries ?? []).length}`
  );

  // ---- 4) เบราว์เซอร์จริง ----
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
  await send('Network.enable');
  await send('Network.setCookie', {
    name: 'rda_session',
    value: cookie.replace('rda_session=', ''),
    domain: 'localhost',
    path: '/',
  });
  await send('Page.navigate', { url: `${BASE}/ranking` });
  await sleep(4500);

  const evaluate = async (expression, awaitPromise = false) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result?.value;

  const dom = await evaluate(`(() => ({
    tabs: [...document.querySelectorAll('[data-ranking-tab]')].map((el) => el.getAttribute('data-ranking-tab')),
    rows: document.querySelectorAll('[data-ranking-row]').length,
    myRows: document.querySelectorAll('[data-ranking-row-me="true"]').length,
    myRank: document.querySelector('[data-my-rank]')?.getAttribute('data-my-rank') ?? null,
    hasTable: Boolean(document.querySelector('[data-ranking-table]')),
    h1: document.querySelector('h1')?.textContent?.trim() ?? null,
  }))()`);
  check('หน้า /ranking มี 5 แท็บครบ', (dom?.tabs ?? []).length === 5, JSON.stringify(dom?.tabs));
  check('ตารางมีแถวจริง', dom?.hasTable === true && (dom?.rows ?? 0) > 0, `rows=${dom?.rows}`);
  check('แถวของฉันถูกไฮไลต์ 1 แถว', dom?.myRows === 1, `myRows=${dom?.myRows}`);
  check(
    'ตัวเลขอันดับของฉันบนหน้าเว็บตรงกับ API',
    String(dom?.myRank ?? '') === String(powerBoard?.me?.rank ?? ''),
    `เว็บ=#${dom?.myRank} · API=#${powerBoard?.me?.rank}`
  );
  check('หัวข้อหน้าเป็นตารางจัดอันดับ', String(dom?.h1 ?? '').includes('🏆'), String(dom?.h1));

  const tabFlow = await evaluate(
    `(async () => {
      const out = [];
      for (const key of ['collection', 'wins', 'event', 'coin']) {
        const tab = document.querySelector('[data-ranking-tab="' + key + '"]');
        if (!tab) { out.push({ key, ok: false, rows: 0 }); continue; }
        tab.click();
        await new Promise((r) => setTimeout(r, 1300));
        out.push({ key, ok: true, rows: document.querySelectorAll('[data-ranking-row]').length });
      }
      return out;
    })()`,
    true
  );
  check(
    'สลับแท็บทั้ง 4 หมวดที่เหลือได้ (ตารางยังมีข้อมูล)',
    Array.isArray(tabFlow) && tabFlow.every((row) => row.ok && row.rows > 0),
    JSON.stringify(tabFlow)
  );

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`📸 ภาพหน้าจอ: ${OUT}`);
} catch (error) {
  check('สคริปต์ทำงานได้ครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  client?.close();
  chrome.kill('SIGKILL');
}

console.log('\n' + '='.repeat(60));
console.log(`สรุป: ผ่าน ${results.filter((r) => r.ok).length}/${results.length} ข้อ`);
if (failed > 0) {
  console.log('ข้อที่ไม่ผ่าน:');
  for (const row of results.filter((r) => !r.ok)) console.log(`  - ${row.check}: ${row.detail}`);
  process.exitCode = 1;
}


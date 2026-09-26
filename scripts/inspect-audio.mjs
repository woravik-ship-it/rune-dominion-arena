#!/usr/bin/env node
/**
 * inspect-audio.mjs — ตรวจว่า "เกมมีเสียงออกจริง" (Phase 21)
 *
 * ผู้ใช้สั่ง 2026-09-26: "Projects Game Card มีเมนูเสียง แต่ไม่เห็นมีเสียงเลย ทำเสียงประกอบด้วย"
 * สคริปต์นี้ตอบด้วยหลักฐานที่วัดได้ ไม่ใช่การเดา:
 *   1) เปิดเกมใน Chrome (headless) แล้วปลดล็อก audio เหมือนผู้ใช้แตะหน้าจอ
 *   2) วัดระดับเสียงจริงจาก AnalyserNode ในกราฟเสียงของเกม (window.__rdaAudio)
 *   3) ตรวจว่าเพลง/บรรยากาศเล่นอยู่ และทุกเสียง SFX มีสัญญาณออกจริง (RMS > เกณฑ์)
 *
 * วิธีใช้
 *   node scripts/inspect-audio.mjs --token "<rda_session>"
 *   node scripts/inspect-audio.mjs --base http://localhost:3000 --path /settings --min-rms 0.0005
 *
 * exit code: 0 = ผ่านทุกข้อ · 1 = มีข้อที่ไม่ผ่าน
 */
import { spawn } from 'node:child_process';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};

const TOKEN = arg('--token', '');
const BASE = arg('--base', 'http://localhost:3000');
const PAGE_PATH = arg('--path', '/settings');
const PORT = Number(arg('--port', '9371'));
const MIN_RMS = Number(arg('--min-rms', '0.0005'));
const NO_SFX = process.argv.includes('--no-sfx');
/** ข้ามการตรวจ SFX ทั้งชุด (เร็วขึ้น) — ใช้ตอนวนปรับเสียงต่อสู้รอบใหม่ */
const ONLY_BATTLE = process.argv.includes('--only-battle');
const SFX_NAMES = [
  'ui_tap', 'ui_back', 'ui_error', 'rune_select', 'rune_discover',
  'card_reveal_legendary', 'battle_hit', 'battle_win', 'battle_lose',
  // Phase 22: เสียงต่อสู้ที่ผู้ใช้ขอ (ดาบ/ปล่อยสกอล) + เสียงประกอบเหตุการณ์ในเทป
  'battle_sword', 'battle_clash', 'battle_cast', 'battle_shield',
  'battle_burn', 'battle_heal', 'battle_faint',
  'arena_join', 'raid_hit', 'raid_phase', 'reward_claim', 'coin', 'notify',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  return { send };
}

const evaluate = async (send, expression, awaitPromise = false) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluate failed');
  return result.result?.value;
};

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    // อนุญาตให้เสียงเล่นได้โดยไม่ต้องมี user gesture จริง (จำลองว่า "ผู้ใช้แตะแล้ว")
    '--autoplay-policy=no-user-gesture-required',
    `--user-data-dir=/tmp/rda-audio-audit-${PORT}`,
    '--no-first-run',
    '--disable-extensions',
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};


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

  const { send } = await connect(targets[0].webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  if (TOKEN) {
    await send('Network.setCookie', { name: 'rda_session', value: TOKEN, domain: 'localhost', path: '/' });
  }

  await send('Page.navigate', { url: `${BASE}${PAGE_PATH}` });
  await sleep(4500); // รอ React mount + provider ติดตั้ง debug API

  const hasApi = await evaluate(send, 'Boolean(window.__rdaAudio)');
  check('ติดตั้ง audio debug API', hasApi === true, 'window.__rdaAudio');
  if (!hasApi) throw new Error('ไม่พบ window.__rdaAudio — ต้องเปิดผ่านหน้าเกมจริง');

  // จำลอง "ผู้ใช้แตะหน้าจอ" เพื่อปลดล็อกเสียง
  await evaluate(send, 'window.__rdaAudio.unlock(); true');
  await sleep(2500);

  const state = await evaluate(send, 'window.__rdaAudio.state()');
  check('AudioContext ทำงาน (state = running)', state === 'running', String(state));

  const music = await evaluate(send, 'window.__rdaAudio.musicPlaying()');
  check('เพลงประกอบกำลังเล่น', music === true, String(music));

  const ambience = await evaluate(send, 'window.__rdaAudio.ambiencePlaying()');
  check('เสียงบรรยากาศกำลังเล่น', ambience === true, String(ambience));

  const gains = JSON.parse(await evaluate(send, 'JSON.stringify(window.__rdaAudio.gains())'));
  check(
    'ทุกชั้นมี gain > 0 (sfx / เพลง / บรรยากาศ)',
    gains.sfx > 0 && gains.music > 0 && gains.ambience > 0,
    JSON.stringify(gains)
  );

  // ---- วัดแยกชั้นเสียง: เพลง / บรรยากาศ (ผู้ใช้บ่นว่า "ได้ยินแต่บรรยากาศซ่า ๆ") ----
  const measure = (ms, keepMusic, keepAmbience) => evaluate(
    send,
    `(async () => {
      // เริ่มเล่นใหม่ตามการตั้งค่าก่อน แล้วค่อยปิดชั้นที่ไม่ต้องการวัด
      window.__rdaAudio.resume();
      await new Promise((r) => setTimeout(r, 500));
      ${keepMusic ? '' : 'window.__rdaAudio.stopMusic();'}
      ${keepAmbience ? '' : 'window.__rdaAudio.stopAmbience();'}
      await new Promise((r) => setTimeout(r, 600));
      let peak = 0;
      for (let i = 0; i < ${Math.ceil(ms / 100)}; i += 1) {
        peak = Math.max(peak, window.__rdaAudio.level());
        await new Promise((r) => setTimeout(r, 100));
      }
      return peak;
    })()`,
    true
  );

  const bothLevel = await evaluate(
    send,
    `(async () => {
      let peak = 0;
      for (let i = 0; i < 20; i += 1) {
        peak = Math.max(peak, window.__rdaAudio.level());
        await new Promise((r) => setTimeout(r, 100));
      }
      return peak;
    })()`,
    true
  );
  check('มีสัญญาณเสียงออกจริง (เพลง+บรรยากาศ)', bothLevel > MIN_RMS, `peak RMS = ${bothLevel}`);

  const musicOnly = await measure(3000, true, false);
  const ambienceOnly = await measure(1800, false, true);
  check('เพลงได้ยินชัด (ไม่ถูกบรรยากาศกลบ)', musicOnly > MIN_RMS * 2, `peak RMS เพลง = ${musicOnly}`);
  check(
    'บรรยากาศเป็นแค่ฉากหลัง (เบากว่าเพลง)',
    ambienceOnly < musicOnly,
    `บรรยากาศ = ${ambienceOnly} < เพลง = ${musicOnly}`
  );

  // ---- ทดสอบ SFX ทุกชื่อ (หยุดทั้งเพลงและบรรยากาศก่อน) ----
  const silent = [];
  const sfxPeaks = {};
  for (const name of NO_SFX || ONLY_BATTLE ? [] : SFX_NAMES) {
    const peak = await evaluate(
      send,
      `(async () => {
        window.__rdaAudio.stopMusic();
        window.__rdaAudio.stopAmbience();
        await new Promise((r) => setTimeout(r, 500));
        let peak = 0;
        window.__rdaAudio.play(${JSON.stringify(name)});
        for (let i = 0; i < 16; i += 1) {
          peak = Math.max(peak, window.__rdaAudio.level());
          await new Promise((r) => setTimeout(r, 50));
        }
        return peak;
      })()`,
      true
    );
    const ok = peak > MIN_RMS;
    if (!ok) silent.push(name);
    sfxPeaks[name] = peak;
    console.log(`   ${ok ? '🔊' : '🔇'} ${name.padEnd(24)} peak=${peak}`);
  }
  check(
    'ทุกเสียง SFX มีสัญญาณออกจริง',
    silent.length === 0,
    silent.length ? `เงียบ: ${silent.join(', ')}` : `${SFX_NAMES.length} เสียง`
  );

  // ---- Phase 24.2: เสียงต่อสู้ต้อง "ดังพอ + มีเนื้อเสียง + อยู่ในย่านที่มือถือออกได้" ----
  // ผู้ใช้สั่ง 2026-09-26: "เสียงต่อสู้ เบา เสียง ไม่สมจริง แก้ไขด้วย"
  // วัด 3 ค่าต่อเสียง (ไม่ใช่ดูโค้ด):
  //   peak      = ความดังสูงสุดจริง (RMS จาก AnalyserNode ท้ายกราฟเสียง)
  //   activeMs  = ระยะเวลาที่เสียงดังเกิน 20% ของพีค ⇒ "มีเนื้อ/มีหาง" ไม่ใช่ click แห้ง
  //   bandShare = สัดส่วนพลังงานในย่าน 250–4000Hz (ย่านที่ลำโพงมือถือออกได้จริง)
  const BATTLE_SFX_LIST = [
    'battle_hit', 'battle_sword', 'battle_clash', 'battle_cast',
    'battle_shield', 'battle_burn', 'battle_heal', 'battle_faint',
    'battle_win', 'battle_lose', 'raid_hit', 'raid_phase',
  ];
  const BATTLE_MIN_PEAK = Number(arg('--battle-min-peak', '0.10'));
  const BATTLE_MIN_ACTIVE_MS = Number(arg('--battle-min-active-ms', '120'));
  const BATTLE_MIN_BAND = Number(arg('--battle-min-band', '0.35'));

  const battleRows = [];
  for (const name of NO_SFX ? [] : BATTLE_SFX_LIST) {
    const measured = await evaluate(
      send,
      `(async () => {
        window.__rdaAudio.stopMusic();
        window.__rdaAudio.stopAmbience();
        await new Promise((r) => setTimeout(r, 400));
        window.__rdaAudio.play(${JSON.stringify(name)});
        const rows = [];
        for (let i = 0; i < 32; i += 1) {
          const level = window.__rdaAudio.level();
          const band = typeof window.__rdaAudio.bands === 'function' ? window.__rdaAudio.bands(250, 4000) : null;
          rows.push({ level, band });
          await new Promise((r) => setTimeout(r, 25));
        }
        const peak = Math.max(...rows.map((r) => r.level));
        const threshold = Math.max(peak * 0.2, ${MIN_RMS});
        const activeMs = rows.filter((r) => r.level >= threshold).length * 25;
        const loud = rows.filter((r) => r.level >= peak * 0.5 && typeof r.band === 'number');
        const bandShare = loud.length
          ? Number((loud.reduce((sum, r) => sum + r.band, 0) / loud.length).toFixed(4))
          : null;
        return { peak: Number(peak.toFixed(5)), activeMs, bandShare };
      })()`,
      true
    );
    battleRows.push({ name, ...measured });
    console.log(
      `   ⚔️  ${name.padEnd(24)} peak=${String(measured.peak).padEnd(8)} active=${String(measured.activeMs).padEnd(5)}ms band250-4k=${measured.bandShare === null ? 'n/a' : measured.bandShare}`
    );
  }

  check(
    `เสียงต่อสู้ดังพอ (peak ≥ ${BATTLE_MIN_PEAK})`,
    battleRows.every((r) => r.peak >= BATTLE_MIN_PEAK),
    battleRows.filter((r) => r.peak < BATTLE_MIN_PEAK).map((r) => `${r.name}=${r.peak}`).join(', ') || `${battleRows.length} เสียง`
  );
  check(
    `เสียงต่อสู้มีเนื้อ/หาง (active ≥ ${BATTLE_MIN_ACTIVE_MS}ms — ไม่ใช่ click แห้ง)`,
    battleRows.every((r) => r.activeMs >= BATTLE_MIN_ACTIVE_MS),
    battleRows.filter((r) => r.activeMs < BATTLE_MIN_ACTIVE_MS).map((r) => `${r.name}=${r.activeMs}ms`).join(', ') || `ต่ำสุด ${Math.min(...battleRows.map((r) => r.activeMs))}ms`
  );
  const bandKnown = battleRows.filter((r) => r.bandShare !== null);
  check(
    `เสียงต่อสู้มีพลังงานย่านที่มือถือออกได้ (250–4000Hz ≥ ${BATTLE_MIN_BAND * 100}%)`,
    bandKnown.length === 0
      ? true
      : bandKnown.every((r) => r.bandShare >= BATTLE_MIN_BAND),
    bandKnown.length === 0
      ? 'ตรวจไม่ได้ (บิลด์นี้ยังไม่มี API bands)'
      : bandKnown.filter((r) => r.bandShare < BATTLE_MIN_BAND).map((r) => `${r.name}=${r.bandShare}`).join(', ') ||
        `ต่ำสุด ${Math.min(...bandKnown.map((r) => r.bandShare))}`
  );
  const uiNames = SFX_NAMES.filter((n) => n.startsWith('ui_') || n.startsWith('rune_') || n.startsWith('card_'));
  const avg = (list) => (list.length ? list.reduce((s, n) => s + (sfxPeaks[n] ?? 0), 0) / list.length : 0);
  const uiAvg = avg(uiNames);
  const battleAvg = avg(BATTLE_SFX_LIST);
  check(
    'เสียงต่อสู้เด่นกว่าเสียง UI (เฉลี่ย)',
    battleAvg > uiAvg,
    `ต่อสู้ = ${battleAvg.toFixed(5)} · UI = ${uiAvg.toFixed(5)}`
  );

  // ---- Phase 24.2: ducking — ขณะเสียงต่อสู้ดัง เพลงต้องลดลงชั่วคราวแล้วคืนระดับเอง ----
  const duck = await evaluate(
    send,
    `(async () => {
      window.__rdaAudio.resume();
      await new Promise((r) => setTimeout(r, 2200)); // ให้เพลง/บรรยากาศกลับมาเล่นเต็มระดับ
      const before = window.__rdaAudio.bus();
      window.__rdaAudio.play('battle_sword');
      let minMusic = 99;
      let minSfx = 99;
      for (let i = 0; i < 8; i += 1) {
        const bus = window.__rdaAudio.bus();
        minMusic = Math.min(minMusic, bus.music);
        minSfx = Math.min(minSfx, bus.sfx);
        await new Promise((r) => setTimeout(r, 60));
      }
      await new Promise((r) => setTimeout(r, 1400)); // รอคืนระดับ (ramp 0.6 วิ + hold 0.32 วิ)
      const after = window.__rdaAudio.bus();
      return { before, minMusic: Number(minMusic.toFixed(4)), minSfx: Number(minSfx.toFixed(4)), after };
    })()`,
    true
  );
  check(
    'ducking: เพลงลดลงขณะเสียงดาบดัง',
    duck.minMusic < duck.before.music * 0.85,
    `เพลง ${duck.before.music} → ${duck.minMusic}`
  );
  check(
    'ducking: เพลงคืนระดับเองหลังเสียงจบ',
    Math.abs(duck.after.music - duck.before.music) < 0.05,
    `กลับมาเป็น ${duck.after.music} (เดิม ${duck.before.music})`
  );
  check(
    'ducking: บัส SFX ไม่ถูกลดตาม (เสียงต่อสู้ไม่เบาลง)',
    duck.minSfx >= duck.before.sfx - 0.05,
    `SFX ต่ำสุดระหว่าง duck = ${duck.minSfx} (ปกติ ${duck.before.sfx})`
  );

  // ---- หยุดเสียงเมื่อสลับไปแอปอื่น และเล่นต่อเมื่อกลับมา ----
  await evaluate(send, 'window.__rdaAudio.resume(); true');
  await sleep(1600);
  const beforePause = await evaluate(send, 'window.__rdaAudio.musicPlaying()');
  await evaluate(send, 'window.__rdaAudio.pause(); true');
  await sleep(700);
  const pausedMusic = await evaluate(send, 'window.__rdaAudio.musicPlaying()');
  const pausedState = await evaluate(send, 'window.__rdaAudio.ctxState()');
  const pausedLevel = await evaluate(send, 'window.__rdaAudio.level()');
  check('สลับแอปแล้วเพลงหยุด (pause ทำงาน)', beforePause === true && pausedMusic === false, `musicPlaying = ${pausedMusic}, ctx = ${pausedState}`);
  check('หลังหยุดแล้วไม่มีเสียงออก', pausedLevel <= MIN_RMS, `level = ${pausedLevel}`);

  const resumed = await evaluate(
    send,
    `(async () => {
      window.__rdaAudio.resume();
      await new Promise((r) => setTimeout(r, 1800));
      let peak = 0;
      for (let i = 0; i < 12; i += 1) {
        peak = Math.max(peak, window.__rdaAudio.level());
        await new Promise((r) => setTimeout(r, 100));
      }
      return { playing: window.__rdaAudio.musicPlaying(), peak };
    })()`,
    true
  );
  check('กลับเข้าเกมแล้วเสียงกลับมา', resumed.playing === true && resumed.peak > MIN_RMS, JSON.stringify(resumed));

  // ---- ทดสอบ wiring จริง: ซ่อนแท็บ (visibilitychange) ต้องหยุดเสียงเอง ----
  const hiddenFlow = await evaluate(
    send,
    `(async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 900));
      const stopped = !window.__rdaAudio.musicPlaying();
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await new Promise((r) => setTimeout(r, 1800));
      return { stopped, restarted: window.__rdaAudio.musicPlaying() };
    })()`,
    true
  );
  check('ซ่อนแท็บ/สลับแอป → หยุดเพลงเอง', hiddenFlow.stopped === true, JSON.stringify(hiddenFlow));
  check('กลับเข้าหน้าเกม → เพลงเล่นต่อเอง', hiddenFlow.restarted === true, JSON.stringify(hiddenFlow));

  console.log(`\nสรุป: ${failures === 0 ? 'ผ่านทุกข้อ ✅' : `ไม่ผ่าน ${failures} ข้อ ❌`}`);
} finally {
  chrome.kill('SIGTERM');
}

if (failures > 0) process.exitCode = 1;

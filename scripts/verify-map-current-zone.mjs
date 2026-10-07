// Phase 45.4 (2026-10-07): ตรวจว่า "หน้า Map แสดงแผนที่ที่ผู้เล่นยืนอยู่เป็นหน้าปัจจุบัน" จริง
// ผู้ใช้สั่ง: "ใน Map ให้แสดง Map ที่ผู้เล่นอยู่ เป็นหน้าปัจจุบัน"
//
// วิธีตรวจ (end-to-end จริง ไม่ใช่แค่ unit):
//   1) สมัครผู้ใช้ทดสอบใหม่ผ่าน API
//   2) ยัด log การฟาร์ม 1 แถวให้จุดปัจจุบันอยู่โซน VOIDGATE (โซนที่ 5 — ไม่ใช่โซนแรก)
//   3) เปิด /map ด้วยเบราว์เซอร์จริง → ต้องเห็นแท็บ VOIDGATE เป็นแท็บที่เลือกอยู่ + มี 📍
//   4) กดแท็บ EMBERFIELD → ต้องมีปุ่ม "ไปแผนที่ที่คุณอยู่" และกดแล้วกลับมา VOIDGATE
//   5) ลบข้อมูลทดสอบทั้งหมด (ผู้ใช้ + log)
//
// ใช้: node scripts/verify-map-current-zone.mjs   (ต้องมีเซิร์ฟเวอร์รันที่ 127.0.0.1:3000)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const stamp = Date.now();
const username = `e2emz${String(stamp).slice(-9)}`;
const email = `${username}@example.com`;
const password = 'Test1234!';

/** อ่าน DATABASE_URL จาก .env แล้วตัด query string ออก (psql ไม่รับ ?schema=) */
function databaseUrl() {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error('ไม่พบ DATABASE_URL ใน .env');
  return match[1].trim().replace(/^["']|["']$/g, '').split('?')[0];
}

const PSQL = '/home/woravik/pg-portable/postgresql-18.6.0-x86_64-unknown-linux-gnu/bin/psql';
function sql(query) {
  return execFileSync(PSQL, [databaseUrl(), '-tAc', query], { encoding: 'utf8' }).trim();
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

// จุดเป้าหมาย = จุดแรกของโซนสุดท้าย (VOIDGATE) — id รูปแบบ '<ZONE>-n1' (ดู src/lib/map-zones.ts)
const target = { id: 'VOIDGATE-n1', zone: 'VOIDGATE' };

let userId = null;
let browser = null;
try {
  // 1) สมัครผู้ใช้ทดสอบ
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password, displayName: username }),
  });
  check('สมัครผู้ใช้ทดสอบ', reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);
  userId = sql(`SELECT id FROM users WHERE username = '${username}'`);
  if (!userId) throw new Error('ไม่พบผู้ใช้ที่สมัคร');
  console.log(`   userId=${userId} · จุดเป้าหมาย=${target.id} (โซน ${target.zone})`);

  // 2) ยัด log ให้ "จุดปัจจุบัน" อยู่โซน VOIDGATE
  sql(
    `INSERT INTO map_farm_logs (id, user_id, run_id, node_id, won, stamina_cost, created_at) ` +
      `VALUES ('e2emapzone${stamp}', '${userId}', 'e2emapzone${stamp}', '${target.id}', true, 0, now())`
  );
  const storedNode = sql(
    `SELECT node_id FROM map_farm_logs WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT 1`
  );
  check('ตั้งจุดปัจจุบัน (DB)', storedNode === target.id, `node_id=${storedNode}`);

  // 3) เปิดหน้า /map ด้วยเบราว์เซอร์จริง (ล็อกอินผ่าน API + ใช้ cookie)
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 740 } });
  const page = await context.newPage();

  const login = await context.request.post(`${BASE}/api/auth/login`, {
    data: { identifier: username, password },
  });
  check('ล็อกอินผ่าน API', login.ok(), `HTTP ${login.status()}`);

  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-map-tabs]', { timeout: 15000 });

  const currentTab = await page.getAttribute('[data-map-tab-current="1"]', 'data-map-tab');
  check('แท็บที่ทำเครื่องหมาย "จุดที่อยู่" = VOIDGATE', currentTab === 'VOIDGATE', `data-map-tab=${currentTab}`);

  // แท็บที่เลือกอยู่จริงบนจอ = แท็บของโซนที่ยืนอยู่ (คลาส active = bg-amber-500/80)
  const activeTab = await page.evaluate(() => {
    const el = document.querySelector('[data-map-tabs] button.bg-amber-500\\/80');
    return el?.getAttribute('data-map-tab') ?? null;
  });
  check('หน้าปัจจุบันที่แสดง = แผนที่ที่ผู้เล่นอยู่', activeTab === 'VOIDGATE', `แท็บที่เลือก=${activeTab}`);

  const marker = await page.textContent('[data-map-tab-current="1"]');
  check('มี 📍 บนแท็บของแผนที่ที่อยู่', (marker ?? '').includes('📍'), `ข้อความ=${marker?.replace(/\s+/g, ' ').trim()}`);

  const jumpVisibleWhenSame = await page.locator('[data-map-go-current]').count();
  check('ไม่โชว์ปุ่ม "ไปแผนที่ที่คุณอยู่" ตอนอยู่โซนปัจจุบันแล้ว', jumpVisibleWhenSame === 0, `count=${jumpVisibleWhenSame}`);

  // 4) กดแท็บ EMBERFIELD → ต้องมีปุ่มกลับไปโซนที่ยืนอยู่ และกดแล้วกลับมา VOIDGATE
  await page.click('[data-map-tab="EMBERFIELD"]');
  await page.waitForSelector('[data-map-go-current]', { timeout: 5000 });
  check('ย้ายไปดูแผนที่อื่นแล้วมีปุ่มกลับ', true);
  await page.click('[data-map-go-current]');
  await page.waitForFunction(
    () => document.querySelector('[data-map-tabs] button.bg-amber-500\\/80')?.getAttribute('data-map-tab') === 'VOIDGATE',
    { timeout: 5000 }
  );
  check('กดปุ่มกลับ → กลับมาแผนที่ที่ผู้เล่นอยู่', true);
} catch (error) {
  check('สคริปต์ทำงานครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  // 5) ลบข้อมูลทดสอบ
  if (userId) {
    try {
      sql(`DELETE FROM map_farm_logs WHERE user_id = '${userId}'`);
      sql(`DELETE FROM users WHERE id = '${userId}'`);
      const left = sql(`SELECT count(*) FROM users WHERE id = '${userId}'`);
      check('ลบข้อมูลทดสอบแล้ว', left === '0', `เหลือ ${left} แถว`);
    } catch (error) {
      check('ลบข้อมูลทดสอบ', false, error instanceof Error ? error.message : String(error));
    }
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} ผ่าน`);
process.exit(failed.length === 0 ? 0 : 1);

// Phase 45.4 (2026-10-07): ตรวจว่า "ความยากดันเจี้ยนแต่ละชั้นต่างกันจริง และผู้เล่นเห็นระดับได้"
// ผู้ใช้สั่ง: "ช่วยปรับความยาก ดันเจี้ยน แต่ละชั้น ให้มีความต่างอย่างพอดี ให้รู้สึกว่าเปลี่ยนระดับ"
//
// วิธีตรวจ (ของจริงบนจอ ไม่ใช่แค่ unit test):
//   1) สมัครผู้ใช้ทดสอบ + ตั้ง bestFloor ให้ชั้นลึกปลดล็อก
//   2) เปิด /dungeons เลือกดัน GILDED_ABYSS
//   3) อ่านค่าที่โชว์จริงของชั้น 1 / 2 / 15 / 30 → ดาว + พลังศัตรู + HP ต้องไต่ขึ้นทุกชั้น (ไม่มีชั้นไหนเท่ากัน)
//   4) ลบข้อมูลทดสอบ
//
// ใช้: node scripts/verify-dungeon-curve.mjs   (ต้องมีเซิร์ฟเวอร์รันที่ 127.0.0.1:3000)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const stamp = Date.now();
const username = `e2edc${String(stamp).slice(-9)}`;
const email = `${username}@example.com`;
const password = 'Test1234!';

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

let userId = null;
let browser = null;
try {
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email, password, displayName: username }),
  });
  check('สมัครผู้ใช้ทดสอบ', reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);
  userId = sql(`SELECT id FROM users WHERE username = '${username}'`);
  if (!userId) throw new Error('ไม่พบผู้ใช้ที่สมัคร');

  // ปลดล็อกชั้นลึกของ GILDED_ABYSS (30 ชั้น) ให้เลือกดูได้
  sql(
    `INSERT INTO dungeon_progress (id, user_id, dungeon_code, best_floor, "createdAt", "updatedAt") ` +
      `VALUES ('e2edc${stamp}', '${userId}', 'GILDED_ABYSS', 29, now(), now()) ` +
      `ON CONFLICT (user_id, dungeon_code) DO UPDATE SET best_floor = 29`
  );

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 740 } });
  const page = await context.newPage();
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: { identifier: username, password } });
  check('ล็อกอินผ่าน API', login.ok(), `HTTP ${login.status()}`);

  await page.goto(`${BASE}/dungeons`, { waitUntil: 'networkidle' });
  // เลือกดันเหวลึกทองคำ (GILDED_ABYSS = ดันเหรียญ 30 ชั้น)
  await page.click('[data-dungeon="GILDED_ABYSS"]').catch(async () => {
    await page.click('text=เหวลึกทองคำ');
  });

  /** อ่านค่าความยากของชั้นที่เลือกอยู่จาก DOM จริง */
  async function readFloor(floor) {
    await page.selectOption('[data-dungeon-floor-select]', String(floor));
    await page.waitForFunction(
      (want) => document.querySelector(`[data-dungeon-floor-difficulty="${want}"]`) !== null,
      floor,
      { timeout: 5000 }
    );
    return page.evaluate(() => {
      const box = document.querySelector('[data-dungeon-floor-difficulty]');
      const stars = box?.querySelector('[data-dungeon-floor-stars]');
      const power = box?.querySelector('[data-dungeon-floor-enemy-power]');
      const hp = box?.querySelector('[data-dungeon-floor-hp-bonus]');
      return {
        floor: Number(box?.getAttribute('data-dungeon-floor-difficulty') ?? 0),
        stars: Number(stars?.getAttribute('data-dungeon-floor-stars') ?? 0),
        starsShown: (stars?.textContent ?? '').trim().length,
        power: Number((power?.textContent ?? '0').replace(/[^0-9]/g, '')),
        hp: Number(hp?.getAttribute('data-dungeon-floor-hp-bonus') ?? 1),
      };
    });
  }

  const floors = [1, 2, 15, 30];
  const rows = [];
  for (const floor of floors) rows.push(await readFloor(floor));
  for (const row of rows) {
    console.log(
      `   ชั้น ${row.floor}: ⭐${row.stars}/10 · พลังศัตรู ${row.power.toLocaleString('th-TH')} · HP ×${row.hp}`
    );
  }

  const stars = rows.map((r) => r.stars);
  const powers = rows.map((r) => r.power);
  check('ดาวความยากไม่ลดลงเลยทุกชั้นที่สุ่มตรวจ', stars.every((v, i) => i === 0 || v >= stars[i - 1]), `ดาว = ${stars.join(' → ')}`);
  check('พลังคุกคามของศัตรูไต่ขึ้นทุกชั้นที่สุ่มตรวจ', powers.every((v, i) => i === 0 || v > powers[i - 1]), `พลัง = ${powers.join(' → ')}`);
  check('ชั้น 1 กับชั้น 2 ต่างกันจริง (ไม่ใช่ทั้งบล็อกเท่ากัน)', rows[0].power !== rows[1].power, `${rows[0].power} vs ${rows[1].power}`);
  check('ชั้นท้ายมี HP ศัตรูสูงกว่าชั้นแรก', rows[3].hp > rows[0].hp, `×${rows[0].hp} → ×${rows[3].hp}`);
  check('โชว์ดาวบนหน้าจอจริง', rows.every((r) => r.starsShown > 0));
} catch (error) {
  check('สคริปต์ทำงานครบ', false, error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (userId) {
    try {
      sql(`DELETE FROM dungeon_progress WHERE user_id = '${userId}'`);
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

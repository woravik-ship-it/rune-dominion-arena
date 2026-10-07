/**
 * global-setup — สร้าง "ผู้ใช้ทดสอบ" ใหม่ 1 คนต่อการรัน (สุ่มชื่อทุกครั้ง)
 * แล้วบันทึก session (cookie rda_session) ไว้ให้เทสต์ที่ต้องล็อกอินใช้ร่วมกัน
 * → ลดจำนวนครั้งสมัคร เพื่อไม่ชน rate limit AUTH_REGISTER (5 ครั้ง/นาที)
 *
 * ⚠️ ไม่แตะ/ไม่ลบบัญชีจริง — ผู้ใช้ที่สร้างเป็นบัญชีทดสอบชื่อสุ่มเท่านั้น
 */
import { request, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BASE_URL, TEST_PASSWORD, randomUser, RUN_START_FILE, STORAGE_STATE } from './helpers';

export default async function globalSetup(_config: FullConfig) {
  // บันทึกเวลาเริ่มรอบ — global-teardown ใช้ลบเฉพาะผู้ใช้ทดสอบที่รอบนี้สร้าง
  fs.mkdirSync(path.dirname(RUN_START_FILE), { recursive: true });
  fs.writeFileSync(RUN_START_FILE, JSON.stringify({ startedAt: new Date().toISOString() }, null, 2));

  const user = randomUser('e2e_g');
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    const res = await ctx.post('/api/auth/register', {
      data: {
        username: user.username,
        email: user.email,
        password: TEST_PASSWORD,
        displayName: `E2E ${user.username}`,
      },
    });
    if (res.status() !== 201) {
      throw new Error(
        `global-setup: สมัครผู้ใช้ทดสอบไม่สำเร็จ (HTTP ${res.status()}) — ตรวจว่าเซิร์ฟเวอร์ที่ ${BASE_URL} รันอยู่: ${await res.text()}`
      );
    }
    fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
    await ctx.storageState({ path: STORAGE_STATE });
    // eslint-disable-next-line no-console
    console.log(`[global-setup] สร้างผู้ใช้ทดสอบ ${user.username} → ${STORAGE_STATE}`);
  } finally {
    await ctx.dispose();
  }
}

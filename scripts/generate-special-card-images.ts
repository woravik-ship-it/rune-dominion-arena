/**
 * สร้างภาพ "การ์ดวิเศษ/ของหายากจาก Event" ด้วย AI (pipeline ภาพการ์ด)
 * แล้วเก็บไว้ใน var/special-art → เสิร์ฟผ่าน /api/inventory/[code]/art
 *
 * วิธีใช้:
 *   npm run images:special          # สร้างทุกการ์ดที่นิยามไว้ (ยังไม่มีภาพ / ข้ามที่มีแล้ว)
 *   npm run images:special -- --all # สร้างใหม่ทุกใบ (ทับของเดิม)
 *   npm run images:special -- --dry # ดูว่าจะสร้างใบไหน ไม่เรียก API
 */
import { readFileSync } from 'node:fs';
import { generateSpecialCardImageBytes, aiImageEnabled } from '../src/lib/ai-image';
import { inventoryCode } from '../src/services/inventory';
import { saveSpecialArt, hasSpecialArt } from '../src/lib/special-art-store';
import { PERSONAL_MILESTONES } from '../src/services/event-definitions';

// โหลด .env
for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const argv = process.argv.slice(2);
const ALL = argv.includes('--all');
const DRY = argv.includes('--dry');
const DELAY_MS = Number(argv[argv.indexOf('--delay') + 1] ?? 2500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** การ์ดวิเศษที่กำหนดใน event-definitions (rewardType CARD + rewardLabel) */
function eventCardLabels(): string[] {
  const out = new Set<string>();
  for (const m of PERSONAL_MILESTONES) {
    if (m.rewardType === 'CARD' && m.rewardLabel) out.add(m.rewardLabel);
  }
  return [...out];
}

async function main(): Promise<void> {
  if (!aiImageEnabled()) {
    console.warn('⚠️  AI ปิดอยู่ — ข้ามไป');
    return;
  }
  const labels = eventCardLabels();
  console.log(`🎴 สร้างรูปการ์ดวิเศษ ${labels.length} ใบ`);
  if (DRY) {
    for (const label of labels) console.log(`   - ${label}`);
    return;
  }
  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const label of labels) {
    const code = inventoryCode(label);
    if (!ALL && (await hasSpecialArt(code))) {
      skipped += 1;
      console.log(`   ⏭️  ${label} — มีรูปแล้ว (ข้าม)`);
      continue;
    }
    try {
      const generated = await generateSpecialCardImageBytes(label, code);
      const url = await saveSpecialArt(code, generated.bytes, generated.contentType);
      done += 1;
      console.log(`   ✅ ${label} → ${Math.round(generated.bytes.length / 1024)}KB · ${url}`);
    } catch (error) {
      failed += 1;
      console.error(`   ❌ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }
  console.log(`\n🎴 เสร็จสิ้น: สำเร็จ ${done} · ข้าม ${skipped} · ล้มเหลว ${failed}`);
}

void main();
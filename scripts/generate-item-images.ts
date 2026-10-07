/**
 * สร้างภาพ Item ด้วย AI (ค่าเริ่มต้น: pollinations/Flux ใช้ฟรี ไม่ต้องมี key)
 * แล้วเก็บไฟล์ไว้ใน var/item-art → เสิร์ฟผ่าน /api/items/[code]/art
 *
 * วิธีใช้:
 *   npm run images:items                 # เฉพาะ Item ที่ยังไม่มีภาพ
 *   npm run images:items -- --all        # สร้างใหม่ทุกชิ้น (ทับของเดิม)
 *   npm run images:items -- --limit 3    # จำกัดจำนวน (ทดลอง)
 *   npm run images:items -- --ids ATK_WHETSTONE,DEF_IRONSHIELD
 *   npm run images:items -- --delay 2500 # หน่วงระหว่างคำขอ (ms, ค่าเริ่มต้น 1500)
 *   npm run images:items -- --dry        # ดูว่าจะทำชิ้นไหน ไม่เรียก API
 */
import { readFileSync } from 'node:fs';
import { generateItemImageBytes, aiImageEnabled } from '../src/lib/ai-image';
import { ITEM_CATALOG } from '../src/lib/item-definitions';
import { hasItemArt, saveItemArt } from '../src/lib/item-art-store';

// โหลด .env (ให้ AI_* / DATABASE_URL พร้อมใช้เมื่อรันผ่านสคริปต์)
for (const rawLine of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const ALL = flag('--all');
const DRY = flag('--dry');
const LIMIT = Number(value('--limit') ?? 0);
const IDS = (value('--ids') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const DELAY_MS = Number(value('--delay') ?? 1500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  if (!aiImageEnabled()) {
    console.warn('⚠️  AI ปิดอยู่ (AI_IMAGE_DISABLED=1 หรือ provider ไม่พร้อม) — ข้ามไป');
    return;
  }

  const targets = IDS.length
    ? ITEM_CATALOG.filter((def) => IDS.includes(def.code))
    : ITEM_CATALOG;
  const real = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

  console.log(`🎨 สร้างภาพ AI ให้ Item ${real.length} ชิ้น (รวมแคตตาล็อก ${ITEM_CATALOG.length})`);
  console.log(`   provider: ${process.env.AI_IMAGE_PROVIDER ?? 'pollinations'} · model: ${process.env.AI_IMAGE_MODEL ?? 'sana'}`);
  if (DRY) {
    for (const def of real) console.log(`   - ${def.nameTh ?? def.name} (${def.rarity}/${def.slot})`);
    console.log('   ... (โหมด --dry ไม่เรียก API)');
    return;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const def of real) {
    if (!ALL && !IDS.length && (await hasItemArt(def.code))) {
      skipped += 1;
      console.log(`   ⏭️  [${done + skipped + failed}/${real.length}] ${def.nameTh ?? def.name} — มีภาพแล้ว (ข้าม)`);
      continue;
    }
    const label = `${def.nameTh ?? def.name} (${def.rarity} · ${def.slot})`;
    const started = Date.now();
    try {
      const generated = await generateItemImageBytes({
        name: def.name,
        nameTh: def.nameTh,
        slot: def.slot,
        rarity: def.rarity,
        descriptionTh: def.descriptionTh,
        seedHash: def.code,
      });
      const url = await saveItemArt(def.code, generated.bytes, generated.contentType);
      done += 1;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`   ✅ [${done + skipped + failed}/${real.length}] ${label} → ${Math.round(generated.bytes.length / 1024)}KB ใน ${seconds}s · ${url}`);
    } catch (error) {
      failed += 1;
      console.error(`   ❌ ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(`\n🎨 เสร็จสิ้น: สำเร็จ ${done} · ข้าม ${skipped} · ล้มเหลว ${failed}`);
}

void main();
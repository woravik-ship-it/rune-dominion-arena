/**
 * สร้างภาพพื้นหลังแผนที่ด้วย AI (ค่าเริ่มต้น: pollinations/Flux ใช้ฟรี ไม่ต้องมี key)
 * แล้วเก็บไฟล์ไว้ใน var/map-art → เสิร์ฟผ่าน /api/map/[zone]/art
 *
 * วิธีใช้:
 *   npm run images:maps                # สร้างทุกโซนที่ยังไม่มีภาพ
 *   npm run images:maps -- --all       # สร้างใหม่ทุกโซน (ทับของเดิม)
 *   npm run images:maps -- --zone EMBERFIELD,VOIDGATE   # เฉพาะโซนที่ระบุ
 *   npm run images:maps -- --dry       # ดูว่าจะสร้างโซนไหน ไม่เรียก API
 */
import { readFileSync } from 'node:fs';
import { generateMapBackgroundBytes, aiImageEnabled } from '../src/lib/ai-image';
import { MAP_ZONES } from '../src/lib/map-zones';
import { hasMapArt, saveMapArt } from '../src/lib/map-art-store';

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
const ZONES = (value('--zone') ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const DELAY_MS = Number(value('--delay') ?? 2500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  if (!aiImageEnabled()) {
    console.warn('⚠️  AI ปิดอยู่ (AI_IMAGE_DISABLED=1 หรือ provider ไม่พร้อม) — ข้ามไป');
    return;
  }

  const targets = ZONES.length ? MAP_ZONES.filter((zone) => ZONES.includes(zone.id)) : MAP_ZONES;
  console.log(`🗺️  สร้างภาพพื้นหลังแผนที่ให้ ${targets.length} โซน`);
  console.log(`   provider: ${process.env.AI_IMAGE_PROVIDER ?? 'pollinations'} · model: ${process.env.AI_IMAGE_MODEL ?? 'sana'}`);
  if (DRY) {
    for (const zone of targets) console.log(`   - ${zone.nameTh} (${zone.id})`);
    console.log('   ... (โหมด --dry ไม่เรียก API)');
    return;
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const zone of targets) {
    if (!ALL && !ZONES.length && (await hasMapArt(zone.id))) {
      skipped += 1;
      console.log(`   ⏭️  [${done + skipped + failed}/${targets.length}] ${zone.nameTh} — มีภาพแล้ว (ข้าม)`);
      continue;
    }
    const started = Date.now();
    try {
      const generated = await generateMapBackgroundBytes(
        {
          id: zone.id,
          nameTh: zone.nameTh,
          name: zone.name,
          descriptionTh: zone.descriptionTh,
          tier: zone.tier,
          palette: zone.palette,
          mood: zone.mood,
        },
        // OpenAI gpt-image-1-mini มักใช้เวลา >45s ⇒ ขอ timeout นานขึ้น (กัน abort กลางคัน)
        { timeoutMs: 180_000 }
      );
      const url = await saveMapArt(zone.id, generated.bytes, generated.contentType);
      done += 1;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`   ✅ [${done + skipped + failed}/${targets.length}] ${zone.nameTh} → ${Math.round(generated.bytes.length / 1024)}KB ใน ${seconds}s · ${url}`);
    } catch (error) {
      failed += 1;
      console.error(`   ❌ ${zone.nameTh}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(`\n🗺️  เสร็จสิ้น: สำเร็จ ${done} · ข้าม ${skipped} · ล้มเหลว ${failed}`);
}

void main();
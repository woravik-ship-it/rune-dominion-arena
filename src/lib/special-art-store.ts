// Special Art Storage — เก็บภาพ "การ์ดวิเศษ/ของหายากจาก Event" (AI gen) แล้วเสิร์ฟผ่าน /api/inventory/[code]/art
// แบบเดียวกับ item-art-store (นอก public ควบคุมแคช/สิทธิ์เอง)
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { specialArtUrl } from './special-art';

/** โฟลเดอร์เก็บภาพของพิเศษ */
export function specialArtDir(): string {
  return process.env.SPECIAL_ART_DIR ?? path.join(process.cwd(), 'var', 'special-art');
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** บันทึกภาพลงดิสก์ → คืน URL พร้อมเวอร์ชันตามเนื้อไฟล์ (กันแคชเก่า) */
export async function saveSpecialArt(code: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? 'png';
  const dir = specialArtDir();
  await mkdir(dir, { recursive: true });
  for (const other of Object.values(EXT_BY_TYPE)) {
    if (other === ext) continue;
    await rm(path.join(dir, `${code}.${other}`), { force: true }).catch(() => undefined);
  }
  await writeFile(path.join(dir, `${code}.${ext}`), bytes);
  const version = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  return `${specialArtUrl(code)}?v=${version}`;
}

/** อ่านภาพ (null = ยังไม่มีไฟล์) */
export async function readSpecialArt(
  code: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const dir = specialArtDir();
  for (const [contentType, ext] of Object.entries(EXT_BY_TYPE)) {
    const file = path.join(dir, `${code}.${ext}`);
    try {
      const bytes = await readFile(file);
      return { bytes, contentType };
    } catch {
      // ลองนามสกุลถัดไป
    }
  }
  return null;
}

/** มีภาพแล้วหรือยัง */
export async function hasSpecialArt(code: string): Promise<boolean> {
  return (await readSpecialArt(code)) !== null;
}

/** อายุไฟล์ภาพ (ใช้บอกสถานะ gen ยังค้าง) */
export async function specialArtAgeMs(code: string): Promise<number | null> {
  const dir = specialArtDir();
  for (const ext of Object.values(EXT_BY_TYPE)) {
    try {
      const info = await stat(path.join(dir, `${code}.${ext}`));
      return Date.now() - info.mtimeMs;
    } catch {
      // ลองนามสกุลถัดไป
    }
  }
  return null;
}
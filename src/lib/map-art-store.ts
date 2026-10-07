// Map Art Storage — เก็บภาพพื้นหลังโซนแผนที่ (AI gen) ไว้ในเครื่อง แล้วเสิร์ฟผ่าน /api/map/[zone]/art
// แบบเดียวกับ item-art-store (นอก public ควบคุมแคช/สิทธิ์เอง)
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mapArtUrl } from './map-art';

/** โฟลเดอร์เก็บภาพแผนที่ */
export function mapArtDir(): string {
  return process.env.MAP_ART_DIR ?? path.join(process.cwd(), 'var', 'map-art');
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** บันทึกภาพพื้นหลังโซนลงดิสก์ → คืน URL พร้อมเวอร์ชันตามเนื้อไฟล์ (กันแคชเก่า) */
export async function saveMapArt(zoneId: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? 'png';
  const dir = mapArtDir();
  await mkdir(dir, { recursive: true });
  for (const other of Object.values(EXT_BY_TYPE)) {
    if (other === ext) continue;
    await rm(path.join(dir, `${zoneId}.${other}`), { force: true }).catch(() => undefined);
  }
  await writeFile(path.join(dir, `${zoneId}.${ext}`), bytes);
  const version = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  return `${mapArtUrl(zoneId)}?v=${version}`;
}

/** อ่านภาพพื้นหลังโซน (null = ยังไม่มีไฟล์) */
export async function readMapArt(
  zoneId: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const dir = mapArtDir();
  for (const [contentType, ext] of Object.entries(EXT_BY_TYPE)) {
    const file = path.join(dir, `${zoneId}.${ext}`);
    try {
      const bytes = await readFile(file);
      return { bytes, contentType };
    } catch {
      // ลองนามสกุลถัดไป
    }
  }
  return null;
}

/** มีภาพพื้นหลังโซนจริงในเครื่องแล้วหรือยัง */
export async function hasMapArt(zoneId: string): Promise<boolean> {
  return (await readMapArt(zoneId)) !== null;
}

/** อายุไฟล์ภาพพื้นหลัง (ใช้บอกสถานะ gen ยังค้าง) */
export async function mapArtAgeMs(zoneId: string): Promise<number | null> {
  const dir = mapArtDir();
  for (const ext of Object.values(EXT_BY_TYPE)) {
    try {
      const info = await stat(path.join(dir, `${zoneId}.${ext}`));
      return Date.now() - info.mtimeMs;
    } catch {
      // ลองนามสกุลถัดไป
    }
  }
  return null;
}
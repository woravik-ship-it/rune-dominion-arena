// Item Art Storage — เก็บภาพ AI ของ Item (ช่าง/ตีบวก) ไว้ในเครื่อง แล้วเสิร์ฟผ่าน /api/items/[code]/art
// แบบเดียวกับ card-art-store (นอก public ควบคุมแคช/สิทธิ์เอง)
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { itemArtUrl } from './item-art';

/** โฟลเดอร์เก็บภาพ Item */
export function itemArtDir(): string {
  return process.env.ITEM_ART_DIR ?? path.join(process.cwd(), 'var', 'item-art');
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** บันทึกภาพ Item ลงดิสก์ → คืน URL พร้อมเวอร์ชันตามเนื้อไฟล์ (กันแคชเก่า) */
export async function saveItemArt(code: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? 'png';
  const dir = itemArtDir();
  await mkdir(dir, { recursive: true });
  for (const other of Object.values(EXT_BY_TYPE)) {
    if (other === ext) continue;
    await rm(path.join(dir, `${code}.${other}`), { force: true }).catch(() => undefined);
  }
  await writeFile(path.join(dir, `${code}.${ext}`), bytes);
  const version = createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  return `${itemArtUrl(code)}?v=${version}`;
}

/** อ่านภาพ Item (null = ยังไม่มีไฟล์) */
export async function readItemArt(
  code: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const dir = itemArtDir();
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

/** มีภาพ Item จริงในเครื่องแล้วหรือยัง */
export async function hasItemArt(code: string): Promise<boolean> {
  return (await readItemArt(code)) !== null;
}

/** อายุไฟล์ภาพ Item (ใช้บอกสถานะ gen ยังค้าง) */
export async function itemArtAgeMs(code: string): Promise<number | null> {
  const dir = itemArtDir();
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
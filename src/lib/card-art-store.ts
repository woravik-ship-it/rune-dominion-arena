// Card Art Storage — เก็บภาพ AI ที่สร้างไว้ในเครื่อง แล้วเสิร์ฟผ่าน /api/cards/[id]/art
// เหตุผล: ภาพจากผู้ให้บริการฟรีไม่ควรถูกดึงซ้ำทุกครั้งที่เปิดหน้า + ทำให้การ์ดแสดงเร็วและคงที่
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

/** โฟลเดอร์เก็บภาพ (อยู่นอก public เพื่อคุมแคช/สิทธิ์เองได้) */
export function cardArtDir(): string {
  return process.env.CARD_ART_DIR ?? path.join(process.cwd(), 'var', 'card-art');
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** URL สาธารณะของภาพการ์ด (อยู่ในโดเมนเดียวกัน → ใช้เป็นเลเยอร์ของ <img> ได้) */
export function cardArtUrl(cardId: string): string {
  return `/api/cards/${cardId}/art`;
}

/** บันทึกภาพการ์ดลงดิสก์ → คืน URL สาธารณะ */
export async function saveCardArt(cardId: string, bytes: Buffer, contentType: string): Promise<string> {
  const ext = EXT_BY_TYPE[contentType] ?? 'jpg';
  const dir = cardArtDir();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${cardId}.${ext}`), bytes);
  return cardArtUrl(cardId);
}

/** อ่านภาพการ์ด (คืน null ถ้ายังไม่มีไฟล์) */
export async function readCardArt(cardId: string): Promise<{ bytes: Buffer; contentType: string; mtime: Date } | null> {
  const dir = cardArtDir();
  for (const [contentType, ext] of Object.entries(EXT_BY_TYPE)) {
    const file = path.join(dir, `${cardId}.${ext}`);
    try {
      const info = await stat(file);
      const bytes = await readFile(file);
      return { bytes, contentType, mtime: info.mtime };
    } catch {
      // ลองนามสกุลถัดไป
    }
  }
  return null;
}

/** ตรวจว่าการ์ดใบนี้มีภาพ AI จริงในเครื่องแล้วหรือยัง */
export async function hasCardArt(cardId: string): Promise<boolean> {
  return (await readCardArt(cardId)) !== null;
}

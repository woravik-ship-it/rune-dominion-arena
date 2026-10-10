import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

/**
 * ให้บริการ "คู่มือผู้เล่นฉบับเต็ม" จากไฟล์จริงในโปรเจกต์ (docs/manual)
 *
 * ผู้ใช้แจ้ง 2026-10-08: *"ทำไมคู่มือฉบับเต็ม ผมเปิดแล้วขึ้นเป็น Code ที่หน้า GitHub"*
 * — ลิงก์เดิมชี้ไป `github.com/.../blob/master/docs/manual/index.html` ซึ่ง GitHub แสดงเป็น "โค้ด"
 *   (ไม่เรนเดอร์ HTML) ⇒ เปลี่ยนมาเสิร์ฟจากในเกมเองที่ `/manual` (โดเมนเดียวกับเกม · ไม่ต้องพึ่ง GitHub Pages)
 *
 *  - ไม่คัดลอกไฟล์ไป `public/` (คู่มือ+ภาพหนัก ~33 MB ⇒ จะซ้ำซ้อนใน git) — อ่านจาก `docs/manual` ตรง ๆ
 *  - กัน path traversal ด้วยการเทียบพาธที่ resolve แล้วว่าอยู่ใต้ ROOT เท่านั้น
 *  - อนุญาตเฉพาะนามสกุลที่คู่มือใช้จริง (html/รูป/ฟอนต์/css/pdf) ⇒ ไฟล์อื่นไม่ถูกเสิร์ฟ
 */
const ROOT = resolve(process.cwd(), 'docs/manual');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// อ่านไฟล์ตอน request (ไม่ใช่ตอน build) ⇒ ต้อง dynamic
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { path?: string[] } }
) {
  const parts = params.path ?? [];
  const requested = resolve(ROOT, parts.length > 0 ? parts.join('/') : 'index.html');

  // ต้องอยู่ใต้ ROOT เท่านั้น (กัน ../../)
  if (requested !== ROOT && !requested.startsWith(ROOT + sep)) {
    return new NextResponse('ไม่พบไฟล์คู่มือ', { status: 404 });
  }

  try {
    const info = await stat(requested);
    const file = info.isDirectory() ? resolve(requested, 'index.html') : requested;
    const type = CONTENT_TYPES[extname(file).toLowerCase()];
    if (!type) return new NextResponse('ไม่รองรับไฟล์ชนิดนี้', { status: 404 });

    const data = await readFile(file);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'content-type': type,
        // คู่มือเปลี่ยนไม่บ่อย — แคช 1 ชั่วโมงพอ (แก้แล้วเห็นผลภายในชั่วโมงหรือรีเฟรชแรง)
        'cache-control': 'public, max-age=3600',
        'content-length': String(data.byteLength),
      },
    });
  } catch {
    return new NextResponse('ไม่พบไฟล์คู่มือ', { status: 404 });
  }
}

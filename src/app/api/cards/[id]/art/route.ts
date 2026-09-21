import { NextRequest, NextResponse } from 'next/server';
import { readCardArt } from '@/lib/card-art-store';

// GET /api/cards/[id]/art — ภาพ AI จริงที่สร้างไว้สำหรับการ์ดใบนี้
// (เก็บไฟล์ในเครื่อง ไม่ดึงจากผู้ให้บริการซ้ำทุกครั้ง)
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const art = await readCardArt(params.id);

  if (!art) {
    return NextResponse.json({ error: 'ยังไม่มีภาพ AI สำหรับการ์ดใบนี้' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(art.bytes), {
    status: 200,
    headers: {
      'Content-Type': art.contentType,
      'Content-Length': String(art.bytes.length),
      // ภาพนิ่งต่อการ์ด → แคชได้นาน (เปลี่ยนเมื่อสั่งสร้างใหม่เท่านั้น)
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Last-Modified': art.mtime.toUTCString(),
    },
  });
}

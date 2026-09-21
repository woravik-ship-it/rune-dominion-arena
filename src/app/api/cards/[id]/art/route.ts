import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readCardArt } from '@/lib/card-art-store';

// GET /api/cards/[id]/art — ภาพ AI จริงที่สร้างไว้สำหรับการ์ดใบนี้
// (เก็บไฟล์ในเครื่อง ไม่ดึงจากผู้ให้บริการซ้ำทุกครั้ง)
//
// ?probe=1 → ตอบ 200 เฉพาะเมื่อ "ภาพพร้อมใช้แล้ว" (imageStatus = READY)
//            ใช้โดยฝั่งเว็บเพื่อ poll ระหว่างสร้างภาพ (ถ้ายังไม่พร้อมตอบ 404)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const probing = request.nextUrl.searchParams.has('probe');

  if (probing) {
    const card = await prisma.cardDefinition.findUnique({
      where: { id: params.id },
      select: { imageStatus: true },
    });
    if (card?.imageStatus !== 'READY') {
      return NextResponse.json({ ready: false, status: card?.imageStatus ?? 'UNKNOWN' }, { status: 404 });
    }
  }

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

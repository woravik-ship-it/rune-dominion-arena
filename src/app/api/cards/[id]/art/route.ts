import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readCardArt } from '@/lib/card-art-store';
import { parseDungeonCardId } from '@/lib/dungeon-art';
import { dungeonArtCandidates } from '@/services/dungeon-art';

// GET /api/cards/[id]/art — ภาพ AI จริงที่สร้างไว้สำหรับการ์ดใบนี้
// (เก็บไฟล์ในเครื่อง ไม่ดึงจากผู้ให้บริการซ้ำทุกครั้ง)
//
// ?probe=1 → ตอบ 200 เฉพาะเมื่อ "ภาพพร้อมใช้แล้ว" (imageStatus = READY)
//            ใช้โดยฝั่งเว็บเพื่อ poll ระหว่างสร้างภาพ (ถ้ายังไม่พร้อมตอบ 404)
//
// Phase 31.1: การ์ดศัตรูดันเจี้ยนไม่มีไฟล์ภาพของตัวเอง → ยืมภาพการ์ดจริงในคลัง
//   (เลือกตามธาตุของดัน) เพื่อให้หน้าสนามรบแสดงการ์ดศัตรูได้ครบโดยไม่ Gen ภาพใหม่
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const probing = request.nextUrl.searchParams.has('probe');

  // การ์ดศัตรูดันเจี้ยน → เสิร์ฟภาพที่ยืมมาจากการ์ดจริง
  if (parseDungeonCardId(params.id)) {
    const candidates = await dungeonArtCandidates(params.id);
    for (const candidate of candidates) {
      const borrowed = await readCardArt(candidate);
      if (borrowed) {
        return new NextResponse(new Uint8Array(borrowed.bytes), {
          status: 200,
          headers: {
            'Content-Type': borrowed.contentType,
            'Content-Length': String(borrowed.bytes.length),
            // อ้างการ์ดต้นทาง → ภาพเปลี่ยนตามการ์ดนั้นได้ แต่ cache ไว้ให้แสดงเร็ว
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'Last-Modified': borrowed.mtime.toUTCString(),
          },
        });
      }
    }
    return NextResponse.json({ error: 'ยังไม่มีภาพสำหรับศัตรูดันเจี้ยน' }, { status: 404 });
  }

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

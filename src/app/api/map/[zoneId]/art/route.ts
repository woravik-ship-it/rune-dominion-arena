import { NextRequest } from 'next/server';
import { readMapArt } from '@/lib/map-art-store';

// GET /api/map/[zoneId]/art — ภาพพื้นหลังโซนที่ gen ไว้ (404 = ยังไม่มี → client ใช้เกรเดียนต์แทน)
export async function GET(
  _request: NextRequest,
  { params }: { params: { zoneId: string } }
) {
  const art = await readMapArt(String(params.zoneId ?? ''));
  if (!art) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(art.bytes), {
    headers: {
      'Content-Type': art.contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
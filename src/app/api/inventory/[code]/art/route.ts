import { NextRequest } from 'next/server';
import { readSpecialArt } from '@/lib/special-art-store';

// GET /api/inventory/[code]/art — ภาพการ์ดวิเศษ/ของหายากจาก Event (404 = ยังไม่มี → client ใช้ไอคอนแทน)
export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  const art = await readSpecialArt(String(params.code ?? ''));
  if (!art) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(art.bytes), {
    headers: {
      'Content-Type': art.contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
import { NextRequest } from 'next/server';
import { readItemArt } from '@/lib/item-art-store';

// GET /api/items/[code]/art — ภาพ Item ที่ gen ไว้ (404 = ยังไม่มี → client ใช้ icon emoji แทน)
export async function GET(
  _request: NextRequest,
  { params }: { params: { code: string } }
) {
  const art = await readItemArt(String(params.code ?? ''));
  if (!art) return new Response('not found', { status: 404 });
  return new Response(new Uint8Array(art.bytes), {
    headers: {
      'Content-Type': art.contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
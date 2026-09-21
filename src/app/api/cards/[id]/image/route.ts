import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePlaceholderSvg } from '@/lib/image-placeholder';

// GET /api/cards/[id]/image — ภาพการ์ดแบบ deterministic SVG (placeholder art)
// ถ้าการ์ดมี imageUrl จากภายนอกแล้ว → redirect ไปใช้ของจริง
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const card = await prisma.cardDefinition.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, nameTh: true, element: true,
      rarity: true, role: true, canonicalSeedHash: true, imageUrl: true,
      atk: true, def: true, hp: true, spd: true, manaCost: true,
      skill1Name: true, skill1Desc: true, skill1ManaCost: true,
      skill2Name: true, skill2Desc: true, skill2ManaCost: true,
      descriptionTh: true, loreTh: true,
    },
  });

  if (!card) {
    const svg = generatePlaceholderSvg({
      cardId: 'unknown', name: '???', element: 'VEILMARKED',
      rarity: 'COMMON', role: 'SUPPORT', canonicalSeedHash: '00',
    });
    return new NextResponse(svg, {
      status: 404,
      headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  // มีภาพจริงจาก AI/external แล้ว (ไม่ใช่ route ของเราเอง) → ส่งต่อ
  if (card.imageUrl && !card.imageUrl.startsWith('/api/cards/')) {
    return NextResponse.redirect(card.imageUrl, 302);
  }

  const svg = generatePlaceholderSvg({
    cardId: card.id,
    name: card.name,
    nameTh: card.nameTh,
    element: card.element,
    rarity: card.rarity,
    role: card.role,
    canonicalSeedHash: card.canonicalSeedHash,
    // ข้อมูลสำหรับพิมพ์ลงในกรอบการ์ด (สกิล/คำอธิบาย/สเตตัส)
    stats: {
      atk: card.atk,
      def: card.def,
      hp: card.hp,
      spd: card.spd,
      manaCost: card.manaCost,
    },
    skills: [
      card.skill1Name && { name: card.skill1Name, description: card.skill1Desc, manaCost: card.skill1ManaCost },
      card.skill2Name && { name: card.skill2Name, description: card.skill2Desc, manaCost: card.skill2ManaCost },
    ].filter(Boolean) as Array<{ name: string; description: string | null; manaCost: number | null }>,
    descriptionTh: card.descriptionTh,
    loreTh: card.loreTh,
  });
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // deterministic → cache ได้ยาว
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
